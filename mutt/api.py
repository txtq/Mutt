"""HTTP API: accounts, settings, galaxies, drawers (planets), files (blocks), connections."""
import json
import os
import random
import re
import secrets
import shutil
import sqlite3
import threading
import time
import urllib.parse
from concurrent.futures import ThreadPoolExecutor

from . import auth, db, kinds, links
from .web import HttpError, file_response, json_response, route, stream_to_file

MAX_UPLOAD = int(float(os.environ.get('MUTT_MAX_UPLOAD_MB', '512')) * 1024 * 1024)
MAX_THUMB = 8 * 1024 * 1024
UNLOCK_TTL = 12 * 60 * 60
ALLOW_SIGNUPS = os.environ.get('MUTT_ALLOW_SIGNUPS', '1').lower() not in ('0', 'false', 'no', 'off')

ICON_RE = re.compile(r'^[0-3]{81}$')
COLOR_RE = re.compile(r'^#[0-9a-fA-F]{6}$')
USERNAME_PATH = r'(?P<username>[a-z0-9][a-z0-9_.-]{0,22}[a-z0-9])'
PALETTE = ['#FF5C39', '#2F6BFF', '#14B86A', '#FFB020', '#A66BFF', '#FF6FB0', '#00B2C6', '#9A6240']
VISIBILITY = ('private', 'pin', 'people', 'public')
PLANET_LOOKS = ('ocean', 'terran', 'gas', 'lava', 'ice', 'desert', 'rock', 'storm')
LAYOUT_REACH = (2000, 4000)  # how far from the void a planet can be put (x, y)

PREF_CHOICES = {
    'size': {'s', 'm', 'l'},
    'motion': {'fluid', 'calm', 'off'},
    'logo': {'wonk', 'editorial', 'stamp', 'wide', 'mono'},
    'sky': {'vita', 'nebula', 'aurora', 'dusk'},
}


def now():
    return time.time()


def ms(t):
    return int(t * 1000) if t else None


def new_id():
    return secrets.token_urlsafe(9)


def text_field(body, key, limit, label, strip=True):
    value = body.get(key)
    if value is None:
        return None
    if not isinstance(value, str):
        raise HttpError(400, f'{label} should be text.')
    value = value.replace('\x00', '')
    if strip:
        value = value.strip()
    if len(value) > limit:
        raise HttpError(400, f'{label} is too long.')
    return value


# ---------------------------------------------------------------- serializers

def user_json(row):
    return {'username': row['username'], 'createdAt': ms(row['created_at'])}


def user_prefs(row):
    try:
        return json.loads(row['prefs'] or '{}')
    except (IndexError, KeyError, ValueError):
        return {}


def drawer_json(row, count=None, previews=None):
    data = {
        'id': row['id'],
        'title': row['title'],
        'description': row['description'],
        'icon': json.loads(row['icon']),
        'createdAt': ms(row['created_at']),
        'updatedAt': ms(row['updated_at']),
        'community': bool(row['community']) if 'community' in row.keys() else False,
        'visibility': row['visibility'] if 'visibility' in row.keys() else 'pin',
        'look': row['look'] if 'look' in row.keys() else None,
        'x': row['x'] if 'x' in row.keys() else None,
        'y': row['y'] if 'y' in row.keys() else None,
    }
    if count is not None:
        data['count'] = count
    if previews is not None:
        data['previews'] = previews
    return data


def block_json(row, mine=True, owner=None):
    keys = row.keys()
    file_url = None
    if row['file_key']:
        file_url = f"/f/{row['id']}/{urllib.parse.quote(row['file_name'] or 'file')}"
    thumb_url = f"/t/{row['id']}?v={row['thumb_key'][:8]}" if row['thumb_key'] else None
    data = {
        'id': row['id'],
        'kind': row['kind'],
        'title': row['title'],
        'description': row['description'],
        'content': row['content'],
        'file': file_url,
        'thumb': thumb_url,
        'fileName': row['file_name'],
        'mime': row['mime'],
        'ext': row['ext'],
        'size': row['size'],
        'width': row['width'],
        'height': row['height'],
        'duration': row['duration'],
        'meta': json.loads(row['meta'] or '{}'),
        'createdAt': ms(row['created_at']),
        'updatedAt': ms(row['updated_at']),
        'mine': mine,
        'sharedAt': ms(row['shared_at']) if 'shared_at' in keys else None,
    }
    if owner:
        data['owner'] = owner
    if 'conn_count' in keys:
        data['connectionCount'] = row['conn_count']
    return data


BLOCK_COLUMNS = 'b.*, (SELECT COUNT(*) FROM connections cc WHERE cc.block_id = b.id) AS conn_count'


# ---------------------------------------------------------------- icons

def default_icon():
    px = [0] * 81

    def put(r, c, v):
        px[r * 9 + c] = v
        px[r * 9 + 8 - c] = v

    for r in range(3, 7):
        for c in range(2, 5):
            put(r, c, 1)
    put(2, 2, 1)
    put(4, 3, 2)
    put(5, 2, 3)
    put(7, 3, 1)
    return {'px': ''.join(map(str, px)), 'c': random.choice(PALETTE)}


def clean_icon(value):
    if value is None:
        return None
    if (not isinstance(value, dict) or not isinstance(value.get('px'), str)
            or not ICON_RE.match(value['px']) or not COLOR_RE.match(str(value.get('c', '')))):
        raise HttpError(400, 'That icon could not be saved.')
    return {'px': value['px'], 'c': value['c'].upper()}


def clean_look(value):
    """A file's colour summary, measured in the browser, used for sorting."""
    if not isinstance(value, dict) or not COLOR_RE.match(str(value.get('hex', ''))):
        raise HttpError(400, 'Could not read that colour.')

    def number(key, high):
        n = value.get(key)
        if isinstance(n, bool) or not isinstance(n, (int, float)) or not 0 <= n <= high:
            raise HttpError(400, 'Could not read that colour.')
        return round(float(n), 3)

    return {'hex': value['hex'].upper(), 'h': number('h', 360), 's': number('s', 1),
            'l': number('l', 1), 'c': number('c', 1)}


# ---------------------------------------------------------------- lookups

def own_drawer(req, drawer_id):
    row = req.db.execute('SELECT * FROM drawers WHERE id = ? AND user_id = ?',
                         (drawer_id, req.user['id'])).fetchone()
    if not row:
        raise HttpError(404, 'That drawer does not exist.')
    return row


def own_block(req, block_id):
    row = req.db.execute(f'SELECT {BLOCK_COLUMNS} FROM blocks b WHERE b.id = ? AND b.user_id = ?',
                         (block_id, req.user['id'])).fetchone()
    if not row:
        raise HttpError(404, 'That file does not exist.')
    return row


def is_unlocked(req, owner_id):
    if owner_id == req.user['id']:
        return True
    return bool(req.db.execute(
        'SELECT 1 FROM unlocks WHERE session_hash = ? AND owner_id = ? AND expires_at > ?',
        (auth.session_key(req.session_token), owner_id, now())).fetchone())


def drawer_visible(req, row):
    """Can the signed-in person look inside this drawer (planet)?"""
    if row['user_id'] == req.user['id'] or row['community']:
        return True
    visibility = row['visibility']
    if visibility == 'public':
        return True
    if visibility == 'people':
        return bool(req.db.execute('SELECT 1 FROM drawer_access WHERE drawer_id = ? AND user_id = ?',
                                   (row['id'], req.user['id'])).fetchone())
    return visibility == 'pin' and is_unlocked(req, row['user_id'])


def writable_drawer(req, drawer_id):
    row = req.db.execute('SELECT * FROM drawers WHERE id = ? AND (user_id = ? OR community = 1)',
                         (drawer_id, req.user['id'])).fetchone()
    if not row:
        raise HttpError(404, 'That drawer does not exist.')
    return row


def in_community_drawer(req, block_id):
    return bool(req.db.execute(
        'SELECT 1 FROM connections c JOIN drawers d ON d.id = c.drawer_id '
        'WHERE c.block_id = ? AND d.community = 1 LIMIT 1', (block_id,)).fetchone())


def readable_block(req, block_id):
    """Your own file, a shared one, or one on a planet you're allowed to see."""
    row = req.db.execute(
        f'SELECT {BLOCK_COLUMNS}, u.username AS owner_name FROM blocks b JOIN users u ON u.id = b.user_id '
        'WHERE b.id = ?', (block_id,)).fetchone()
    if not row:
        raise HttpError(404, 'That file does not exist.')
    if row['user_id'] == req.user['id']:
        return row, True
    if row['shared_at'] or in_community_drawer(req, block_id):
        return row, False
    drawers = req.db.execute('SELECT d.* FROM connections c JOIN drawers d ON d.id = c.drawer_id '
                             'WHERE c.block_id = ?', (block_id,)).fetchall()
    if any(drawer_visible(req, d) for d in drawers):
        return row, False
    raise HttpError(404, 'That file does not exist.')


def reload_block(req, block_id):
    return block_json(own_block(req, block_id))


def block_connections(req, block_id):
    rows = req.db.execute(
        'SELECT d.*, c.position FROM connections c JOIN drawers d ON d.id = c.drawer_id '
        'WHERE c.block_id = ? ORDER BY c.connected_at', (block_id,)).fetchall()
    return [drawer_json(r) for r in rows if drawer_visible(req, r)]


def connect(conn, block_id, drawer_id, position=None):
    if position is None:
        low = conn.execute('SELECT MIN(position) FROM connections WHERE drawer_id = ?', (drawer_id,)).fetchone()[0]
        position = low - 1 if low is not None else 0
    conn.execute('INSERT OR IGNORE INTO connections (block_id, drawer_id, position, connected_at) '
                 'VALUES (?, ?, ?, ?)', (block_id, drawer_id, position, now()))
    conn.execute('UPDATE drawers SET updated_at = ? WHERE id = ?', (now(), drawer_id))


def remove_block_files(user_id, *keys):
    folder = db.user_files_dir(user_id)
    for key in keys:
        if key:
            try:
                os.remove(os.path.join(folder, key))
            except FileNotFoundError:
                pass


def insert_block(req, **fields):
    block_id = new_id()
    stamp = now()
    fields.setdefault('meta', {})
    fields['meta'] = json.dumps(fields['meta'], ensure_ascii=False)
    columns = ['id', 'user_id', 'created_at', 'updated_at', *fields]
    values = [block_id, req.user['id'], stamp, stamp, *fields.values()]
    req.db.execute(f'INSERT INTO blocks ({", ".join(columns)}) VALUES ({", ".join("?" * len(columns))})', values)
    return block_id


def target_drawer(req, drawer_id):
    if not drawer_id:
        return None
    return writable_drawer(req, drawer_id)['id']


def saved_from_ids(req):
    return {r[0] for r in req.db.execute(
        "SELECT json_extract(meta, '$.savedFrom.id') FROM blocks "
        "WHERE user_id = ? AND json_extract(meta, '$.savedFrom.id') IS NOT NULL", (req.user['id'],))}


def mark_saved(req, blocks):
    saved = saved_from_ids(req)
    for b in blocks:
        if not b['mine']:
            b['saved'] = b['id'] in saved
    return blocks


def link_file(from_user, to_user, key):
    """Give `to_user` their own name for a stored file without copying the bytes."""
    if not key:
        return None
    src = os.path.join(db.user_files_dir(from_user), key)
    ext = key.rsplit('.', 1)[-1] if '.' in key else ''
    new_key = ('t_' if key.startswith('t_') else '') + secrets.token_hex(12) + (f'.{ext}' if ext else '')
    dst = os.path.join(db.user_files_dir(to_user), new_key)
    try:
        os.link(src, dst)
    except FileNotFoundError:
        return None
    except OSError:
        shutil.copyfile(src, dst)
    return new_key


def user_stats(conn, user_id):
    files = conn.execute('SELECT COUNT(*) FROM blocks WHERE user_id = ?', (user_id,)).fetchone()[0]
    drawers = conn.execute('SELECT COUNT(*) FROM drawers WHERE user_id = ?', (user_id,)).fetchone()[0]
    stars = conn.execute(
        'SELECT COUNT(*) FROM blocks b WHERE b.user_id = ? AND NOT EXISTS '
        '(SELECT 1 FROM connections c WHERE c.block_id = b.id)', (user_id,)).fetchone()[0]
    return {'files': files, 'drawers': drawers, 'stars': stars}


# ---------------------------------------------------------------- health

@route('GET', r'/api/health', auth=False)
def health(req):
    req.db.execute('SELECT 1').fetchone()
    return json_response({'ok': True, 'persistentStorage': db.PERSISTENT})


# ---------------------------------------------------------------- accounts

@route('GET', r'/api/me', auth=False)
def me(req):
    if not req.user:
        raise HttpError(401, 'Please sign in.', signups=ALLOW_SIGNUPS)
    return json_response({'user': user_json(req.user), 'prefs': user_prefs(req.user),
                          'stats': user_stats(req.db, req.user['id'])})


@route('GET', r'/api/auth/available', auth=False)
def username_available(req):
    name = auth.normalize_username(req.arg('username'))
    problem = auth.username_problem(name)
    if not problem and req.db.execute('SELECT 1 FROM users WHERE username = ?', (name,)).fetchone():
        problem = 'That username is taken.'
    return json_response({'available': not problem, 'reason': problem})


@route('POST', r'/api/auth/signup', auth=False)
def signup(req):
    if not ALLOW_SIGNUPS:
        raise HttpError(403, 'New accounts are turned off here.')
    ip = req.client_ip
    wait = auth.signups_by_ip.retry_after(ip)
    if wait:
        raise HttpError(429, 'Too many new accounts from here. Try again later.', retryAfter=wait)
    body = req.json()
    username = auth.normalize_username(body.get('username'))
    problem = auth.username_problem(username)
    if problem:
        raise HttpError(400, problem)
    pin = str(body.get('pin') or '')
    if not auth.PIN_RE.match(pin):
        raise HttpError(400, 'Your code needs to be 4 digits.')
    pin_hash, salt = auth.new_pin_hash(pin)
    try:
        with db.transaction(req.db):
            cursor = req.db.execute(
                'INSERT INTO users (username, pin_hash, pin_salt, created_at) VALUES (?, ?, ?, ?)',
                (username, pin_hash, salt, now()))
            token = auth.create_session(req.db, cursor.lastrowid)
    except sqlite3.IntegrityError:
        raise HttpError(409, 'That username is taken.')
    auth.signups_by_ip.hit(ip)
    user = req.db.execute('SELECT * FROM users WHERE id = ?', (cursor.lastrowid,)).fetchone()
    return json_response({'user': user_json(user), 'prefs': {}, 'stats': {'files': 0, 'drawers': 0}},
                         headers=[auth.cookie_header(req, token)])


def pin_gate(req, user, pin, wrong_status=401):
    """Raise unless `pin` opens `user`'s account (counting toward its lockout).

    Unlocking someone else's drawers passes 403 for a wrong code, because a
    401 means *your* session has ended and would sign you out.
    """
    ip = req.client_ip
    wait = auth.login_failures_by_ip.retry_after(ip)
    if wait:
        raise HttpError(429, f'Too many tries. Wait {auth.format_wait(wait)} and try again.', retryAfter=wait)
    if not auth.PIN_RE.match(pin):
        raise HttpError(400, 'Codes are 4 digits.')
    failure = auth.try_pin(req.db, user, pin, ip)
    if failure:
        status, message, extra = failure
        raise HttpError(wrong_status if status == 401 else status, message, **extra)


@route('POST', r'/api/auth/login', auth=False)
def login(req):
    body = req.json()
    username = auth.normalize_username(body.get('username'))
    pin = str(body.get('pin') or '')
    user = req.db.execute('SELECT * FROM users WHERE username = ?', (username,)).fetchone()
    if not user:
        wait = auth.login_failures_by_ip.retry_after(req.client_ip)
        if wait:
            raise HttpError(429, f'Too many tries. Wait {auth.format_wait(wait)} and try again.', retryAfter=wait)
        auth.burn_time(pin)
        auth.login_failures_by_ip.hit(req.client_ip)
        raise HttpError(401, "That username and code don't match.")
    try:
        pin_gate(req, user, pin)
    except HttpError as err:
        if err.status == 401:
            err.message = "That username and code don't match."
        raise
    token = auth.create_session(req.db, user['id'])
    if random.random() < 0.05:
        auth.prune_sessions(req.db)
    return json_response({'user': user_json(user), 'prefs': user_prefs(user),
                          'stats': user_stats(req.db, user['id'])},
                         headers=[auth.cookie_header(req, token)])


@route('POST', r'/api/auth/logout', auth=False)
def logout(req):
    if req.session_token:
        req.db.execute('DELETE FROM unlocks WHERE session_hash = ?', (auth.session_key(req.session_token),))
    auth.end_session(req.db, req.session_token)
    return json_response({'ok': True}, headers=[auth.clear_cookie_header(req)])


def require_pin(req, pin, label='code'):
    if not auth.PIN_RE.match(pin or '') or not auth.check_pin(pin, req.user['pin_salt'], req.user['pin_hash']):
        auth.login_failures_by_ip.hit(req.client_ip)
        raise HttpError(403, f'That {label} is not right.')


@route('POST', r'/api/me/pin')
def change_pin(req):
    body = req.json()
    if auth.login_failures_by_ip.retry_after(req.client_ip):
        raise HttpError(429, 'Too many tries. Wait a few minutes.')
    require_pin(req, str(body.get('current') or ''), 'current code')
    new_pin = str(body.get('next') or '')
    if not auth.PIN_RE.match(new_pin):
        raise HttpError(400, 'Your new code needs to be 4 digits.')
    pin_hash, salt = auth.new_pin_hash(new_pin)
    req.db.execute('UPDATE users SET pin_hash = ?, pin_salt = ? WHERE id = ?', (pin_hash, salt, req.user['id']))
    auth.end_other_sessions(req.db, req.user['id'], req.session_token)
    # Anyone who unlocked your drawers with the old code loses access.
    req.db.execute('DELETE FROM unlocks WHERE owner_id = ?', (req.user['id'],))
    return json_response({'ok': True})


@route('POST', r'/api/me/delete')
def delete_account(req):
    body = req.json()
    if auth.login_failures_by_ip.retry_after(req.client_ip):
        raise HttpError(429, 'Too many tries. Wait a few minutes.')
    require_pin(req, str(body.get('pin') or ''))
    user_id = req.user['id']
    req.db.execute('DELETE FROM users WHERE id = ?', (user_id,))
    shutil.rmtree(os.path.join(db.FILES_DIR, str(int(user_id))), ignore_errors=True)
    return json_response({'ok': True}, headers=[auth.clear_cookie_header(req)])


# ---------------------------------------------------------------- look & feel

def save_prefs(req, prefs):
    req.db.execute('UPDATE users SET prefs = ? WHERE id = ?', (json.dumps(prefs), req.user['id']))
    return prefs


@route('POST', r'/api/me/prefs')
def update_prefs(req):
    body = req.json()
    prefs = user_prefs(req.user)
    prefs.pop('mode', None)  # light mode is gone
    for key, allowed in PREF_CHOICES.items():
        if key in body:
            if body[key] not in allowed:
                raise HttpError(400, 'That setting could not be saved.')
            prefs[key] = body[key]
    if 'autosort' in body:
        prefs['autosort'] = bool(body['autosort'])
    return json_response({'prefs': save_prefs(req, prefs)})


# ---------------------------------------------------------------- users

def find_user(req, username):
    row = req.db.execute('SELECT * FROM users WHERE username = ?', (username,)).fetchone()
    if not row:
        raise HttpError(404, 'That person does not exist.')
    return row


def drawer_previews(req, drawer_id, limit=8, owner=None):
    rows = req.db.execute(
        'SELECT b.*, u.username AS owner_name FROM connections c JOIN blocks b ON b.id = c.block_id '
        'JOIN users u ON u.id = b.user_id '
        'WHERE c.drawer_id = ? ORDER BY c.position, c.connected_at DESC LIMIT ?', (drawer_id, limit)).fetchall()
    me_id = req.user['id']
    return [block_json(r, mine=r['user_id'] == me_id, owner=None if r['user_id'] == me_id else r['owner_name'])
            for r in rows]


def blocks_in_drawer(req, drawer_id, community=False):
    rows = req.db.execute(
        f'SELECT {BLOCK_COLUMNS}, u.username AS owner_name FROM connections c JOIN blocks b ON b.id = c.block_id '
        'JOIN users u ON u.id = b.user_id '
        'WHERE c.drawer_id = ? ORDER BY c.position, c.connected_at DESC', (drawer_id,)).fetchall()
    me_id = req.user['id']
    blocks = []
    for r in rows:
        b = block_json(r, mine=r['user_id'] == me_id, owner=None if r['user_id'] == me_id else r['owner_name'])
        if community and not b['mine']:
            b['community'] = True
        blocks.append(b)
    return mark_saved(req, blocks)


def drawers_of(req, user_id, with_previews, owner=None):
    rows = req.db.execute(
        'SELECT d.*, (SELECT COUNT(*) FROM connections c WHERE c.drawer_id = d.id) AS n '
        'FROM drawers d WHERE d.user_id = ? ORDER BY d.updated_at DESC', (user_id,)).fetchall()
    return [drawer_json(r, r['n'], drawer_previews(req, r['id'], owner=owner) if with_previews else None)
            for r in rows]


# ---------------------------------------------------------------- galaxies

def planet_people(req, drawer_id):
    return [r[0] for r in req.db.execute(
        'SELECT u.username FROM drawer_access a JOIN users u ON u.id = a.user_id '
        'WHERE a.drawer_id = ? ORDER BY u.username', (drawer_id,))]


def planet_json(req, row, count, previews=None, locked=False):
    data = drawer_json(row, count, previews)
    data['mine'] = row['user_id'] == req.user['id']
    if data['mine'] and row['visibility'] == 'people':
        data['people'] = planet_people(req, row['id'])
    if locked:
        data['locked'] = True
        data['description'] = ''
    return data


def galaxy_of(req, owner):
    """Someone's planets as you're allowed to see them, plus your own loose stars."""
    mine = owner['id'] == req.user['id']
    rows = req.db.execute(
        'SELECT d.*, (SELECT COUNT(*) FROM connections c WHERE c.drawer_id = d.id) AS n '
        'FROM drawers d WHERE d.user_id = ? ORDER BY d.created_at', (owner['id'],)).fetchall()
    planets = []
    for r in rows:
        if mine or drawer_visible(req, r):
            planets.append(planet_json(req, r, r['n'], drawer_previews(req, r['id'], limit=12)))
        elif r['visibility'] == 'pin':
            planets.append(planet_json(req, r, r['n'], locked=True))
        # Private planets, and people-only ones you're not on, stay out of sight.
    data = {
        'user': {**user_json(owner), 'you': mine},
        'planets': planets,
        'unlocked': is_unlocked(req, owner['id']),
    }
    if mine:
        stars = req.db.execute(
            f'SELECT {BLOCK_COLUMNS} FROM blocks b WHERE b.user_id = ? AND NOT EXISTS '
            '(SELECT 1 FROM connections c WHERE c.block_id = b.id) ORDER BY b.created_at DESC LIMIT 3000',
            (owner['id'],)).fetchall()
        data['stars'] = [block_json(r) for r in stars]
        data['stats'] = user_stats(req.db, owner['id'])
    return data


@route('GET', r'/api/galaxy')
def my_galaxy(req):
    return json_response(galaxy_of(req, req.user))


@route('GET', r'/api/galaxy/' + USERNAME_PATH)
def get_galaxy(req, username):
    return json_response(galaxy_of(req, find_user(req, username)))


@route('POST', r'/api/galaxy/' + USERNAME_PATH + r'/unlock')
def unlock_galaxy(req, username):
    owner = find_user(req, username)
    if owner['id'] != req.user['id']:
        pin_gate(req, owner, str(req.json().get('pin') or ''), wrong_status=403)
        req.db.execute('INSERT OR REPLACE INTO unlocks (session_hash, owner_id, expires_at) VALUES (?, ?, ?)',
                       (auth.session_key(req.session_token), owner['id'], now() + UNLOCK_TTL))
    return json_response(galaxy_of(req, owner))


@route('PUT', r'/api/galaxy/layout')
def save_layout(req):
    """Where you've put your planets. `reset` sends them all back to being
    placed for you."""
    body = req.json()
    if body.get('reset'):
        req.db.execute('UPDATE drawers SET x = NULL, y = NULL WHERE user_id = ?', (req.user['id'],))
        return json_response({'ok': True})
    spots = body.get('planets')
    if not isinstance(spots, list) or not spots or len(spots) > 2000:
        raise HttpError(400, 'Could not save where your planets are.')
    rows = []
    for spot in spots:
        if not isinstance(spot, dict):
            raise HttpError(400, 'Could not save where your planets are.')
        xy = []
        for key, reach in zip(('x', 'y'), LAYOUT_REACH):
            n = spot.get(key)
            if isinstance(n, bool) or not isinstance(n, (int, float)) or n != n or n in (float('inf'), float('-inf')):
                raise HttpError(400, 'Could not save where your planets are.')
            xy.append(round(max(-reach, min(reach, float(n))), 1))
        rows.append((*xy, str(spot.get('id') or ''), req.user['id']))
    with db.transaction(req.db):
        for row in rows:
            if not req.db.execute('UPDATE drawers SET x = ?, y = ? WHERE id = ? AND user_id = ?', row).rowcount:
                raise HttpError(404, 'One of those planets is not yours.')
    return json_response({'ok': True})


@route('GET', r'/api/galaxies')
def list_galaxies(req):
    """The universe: everyone with something you could look at. You come
    first, then people whose planets are open to you, then the ones you'd
    need a code for, each A to Z."""
    users = req.db.execute('SELECT * FROM users ORDER BY username').fetchall()
    out = []
    for user in users:
        mine = user['id'] == req.user['id']
        rows = req.db.execute(
            'SELECT d.*, (SELECT COUNT(*) FROM connections c WHERE c.drawer_id = d.id) AS n '
            'FROM drawers d WHERE d.user_id = ? ORDER BY d.created_at', (user['id'],)).fetchall()
        worlds = []
        for r in rows:
            open_ = mine or drawer_visible(req, r)
            if open_ or r['visibility'] == 'pin':
                worlds.append({'id': r['id'], 'c': json.loads(r['icon']).get('c'), 'n': r['n'], 'locked': not open_,
                               'look': r['look'], 'x': r['x'], 'y': r['y']})
        if not worlds and not mine:
            continue
        opened = [w for w in worlds if not w['locked']]
        out.append({
            'username': user['username'], 'you': mine, 'planets': len(worlds),
            'files': sum(w['n'] for w in opened), 'open': len(opened),
            'locked': bool(worlds) and not opened,
            'worlds': worlds[:16],
        })
    out.sort(key=lambda g: (not g['you'], g['locked'], g['username']))
    return json_response({'galaxies': out})


# ---------------------------------------------------------------- drawers

@route('GET', r'/api/drawers')
def list_drawers(req):
    lite = req.arg('lite') == '1'
    drawers = drawers_of(req, req.user['id'], not lite)
    if req.arg('community') == '1':
        others = req.db.execute(
            'SELECT d.*, u.username AS owner_name, (SELECT COUNT(*) FROM connections c WHERE c.drawer_id = d.id) AS n '
            'FROM drawers d JOIN users u ON u.id = d.user_id WHERE d.community = 1 AND d.user_id != ? '
            'ORDER BY d.updated_at DESC', (req.user['id'],)).fetchall()
        drawers += [{**drawer_json(r, r['n']), 'owner': r['owner_name']} for r in others]
    stats = user_stats(req.db, req.user['id'])
    return json_response({'drawers': drawers, 'totalBlocks': stats['files'], 'stats': stats})


@route('POST', r'/api/drawers')
def create_drawer(req):
    body = req.json()
    title = text_field(body, 'title', 80, 'Drawer name') or ''
    if not title:
        raise HttpError(400, 'Give your drawer a name.')
    description = text_field(body, 'description', 2000, 'Description') or ''
    icon = clean_icon(body.get('icon')) or default_icon()
    block_ids = body.get('blockIds') or []
    if not isinstance(block_ids, list) or len(block_ids) > 10000:
        raise HttpError(400, 'Could not add those files.')
    visibility = body.get('visibility') or 'pin'
    if visibility not in VISIBILITY:
        raise HttpError(400, 'That sharing setting could not be saved.')
    drawer_id = new_id()
    stamp = now()
    with db.transaction(req.db):
        req.db.execute(
            'INSERT INTO drawers (id, user_id, title, description, icon, created_at, updated_at, community, visibility) '
            'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            (drawer_id, req.user['id'], title, description, json.dumps(icon), stamp, stamp,
             1 if body.get('community') else 0, visibility))
        position = 0
        for block_id in block_ids:
            owned = req.db.execute('SELECT 1 FROM blocks WHERE id = ? AND user_id = ?',
                                   (str(block_id), req.user['id'])).fetchone()
            if owned:
                req.db.execute('INSERT OR IGNORE INTO connections (block_id, drawer_id, position, connected_at) '
                               'VALUES (?, ?, ?, ?)', (str(block_id), drawer_id, position, stamp))
                position += 1
    row = own_drawer(req, drawer_id)
    return json_response({'drawer': planet_json(req, row, position, [])}, status=201)


@route('GET', r'/api/drawers/(?P<drawer_id>[\w-]+)')
def get_drawer(req, drawer_id):
    row = req.db.execute('SELECT d.*, u.username AS owner_name FROM drawers d JOIN users u ON u.id = d.user_id '
                         'WHERE d.id = ?', (drawer_id,)).fetchone()
    if not row or not drawer_visible(req, row):
        if row and row['visibility'] == 'pin':
            count = req.db.execute('SELECT COUNT(*) FROM connections WHERE drawer_id = ?', (drawer_id,)).fetchone()[0]
            raise HttpError(403, 'Locked.', locked=True, owner=row['owner_name'],
                            drawer=planet_json(req, row, count, locked=True))
        raise HttpError(404, 'That planet does not exist.')
    blocks = blocks_in_drawer(req, drawer_id, community=bool(row['community']))
    drawer = planet_json(req, row, len(blocks))
    if not drawer['mine']:
        drawer['owner'] = row['owner_name']
    return json_response({'drawer': drawer, 'blocks': blocks})


@route('PATCH', r'/api/drawers/(?P<drawer_id>[\w-]+)')
def update_drawer(req, drawer_id):
    own_drawer(req, drawer_id)
    body = req.json()
    updates = {}
    title = text_field(body, 'title', 80, 'Drawer name')
    if title is not None:
        if not title:
            raise HttpError(400, 'Give your drawer a name.')
        updates['title'] = title
    description = text_field(body, 'description', 2000, 'Description')
    if description is not None:
        updates['description'] = description
    icon = clean_icon(body.get('icon'))
    if icon:
        updates['icon'] = json.dumps(icon)
    if 'visibility' in body:
        if body['visibility'] not in VISIBILITY:
            raise HttpError(400, 'That sharing setting could not be saved.')
        updates['visibility'] = body['visibility']
    if 'look' in body:
        if body['look'] is not None and body['look'] not in PLANET_LOOKS:
            raise HttpError(400, 'That kind of planet does not exist.')
        updates['look'] = body['look']
    if 'people' in body:
        set_planet_people(req, drawer_id, body['people'])
    if 'community' in body:
        updates['community'] = 1 if body['community'] else 0
        if not body['community']:
            # Back to private: other people's files leave with them.
            req.db.execute('DELETE FROM connections WHERE drawer_id = ? AND block_id IN '
                           '(SELECT id FROM blocks WHERE user_id != ?)', (drawer_id, req.user['id']))
    if updates:
        updates['updated_at'] = now()
        assignments = ', '.join(f'{k} = ?' for k in updates)
        req.db.execute(f'UPDATE drawers SET {assignments} WHERE id = ?', (*updates.values(), drawer_id))
    row = own_drawer(req, drawer_id)
    count = req.db.execute('SELECT COUNT(*) FROM connections WHERE drawer_id = ?', (drawer_id,)).fetchone()[0]
    return json_response({'drawer': planet_json(req, row, count)})


def set_planet_people(req, drawer_id, names):
    if not isinstance(names, list) or len(names) > 200:
        raise HttpError(400, 'Could not save those people.')
    ids = set()
    for name in names:
        username = auth.normalize_username(name if isinstance(name, str) else '')
        user = req.db.execute('SELECT id FROM users WHERE username = ?', (username,)).fetchone()
        if not user:
            raise HttpError(400, f'No one here is called @{username or name}.')
        if user['id'] != req.user['id']:
            ids.add(user['id'])
    with db.transaction(req.db):
        req.db.execute('DELETE FROM drawer_access WHERE drawer_id = ?', (drawer_id,))
        for user_id in ids:
            req.db.execute('INSERT INTO drawer_access (drawer_id, user_id) VALUES (?, ?)', (drawer_id, user_id))


ORPHANS_SQL = (
    'SELECT b.id, b.file_key, b.thumb_key FROM connections c JOIN blocks b ON b.id = c.block_id '
    'WHERE c.drawer_id = ? AND b.user_id = ? AND (SELECT COUNT(*) FROM connections c2 WHERE c2.block_id = b.id) = 1')


@route('GET', r'/api/drawers/(?P<drawer_id>[\w-]+)/orphans')
def drawer_orphans(req, drawer_id):
    own_drawer(req, drawer_id)
    return json_response({'count': len(req.db.execute(ORPHANS_SQL, (drawer_id, req.user['id'])).fetchall())})


@route('DELETE', r'/api/drawers/(?P<drawer_id>[\w-]+)')
def delete_drawer(req, drawer_id):
    own_drawer(req, drawer_id)
    orphans = req.db.execute(ORPHANS_SQL, (drawer_id, req.user['id'])).fetchall() if req.arg('blocks') == 'orphans' else []
    with db.transaction(req.db):
        for orphan in orphans:
            req.db.execute('DELETE FROM blocks WHERE id = ?', (orphan['id'],))
        req.db.execute('DELETE FROM drawers WHERE id = ?', (drawer_id,))
    for orphan in orphans:
        remove_block_files(req.user['id'], orphan['file_key'], orphan['thumb_key'])
    return json_response({'ok': True, 'deletedBlocks': len(orphans)})


@route('PUT', r'/api/drawers/(?P<drawer_id>[\w-]+)/order')
def reorder_drawer(req, drawer_id):
    own_drawer(req, drawer_id)
    wanted = req.json().get('ids')
    if not isinstance(wanted, list):
        raise HttpError(400, 'Could not save that order.')
    current = [r[0] for r in req.db.execute(
        'SELECT block_id FROM connections WHERE drawer_id = ? ORDER BY position, connected_at DESC', (drawer_id,))]
    present = set(current)
    seen = set()
    order = []
    for block_id in wanted:
        if isinstance(block_id, str) and block_id in present and block_id not in seen:
            order.append(block_id)
            seen.add(block_id)
    order += [b for b in current if b not in seen]
    with db.transaction(req.db):
        for index, block_id in enumerate(order):
            req.db.execute('UPDATE connections SET position = ? WHERE drawer_id = ? AND block_id = ?',
                           (index, drawer_id, block_id))
        req.db.execute('UPDATE drawers SET updated_at = ? WHERE id = ?', (now(), drawer_id))
    return json_response({'ok': True})


# ---------------------------------------------------------------- autosort

KIND_GROUPS = {'image': 'Images', 'video': 'Videos', 'audio': 'Sounds', 'pdf': 'Reading', 'doc': 'Reading',
               'link': 'Links', 'text': 'Notes', 'code': 'Code', 'archive': 'Files', 'other': 'Files'}
WORD_RE = re.compile(r'[a-z0-9]+')
STOP_WORDS = set("""
the and for with from that this your you are was were but not all any can had her his its our out has have
into about over just what when where which who why how com www http https net org html htm php
jpg jpeg png gif webp heic mov mp4 pdf doc docx txt img image screenshot screen shot copy untitled final new
""".split())


def words(text):
    found = set()
    for word in WORD_RE.findall((text or '').lower()):
        if len(word) < 3 or word.isdigit() or word in STOP_WORDS:
            continue
        found.add(word[:-1] if len(word) > 3 and word.endswith('s') else word)
    return found


def pick_planet(req, block):
    """Where a new file most likely belongs: (drawer id, created?)."""
    uid = req.user['id']
    group = KIND_GROUPS.get(block['kind'], 'Files')
    meta = json.loads(block['meta'] or '{}')
    about = words(' '.join([block['title'] or '', (block['content'] or '')[:300] if block['kind'] == 'text' else '',
                            meta.get('domain') or '', meta.get('siteName') or '']))
    planets = req.db.execute('SELECT id, title FROM drawers WHERE user_id = ? ORDER BY updated_at DESC',
                             (uid,)).fetchall()
    # 1. A planet named after something in the file.
    best, best_score = None, 0
    for planet in planets:
        score = len(about & words(planet['title']))
        if score > best_score:
            best, best_score = planet['id'], score
    if best:
        return best, False
    # 2. A planet named after its kind ("Images", "Links"…).
    for planet in planets:
        if planet['title'].strip().lower() == group.lower():
            return planet['id'], False
    # 3. A planet that's mostly this kind of thing already.
    tally = {}
    for row in req.db.execute('SELECT c.drawer_id, b.kind FROM connections c JOIN blocks b ON b.id = c.block_id '
                              'JOIN drawers d ON d.id = c.drawer_id WHERE d.user_id = ?', (uid,)):
        total, same = tally.get(row['drawer_id'], (0, 0))
        tally[row['drawer_id']] = (total + 1, same + (KIND_GROUPS.get(row['kind']) == group))
    fits = [(same / total, total, drawer_id) for drawer_id, (total, same) in tally.items()
            if total >= 3 and same / total >= 0.6]
    if fits:
        return max(fits)[2], False
    return None, True


def autosort(req, block_id, icon=None):
    """File a new block onto a planet, making one if nothing fits."""
    block = own_block(req, block_id)
    drawer_id, created = pick_planet(req, block)
    if created:
        drawer_id = new_id()
        stamp = now()
        req.db.execute(
            'INSERT INTO drawers (id, user_id, title, description, icon, created_at, updated_at, community, visibility) '
            "VALUES (?, ?, ?, '', ?, ?, ?, 0, 'pin')",
            (drawer_id, req.user['id'], KIND_GROUPS.get(block['kind'], 'Files'),
             json.dumps(icon or default_icon()), stamp, stamp))
    connect(req.db, block_id, drawer_id)
    row = own_drawer(req, drawer_id)
    count = req.db.execute('SELECT COUNT(*) FROM connections WHERE drawer_id = ?', (drawer_id,)).fetchone()[0]
    return {'planet': planet_json(req, row, count, drawer_previews(req, drawer_id, limit=12)), 'created': created}


def icon_arg(value):
    try:
        return clean_icon(json.loads(value) if isinstance(value, str) else value)
    except (HttpError, ValueError):
        return None


# ---------------------------------------------------------------- files (blocks)


def save_thumb(req, block_id, data, ext):
    key = f't_{secrets.token_hex(10)}.{ext}'
    with open(os.path.join(db.user_files_dir(req.user['id']), key), 'wb') as f:
        f.write(data)
    old = req.db.execute('SELECT thumb_key FROM blocks WHERE id = ?', (block_id,)).fetchone()
    req.db.execute('UPDATE blocks SET thumb_key = ?, updated_at = ? WHERE id = ?', (key, now(), block_id))
    if old and old['thumb_key']:
        remove_block_files(req.user['id'], old['thumb_key'])


# ---------------------------------------------------------------- link screenshots

# Pictures of linked pages are taken in the background, a few at a time.
_shooter = ThreadPoolExecutor(max_workers=3, thread_name_prefix='shot')
_shooting = set()
_shooting_lock = threading.Lock()


def wants_screenshot(meta):
    return not meta.get('embed')  # players (YouTube, Vimeo) bring their own


def start_screenshot(user_id, block_id, url):
    with _shooting_lock:
        if block_id in _shooting:
            return
        _shooting.add(block_id)
    _shooter.submit(_take_screenshot, user_id, block_id, url)


def _take_screenshot(user_id, block_id, url):
    try:
        found = links.screenshot(url)
        key = None
        if found:
            data, ext = found
            key = f't_{secrets.token_hex(10)}.{ext}'
            with open(os.path.join(db.user_files_dir(user_id), key), 'wb') as f:
                f.write(data)
        conn = db.connect()
        try:
            row = conn.execute('SELECT thumb_key, meta FROM blocks WHERE id = ? AND user_id = ?',
                               (block_id, user_id)).fetchone()
            if not row:  # deleted while the picture was being taken
                if key:
                    remove_block_files(user_id, key)
                return
            meta = json.loads(row['meta'] or '{}')
            meta['shot'] = 'done' if key else 'none'
            meta['shotAt'] = int(time.time() * 1000)
            if key:
                meta.pop('look', None)  # colours came from the old preview
                conn.execute('UPDATE blocks SET thumb_key = ?, meta = ? WHERE id = ?',
                             (key, json.dumps(meta, ensure_ascii=False), block_id))
                if row['thumb_key']:
                    remove_block_files(user_id, row['thumb_key'])
            else:
                conn.execute('UPDATE blocks SET meta = ? WHERE id = ?', (json.dumps(meta, ensure_ascii=False), block_id))
        finally:
            conn.close()
    except Exception:
        pass
    finally:
        with _shooting_lock:
            _shooting.discard(block_id)


@route('POST', r'/api/blocks/(?P<block_id>[\w-]+)/preview')
def refresh_preview(req, block_id):
    """Links added before screenshots existed (or whose picture got stuck) ask here."""
    row = own_block(req, block_id)
    meta = json.loads(row['meta'] or '{}')
    tried_lately = meta.get('shot') == 'none' and time.time() * 1000 - meta.get('shotAt', 0) < 6 * 3600 * 1000
    if row['kind'] == 'link' and wants_screenshot(meta) and meta.get('shot') != 'done' and not tried_lately:
        meta['shot'] = 'pending'
        req.db.execute('UPDATE blocks SET meta = ? WHERE id = ?', (json.dumps(meta, ensure_ascii=False), block_id))
        start_screenshot(req.user['id'], block_id, row['content'])
    return json_response({'block': reload_block(req, block_id)})


@route('POST', r'/api/blocks')
def create_block(req):
    body = req.json()
    content = text_field(body, 'content', 200_000, 'Text', strip=False) or ''
    title = text_field(body, 'title', 200, 'Title') or ''
    drawer_id = target_drawer(req, body.get('drawer'))
    shared = {'shared_at': now()} if body.get('share') else {}
    stripped = content.strip()
    if not stripped:
        raise HttpError(400, 'Type something first.')

    if links.is_url(stripped):
        info, preview, direct = links.inspect(stripped)
        if direct:
            data, ext, mime = direct
            name = os.path.basename(urllib.parse.urlsplit(stripped).path) or f'image.{ext}'
            name = re.sub(r'[\\/\x00-\x1f]', '', urllib.parse.unquote(name))[:180] or f'image.{ext}'
            if not name.lower().endswith('.' + ext) and not kinds.extension(name):
                name += '.' + ext
            key = f'{secrets.token_hex(12)}.{ext}'
            with open(os.path.join(db.user_files_dir(req.user['id']), key), 'wb') as f:
                f.write(data)
            block_id = insert_block(req, kind='image', title=title or name, file_key=key, file_name=name,
                                    mime=mime, ext=ext, size=len(data),
                                    meta={'source': stripped, 'domain': info.get('domain')}, **shared)
        else:
            shoot = wants_screenshot(info)
            if shoot:
                info['shot'] = 'pending'
            block_id = insert_block(req, kind='link', title=title or info.get('title') or stripped,
                                    content=stripped, meta=info, **shared)
            if preview:
                save_thumb(req, block_id, *preview)
            if shoot:
                start_screenshot(req.user['id'], block_id, stripped)
    else:
        block_id = insert_block(req, kind='text', title=title, content=content.strip('\n'), **shared)

    sorted_into = None
    if drawer_id:
        connect(req.db, block_id, drawer_id)
    elif body.get('autosort'):
        sorted_into = autosort(req, block_id, icon_arg(body.get('icon')))
    return json_response({'block': reload_block(req, block_id), 'sortedInto': sorted_into}, status=201)


@route('POST', r'/api/upload')
def upload(req):
    drawer_id = target_drawer(req, req.arg('drawer'))
    name = re.sub(r'[\\/\x00-\x1f\x7f]', '', req.arg('name') or '').strip()[:180] or 'Untitled'
    ext = kinds.extension(name)
    mime = kinds.clean_mime(req.header('Content-Type'), name)
    kind = kinds.detect(mime, ext)
    key = secrets.token_hex(12) + (f'.{ext}' if ext else '')
    path = os.path.join(db.user_files_dir(req.user['id']), key)
    size = stream_to_file(req, path, MAX_UPLOAD)

    meta = {}
    if ext in kinds.TEXTY and size:
        with open(path, 'rb') as f:
            head = f.read(8192).decode('utf-8', 'replace').replace('\x00', '')
        meta['excerpt'] = head[:1800]
    title = os.path.splitext(name)[0] if ext else name
    shared = {'shared_at': now()} if req.arg('share') == '1' else {}
    block_id = insert_block(req, kind=kind, title=title[:200], file_key=key, file_name=name,
                            mime=mime, ext=ext, size=size, meta=meta, **shared)
    sorted_into = None
    if drawer_id:
        connect(req.db, block_id, drawer_id)
    elif req.arg('autosort') == '1':
        sorted_into = autosort(req, block_id, icon_arg(req.arg('icon')))
    return json_response({'block': reload_block(req, block_id), 'sortedInto': sorted_into}, status=201)


def int_arg(value, low, high):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if low <= number <= high else None


@route('POST', r'/api/blocks/(?P<block_id>[\w-]+)/thumb')
def upload_thumb(req, block_id):
    row = own_block(req, block_id)
    data = req.read_bytes(MAX_THUMB)
    ext, _ = kinds.thumb_type(data)
    if not ext:
        raise HttpError(400, 'Thumbnails need to be an image.')
    save_thumb(req, block_id, data, ext)
    width, height = int_arg(req.arg('w'), 1, 100000), int_arg(req.arg('h'), 1, 100000)
    duration = int_arg(req.arg('d'), 0, 10 ** 7)
    pages = int_arg(req.arg('pages'), 1, 100000)
    meta = json.loads(row['meta'] or '{}')
    meta.pop('look', None)  # the picture changed, so its colours need measuring again
    if pages:
        meta['pages'] = int(pages)
    req.db.execute('UPDATE blocks SET width = COALESCE(?, width), height = COALESCE(?, height), '
                   'duration = COALESCE(?, duration), meta = ? WHERE id = ?',
                   (int(width) if width else None, int(height) if height else None, duration,
                    json.dumps(meta, ensure_ascii=False), block_id))
    return json_response({'block': reload_block(req, block_id)})


@route('POST', r'/api/blocks/(?P<block_id>[\w-]+)/share')
def share_block(req, block_id):
    own_block(req, block_id)
    shared = bool(req.json().get('shared'))
    req.db.execute('UPDATE blocks SET shared_at = ? WHERE id = ?', (now() if shared else None, block_id))
    return json_response({'block': reload_block(req, block_id)})


@route('POST', r'/api/blocks/(?P<block_id>[\w-]+)/save')
def save_block(req, block_id):
    row, mine = readable_block(req, block_id)
    if mine:
        raise HttpError(400, 'That one is already yours.')
    drawer_id = target_drawer(req, req.json().get('drawer'))
    existing = req.db.execute(
        "SELECT id FROM blocks WHERE user_id = ? AND json_extract(meta, '$.savedFrom.id') = ?",
        (req.user['id'], block_id)).fetchone()
    if existing:
        copy_id = existing['id']
    else:
        meta = json.loads(row['meta'] or '{}')
        meta['savedFrom'] = {'id': row['id'], 'username': row['owner_name']}
        copy_id = insert_block(
            req, kind=row['kind'], title=row['title'], description=row['description'], content=row['content'],
            file_key=link_file(row['user_id'], req.user['id'], row['file_key']), file_name=row['file_name'],
            mime=row['mime'], ext=row['ext'], size=row['size'],
            thumb_key=link_file(row['user_id'], req.user['id'], row['thumb_key']),
            width=row['width'], height=row['height'], duration=row['duration'], meta=meta)
    if drawer_id:
        connect(req.db, copy_id, drawer_id)
    return json_response({'block': reload_block(req, copy_id), 'already': bool(existing)}, status=201)


@route('POST', r'/api/blocks/(?P<block_id>[\w-]+)/autosort')
def sort_block(req, block_id):
    """A loose star dropped back into the black hole finds itself a planet."""
    own_block(req, block_id)
    sorted_into = autosort(req, block_id, icon_arg(req.json().get('icon')))
    return json_response({'block': reload_block(req, block_id), 'sortedInto': sorted_into,
                          'connections': block_connections(req, block_id)})


@route('GET', r'/api/blocks/(?P<block_id>[\w-]+)')
def get_block(req, block_id):
    row, mine = readable_block(req, block_id)
    owner = None if mine else row['owner_name']
    connections = block_connections(req, block_id)
    block = mark_saved(req, [block_json(row, mine, owner)])[0]
    if not mine and in_community_drawer(req, block_id):
        block['community'] = True
    return json_response({'block': block, 'connections': connections})


@route('PATCH', r'/api/blocks/(?P<block_id>[\w-]+)')
def update_block(req, block_id):
    row = own_block(req, block_id)
    body = req.json()
    updates = {}
    title = text_field(body, 'title', 200, 'Title')
    if title is not None:
        updates['title'] = title
    description = text_field(body, 'description', 10_000, 'Description')
    if description is not None:
        updates['description'] = description
    content = text_field(body, 'content', 200_000, 'Text', strip=False)
    if content is not None and row['kind'] == 'text':
        if not content.strip():
            raise HttpError(400, 'A text file needs some text.')
        updates['content'] = content.strip('\n')
    for key, high in (('width', 100000), ('height', 100000), ('duration', 10 ** 7)):
        if key in body:
            value = int_arg(body[key], 0, high)
            if value is not None:
                updates[key] = value
    if 'look' in body:
        meta = json.loads(row['meta'] or '{}')
        meta['look'] = clean_look(body['look'])
        req.db.execute('UPDATE blocks SET meta = ? WHERE id = ?', (json.dumps(meta, ensure_ascii=False), block_id))
    if updates:
        updates['updated_at'] = now()
        assignments = ', '.join(f'{k} = ?' for k in updates)
        req.db.execute(f'UPDATE blocks SET {assignments} WHERE id = ?', (*updates.values(), block_id))
    return json_response({'block': reload_block(req, block_id)})


@route('DELETE', r'/api/blocks/(?P<block_id>[\w-]+)')
def delete_block(req, block_id):
    row = own_block(req, block_id)
    req.db.execute('DELETE FROM blocks WHERE id = ?', (block_id,))
    remove_block_files(req.user['id'], row['file_key'], row['thumb_key'])
    return json_response({'ok': True})


@route('POST', r'/api/blocks/(?P<block_id>[\w-]+)/connections')
def add_connection(req, block_id):
    own_block(req, block_id)
    body = req.json()
    drawer_id = writable_drawer(req, str(body.get('drawer') or ''))['id']
    position = body.get('position')
    position = float(position) if isinstance(position, (int, float)) else None
    connect(req.db, block_id, drawer_id, position)
    return json_response({'block': reload_block(req, block_id), 'connections': block_connections(req, block_id)})


@route('DELETE', r'/api/blocks/(?P<block_id>[\w-]+)/connections/(?P<drawer_id>[\w-]+)')
def remove_connection(req, block_id, drawer_id):
    drawer = writable_drawer(req, drawer_id)
    block = req.db.execute('SELECT user_id FROM blocks WHERE id = ?', (block_id,)).fetchone()
    mine = block and block['user_id'] == req.user['id']
    moderating = block and drawer['community'] and drawer['user_id'] == req.user['id']
    if not (mine or moderating):
        raise HttpError(404, 'That file does not exist.')
    found = req.db.execute('SELECT position FROM connections WHERE block_id = ? AND drawer_id = ?',
                           (block_id, drawer_id)).fetchone()
    req.db.execute('DELETE FROM connections WHERE block_id = ? AND drawer_id = ?', (block_id, drawer_id))
    req.db.execute('UPDATE drawers SET updated_at = ? WHERE id = ?', (now(), drawer_id))
    if not mine:
        return json_response({'ok': True, 'position': found['position'] if found else None})
    return json_response({
        'block': reload_block(req, block_id),
        'connections': block_connections(req, block_id),
        'position': found['position'] if found else None,
    })


# ---------------------------------------------------------------- search

@route('GET', r'/api/search')
def search(req):
    q = (req.arg('q') or '').strip()[:100]
    if not q:
        return json_response({'drawers': [], 'blocks': []})
    pattern = '%' + q.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_') + '%'
    uid = req.user['id']
    drawers = req.db.execute(
        "SELECT d.*, (SELECT COUNT(*) FROM connections c WHERE c.drawer_id = d.id) AS n FROM drawers d "
        "WHERE d.user_id = ? AND (d.title LIKE ? ESCAPE '\\' OR d.description LIKE ? ESCAPE '\\') "
        "ORDER BY d.updated_at DESC LIMIT 40", (uid, pattern, pattern)).fetchall()
    blocks = req.db.execute(
        f"SELECT {BLOCK_COLUMNS} FROM blocks b WHERE b.user_id = ? AND ("
        "b.title LIKE ? ESCAPE '\\' OR b.description LIKE ? ESCAPE '\\' OR "
        "b.content LIKE ? ESCAPE '\\' OR b.file_name LIKE ? ESCAPE '\\' OR b.meta LIKE ? ESCAPE '\\') "
        "ORDER BY b.created_at DESC LIMIT 400", (uid, pattern, pattern, pattern, pattern, pattern)).fetchall()
    return json_response({
        'drawers': [drawer_json(d, d['n'], drawer_previews(req, d['id'])) for d in drawers],
        'blocks': [block_json(b) for b in blocks],
    })


# ---------------------------------------------------------------- stored files

FILE_CSP = "sandbox; default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'"


@route('GET', r'/f/(?P<block_id>[\w-]+)(?:/[^/]*)?')
def serve_file(req, block_id):
    row, _ = readable_block(req, block_id)
    if not row['file_key']:
        raise HttpError(404, 'This file has nothing to download.')
    path = os.path.join(db.user_files_dir(row['user_id']), row['file_key'])
    content_type, inline, sandbox = kinds.serving(row['kind'], row['mime'] or '', row['ext'] or '')
    disposition = 'attachment' if req.arg('dl') == '1' or not inline else 'inline'
    headers = [('Content-Security-Policy', FILE_CSP)] if sandbox else []
    return file_response(req, path, content_type, filename=row['file_name'], disposition=disposition,
                         headers=headers)


@route('GET', r'/t/(?P<block_id>[\w-]+)')
def serve_thumb(req, block_id):
    row, _ = readable_block(req, block_id)
    if not row['thumb_key']:
        raise HttpError(404, 'No preview yet.')
    path = os.path.join(db.user_files_dir(row['user_id']), row['thumb_key'])
    ext = row['thumb_key'].rsplit('.', 1)[-1]
    return file_response(req, path, kinds.THUMB_TYPES.get(ext, 'application/octet-stream'),
                         headers=[('Content-Security-Policy', FILE_CSP)])
