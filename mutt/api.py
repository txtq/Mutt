"""HTTP API: accounts, settings, galaxies, drawers (planets), files (blocks), connections."""
import gzip
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
import zipfile
from concurrent.futures import ThreadPoolExecutor

from . import auth, books, db, documents, kinds, links, media, sight, sorting
from .web import HttpError, Response, file_response, json_response, route, stream_to_file

MAX_UPLOAD = int(float(os.environ.get('MUTT_MAX_UPLOAD_MB', '100')) * 1024 * 1024)
MAX_THUMB = 8 * 1024 * 1024
UNLOCK_TTL = 12 * 60 * 60
ALLOW_SIGNUPS = os.environ.get('MUTT_ALLOW_SIGNUPS', '1').lower() not in ('0', 'false', 'no', 'off')

ICON_RE = re.compile(r'^[0-3]{81}$')
COLOR_RE = re.compile(r'^#[0-9a-fA-F]{6}$')
USERNAME_PATH = r'(?P<username>[a-z0-9][a-z0-9_.-]{0,22}[a-z0-9])'
PALETTE = ['#FF5C39', '#2F6BFF', '#14B86A', '#FFB020', '#A66BFF', '#FF6FB0', '#00B2C6', '#9A6240']
VISIBILITY = ('private', 'pin', 'people', 'public')
PLANET_LOOKS = ('ocean', 'terran', 'gas', 'lava', 'ice', 'desert', 'rock', 'storm')
MOON_LOOKS = ('luna', 'io', 'europa', 'titan', 'enceladus', 'triton', 'phobos', 'hyperion', 'iapetus', 'callisto')
MAX_MOONS = 4
LAYOUT_REACH = (2000, 4000)  # how far from the void a planet can be put (x, y)

PREF_CHOICES = {
    'size': {'s', 'm', 'l'},
    'motion': {'fluid', 'calm', 'off'},
    'logo': {'wonk', 'editorial', 'stamp', 'wide', 'mono'},
    'sky': {'vita', 'nebula', 'aurora', 'dusk'},
    'music': {'on', 'off'},
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
        'parentId': row['parent_id'] if 'parent_id' in row.keys() else None,
        'modes': drawer_modes(row),
        'hasCode': bool(row['share_hash']) if 'share_hash' in row.keys() else False,
    }
    if count is not None:
        data['count'] = count
    if previews is not None:
        data['previews'] = previews
    return data


def public_meta(raw, mine):
    """A file's details as the browser gets them: a picture's reading is only
    marked as done (its numbers stay on the server), and where and when a
    photo was taken is only shown to its owner."""
    meta = json.loads(raw or '{}')
    see = meta.get('see')
    if isinstance(see, dict):
        if mine:
            meta['see'] = {'v': see.get('v')}
        else:
            meta.pop('see')
    if not mine and isinstance(meta.get('media'), dict):
        meta['media'] = {k: v for k, v in meta['media'].items() if k not in ('gps', 'location', 'taken', 'camera')}
    return meta


def drawer_modes(row):
    try:
        return json.loads(row['modes'] or '{}') if 'modes' in row.keys() else {}
    except ValueError:
        return {}


# List mode's options: how items are marked, and how long one can be.
LIST_TYPES = ('check', 'bullet', 'number', 'plain')
LIST_MARKERS = ('dot', 'dash', 'arrow', 'star', 'circle', 'square')
LIST_LIMITS = (60, 120, 200, 400)
LIST_DEFAULTS = {'on': False, 'type': 'check', 'marker': 'dot', 'limit': 120, 'doneLast': True, 'dismissed': False}


def clean_modes(value, current):
    """Check the modes a planet's owner is setting; returns the whole new value."""
    if not isinstance(value, dict):
        raise HttpError(400, 'Those settings could not be saved.')
    modes = dict(current)
    if 'list' in value:
        given = value['list']
        if not isinstance(given, dict):
            raise HttpError(400, 'Those list settings could not be saved.')
        merged = {**LIST_DEFAULTS, **(modes.get('list') or {})}
        for key, v in given.items():
            if key in ('on', 'doneLast', 'dismissed') and isinstance(v, bool):
                merged[key] = v
            elif key == 'type' and v in LIST_TYPES:
                merged[key] = v
            elif key == 'marker' and v in LIST_MARKERS:
                merged[key] = v
            elif key == 'limit' and v in LIST_LIMITS:
                merged[key] = v
            else:
                raise HttpError(400, 'Those list settings could not be saved.')
        modes['list'] = merged
    if 'reading' in value:
        given = value['reading']
        if not isinstance(given, dict):
            raise HttpError(400, 'Those reading settings could not be saved.')
        merged = {'on': False, 'dismissed': False, **(modes.get('reading') or {})}
        for key, v in given.items():
            if key in ('on', 'dismissed') and isinstance(v, bool):
                merged[key] = v
            else:
                raise HttpError(400, 'Those reading settings could not be saved.')
        modes['reading'] = merged
    if 'documents' in value:
        given = value['documents']
        if not isinstance(given, dict):
            raise HttpError(400, 'Those document settings could not be saved.')
        merged = {'on': False, 'dismissed': False, **(modes.get('documents') or {})}
        for key, v in given.items():
            if key in ('on', 'dismissed') and isinstance(v, bool):
                merged[key] = v
            else:
                raise HttpError(400, 'Those document settings could not be saved.')
        modes['documents'] = merged
    if 'shareTip' in value:
        # The one-time "who can see it" tip on a new planet; only ever put away.
        if value['shareTip'] is not False:
            raise HttpError(400, 'Those settings could not be saved.')
        modes.pop('shareTip', None)
    return modes


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
        'meta': public_meta(row['meta'], mine),
        'createdAt': ms(row['created_at']),
        'updatedAt': ms(row['updated_at']),
        'mine': mine,
        'sharedAt': ms(row['shared_at']) if 'shared_at' in keys else None,
    }
    if owner:
        data['owner'] = owner
    if 'checked' in keys:
        data['checked'] = ms(row['checked']) if row['checked'] else None
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


LOOK_COLORS = {'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink', 'brown', 'black', 'white', 'grey'}
LOOK_TAGS = {'bright', 'dark', 'warm', 'cool', 'vivid', 'muted', 'soft', 'mono', 'contrast', 'busy', 'minimal',
             'tall', 'wide', 'square'}


def clean_see(value):
    """What the browser's picture reader made of a picture: 512 numbers, base64."""
    if not isinstance(value, dict) or value.get('v') != sight.VERSION or not isinstance(value.get('e'), str):
        raise HttpError(400, 'That picture reading is not one Mutt understands.')
    if len(value['e']) > 1000 or sight.unpack(value['e']) is None:
        raise HttpError(400, 'That picture reading is not one Mutt understands.')
    return sight.remember({'v': sight.VERSION, 'e': value['e']})


def clean_look(value):
    """A file's colour summary, measured in the browser, used for sorting and search."""
    if not isinstance(value, dict) or not COLOR_RE.match(str(value.get('hex', ''))):
        raise HttpError(400, 'Could not read that colour.')

    def number(n, high):
        if isinstance(n, bool) or not isinstance(n, (int, float)) or not 0 <= n <= high:
            raise HttpError(400, 'Could not read that colour.')
        return round(float(n), 3)

    look = {'hex': value['hex'].upper(), 'h': number(value.get('h'), 360), 's': number(value.get('s'), 1),
            'l': number(value.get('l'), 1), 'c': number(value.get('c'), 1)}
    if 'v' in value:
        look['v'] = int(number(value['v'], 100))
    colors = value.get('colors')
    if colors is not None:
        if not isinstance(colors, dict) or len(colors) > 4 or not set(colors) <= LOOK_COLORS:
            raise HttpError(400, 'Could not read that colour.')
        look['colors'] = {name: number(share, 1) for name, share in colors.items()}
    tags = value.get('tags')
    if tags is not None:
        if not isinstance(tags, list) or len(tags) > 12 or not set(tags) <= LOOK_TAGS:
            raise HttpError(400, 'Could not read that colour.')
        look['tags'] = list(dict.fromkeys(tags))
    return look


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


def is_unlocked(req, row):
    """Has this session opened a Code planet with the planet's own code?"""
    if row['user_id'] == req.user['id']:
        return True
    if not row['share_hash']:
        return False
    return bool(req.db.execute(
        'SELECT 1 FROM drawer_unlocks WHERE session_hash = ? AND drawer_id = ? AND expires_at > ?',
        (auth.session_key(req.session_token), row['id'], now())).fetchone())


def drawer_visible(req, row):
    """Can the signed-in person look inside this drawer (planet)? A moon is
    never more open than its planet: both have to let you in."""
    if row['user_id'] == req.user['id']:
        return True
    parent_id = row['parent_id'] if 'parent_id' in row.keys() else None
    if parent_id:
        parent = req.db.execute('SELECT * FROM drawers WHERE id = ?', (parent_id,)).fetchone()
        if not parent or not drawer_visible(req, parent):
            return False
    if row['community']:
        return True
    visibility = row['visibility']
    if visibility == 'public':
        return True
    if visibility == 'people':
        return bool(req.db.execute('SELECT 1 FROM drawer_access WHERE drawer_id = ? AND user_id = ?',
                                   (row['id'], req.user['id'])).fetchone())
    return visibility == 'pin' and is_unlocked(req, row)


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


def place_in(conn, drawer_id, after=None, end=False):
    """A position just after one file (or at the end) instead of the top."""
    if after:
        row = conn.execute('SELECT position FROM connections WHERE drawer_id = ? AND block_id = ?',
                           (drawer_id, str(after))).fetchone()
        if row:
            nxt = conn.execute('SELECT MIN(position) FROM connections WHERE drawer_id = ? AND position > ?',
                               (drawer_id, row[0])).fetchone()[0]
            return (row[0] + nxt) / 2 if nxt is not None else row[0] + 1
    if end:
        high = conn.execute('SELECT MAX(position) FROM connections WHERE drawer_id = ?', (drawer_id,)).fetchone()[0]
        return high + 1 if high is not None else 0
    return None


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
    others = [b for b in blocks if not b['mine']]
    if not others:
        return blocks  # all your own: no need to look through everything you've saved
    saved = saved_from_ids(req)
    for b in others:
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
    drawers = conn.execute('SELECT COUNT(*) FROM drawers WHERE user_id = ? AND parent_id IS NULL', (user_id,)).fetchone()[0]
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
    headers = []
    if not auth.known_device(req.db, req.user['id'], req.cookie(auth.DEVICE_COOKIE)):
        headers.append(auth.remember_device(req, req.db, req.user['id']))  # signed in before device cookies
    return json_response({'user': user_json(req.user), 'prefs': user_prefs(req.user),
                          'stats': user_stats(req.db, req.user['id'])}, headers=headers)


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
                         headers=[auth.cookie_header(req, token), auth.remember_device(req, req.db, user['id'])])


def pin_gate(req, user, pin, wrong_status=401, device=None):
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
    failure = auth.try_pin(req.db, user, pin, ip, device)
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
        pin_gate(req, user, pin, device=req.cookie(auth.DEVICE_COOKIE))
    except HttpError as err:
        if err.status == 401:
            err.message = "That username and code don't match."
        raise
    token = auth.create_session(req.db, user['id'])
    if random.random() < 0.05:
        auth.prune_sessions(req.db)
    return json_response({'user': user_json(user), 'prefs': user_prefs(user),
                          'stats': user_stats(req.db, user['id'])},
                         headers=[auth.cookie_header(req, token), auth.remember_device(req, req.db, user['id'])])


@route('POST', r'/api/auth/logout', auth=False)
def logout(req):
    if req.session_token:
        req.db.execute('DELETE FROM drawer_unlocks WHERE session_hash = ?', (auth.session_key(req.session_token),))
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
    if uses_planet_code(req, new_pin):
        raise HttpError(400, "That's the code for one of your planets. Pick a different one.")
    pin_hash, salt = auth.new_pin_hash(new_pin)
    req.db.execute('UPDATE users SET pin_hash = ?, pin_salt = ? WHERE id = ?', (pin_hash, salt, req.user['id']))
    auth.end_other_sessions(req.db, req.user['id'], req.session_token)
    return json_response({'ok': True})


def uses_planet_code(req, code):
    """Is `code` the code of one of your planets? A sign-in code and a planet
    code must never be the same, or sharing a planet would hand out your account."""
    digest = auth.share_hash(req.user['id'], code)
    return any(bytes(r[0]) == digest for r in req.db.execute(
        'SELECT share_hash FROM drawers WHERE user_id = ? AND share_hash IS NOT NULL', (req.user['id'],)))


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


def drawer_previews(req, drawer_id, limit=8, owner=None, newest=False):
    order = 'c.connected_at DESC, c.position' if newest else 'c.position, c.connected_at DESC'
    rows = req.db.execute(
        'SELECT b.*, u.username AS owner_name FROM connections c JOIN blocks b ON b.id = c.block_id '
        'JOIN users u ON u.id = b.user_id '
        f'WHERE c.drawer_id = ? ORDER BY {order} LIMIT ?', (drawer_id, limit)).fetchall()
    me_id = req.user['id']
    return [block_json(r, mine=r['user_id'] == me_id, owner=None if r['user_id'] == me_id else r['owner_name'])
            for r in rows]


def blocks_in_drawer(req, drawer_id, community=False):
    rows = req.db.execute(
        f'SELECT {BLOCK_COLUMNS}, c.checked, u.username AS owner_name FROM connections c '
        'JOIN blocks b ON b.id = c.block_id '
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
        'FROM drawers d WHERE d.user_id = ? AND d.parent_id IS NULL ORDER BY d.updated_at DESC', (user_id,)).fetchall()
    return [drawer_json(r, r['n'], drawer_previews(req, r['id'], owner=owner) if with_previews else None)
            for r in rows]


# ---------------------------------------------------------------- galaxies

def planet_people(req, drawer_id):
    return [r[0] for r in req.db.execute(
        'SELECT u.username FROM drawer_access a JOIN users u ON u.id = a.user_id '
        'WHERE a.drawer_id = ? ORDER BY u.username', (drawer_id,))]


def moons_of(req, planet_id):
    """A planet's moons as this person may see them; a pin moon not yet
    unlocked shows locked."""
    rows = req.db.execute(
        'SELECT d.*, (SELECT COUNT(*) FROM connections c WHERE c.drawer_id = d.id) AS n '
        'FROM drawers d WHERE d.parent_id = ? ORDER BY d.created_at', (planet_id,)).fetchall()
    out = []
    for r in rows:
        open_ = drawer_visible(req, r)
        if not open_ and r['visibility'] != 'pin':
            continue
        out.append({'id': r['id'], 'title': r['title'], 'look': r['look'], 'count': r['n'],
                    'visibility': r['visibility'], 'locked': not open_})
    return out


def planet_json(req, row, count, previews=None, locked=False):
    data = drawer_json(row, count, previews)
    if not data['parentId']:
        data['moons'] = [] if locked else moons_of(req, row['id'])
    if previews is not None:
        # The peek on hover shows what was put here last.
        data['recent'] = drawer_previews(req, row['id'], limit=4, newest=True) if previews else []
    data['mine'] = row['user_id'] == req.user['id']
    if data['mine'] and row['visibility'] == 'people':
        data['people'] = planet_people(req, row['id'])
    if locked:
        data['locked'] = True
        data['description'] = ''
    return data


def private_planet(row):
    return {'id': row['id'], 'title': '', 'icon': {'c': json.loads(row['icon']).get('c')}, 'look': row['look'],
            'x': row['x'], 'y': row['y'], 'count': 0, 'moons': [], 'locked': True, 'private': True,
            'mine': False, 'visibility': 'private', 'hasCode': False}


def galaxy_of(req, owner):
    """Someone's planets as you're allowed to see them, plus your own loose stars."""
    mine = owner['id'] == req.user['id']
    rows = req.db.execute(
        'SELECT d.*, (SELECT COUNT(*) FROM connections c WHERE c.drawer_id = d.id) AS n '
        'FROM drawers d WHERE d.user_id = ? AND d.parent_id IS NULL ORDER BY d.created_at', (owner['id'],)).fetchall()
    planets = []
    for r in rows:
        if mine or drawer_visible(req, r):
            planets.append(planet_json(req, r, r['n'], drawer_previews(req, r['id'], limit=12)))
        elif r['visibility'] == 'pin':
            planets.append(planet_json(req, r, r['n'], locked=True))
        else:
            # Private planets, and people-only ones you're not on, show
            # blurred: where they are and what kind, never their name or files.
            planets.append(private_planet(r))
    data = {
        'user': {**user_json(owner), 'you': mine},
        'planets': planets,
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
    """Open someone's Code planets with a planet's code (never their sign-in
    code). Every one of their planets with that code opens, for 12 hours.
    `drawer` names the planet being opened, so a missing code can be said."""
    owner = find_user(req, username)
    opened = []
    if owner['id'] != req.user['id']:
        body = req.json()
        code = str(body.get('pin') or body.get('code') or '')
        wanted = str(body.get('drawer') or '')
        if wanted:
            row = req.db.execute("SELECT share_hash FROM drawers WHERE id = ? AND user_id = ? AND visibility = 'pin'",
                                 (wanted, owner['id'])).fetchone()
            if not row:
                raise HttpError(404, 'That planet does not exist.')
            if not row['share_hash']:
                raise HttpError(403, f"@{owner['username']} hasn't given this planet a code yet.", noCode=True)
        wait = auth.login_failures_by_ip.retry_after(req.client_ip)
        if wait:
            raise HttpError(429, f'Too many tries. Wait {auth.format_wait(wait)} and try again.', retryAfter=wait)
        if not auth.PIN_RE.match(code):
            raise HttpError(400, 'Codes are 4 digits.')
        failure, opened = auth.try_share_code(req.db, owner, code, req.client_ip)
        if failure:
            # 403, not 401: a 401 means *your* session has ended and would sign you out.
            status, message, extra = failure
            raise HttpError(403 if status == 401 else status, message, **extra)
        session = auth.session_key(req.session_token)
        for drawer_id in opened:
            req.db.execute('INSERT OR REPLACE INTO drawer_unlocks (session_hash, drawer_id, expires_at) '
                           'VALUES (?, ?, ?)', (session, drawer_id, now() + UNLOCK_TTL))
    return json_response({**galaxy_of(req, owner), 'opened': opened})


@route('PUT', r'/api/drawers/(?P<drawer_id>[\w-]+)/code')
def set_planet_code(req, drawer_id):
    """The owner picks the code people need to look inside a Code planet.
    Changing it closes the planet again to everyone who had the old one."""
    own_drawer(req, drawer_id)
    code = str(req.json().get('code') or '')
    if not auth.PIN_RE.match(code):
        raise HttpError(400, 'The code needs to be 4 digits.')
    if auth.check_pin(code, req.user['pin_salt'], req.user['pin_hash']):
        raise HttpError(400, "That's your sign-in code. Pick a different one, so sharing this planet "
                             "doesn't share your account.")
    with db.transaction(req.db):
        req.db.execute('UPDATE drawers SET share_hash = ?, updated_at = ? WHERE id = ?',
                       (auth.share_hash(req.user['id'], code), now(), drawer_id))
        req.db.execute('DELETE FROM drawer_unlocks WHERE drawer_id = ?', (drawer_id,))
    row = own_drawer(req, drawer_id)
    count = req.db.execute('SELECT COUNT(*) FROM connections WHERE drawer_id = ?', (drawer_id,)).fetchone()[0]
    return json_response({'drawer': planet_json(req, row, count)})


@route('PUT', r'/api/galaxy/layout')
def save_layout(req):
    """Where you've put your planets. `reset` sends them all back to being
    placed for you."""
    body = req.json()
    if body.get('reset'):
        req.db.execute('UPDATE drawers SET x = NULL, y = NULL WHERE user_id = ? AND parent_id IS NULL', (req.user['id'],))
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
            if not req.db.execute('UPDATE drawers SET x = ?, y = ? WHERE id = ? AND user_id = ? AND parent_id IS NULL', row).rowcount:
                raise HttpError(404, 'One of those planets is not yours.')
    return json_response({'ok': True})


@route('GET', r'/api/users')
def list_users(req):
    """Everyone else's username, A to Z, for picking who to share a planet with."""
    rows = req.db.execute('SELECT username FROM users WHERE id != ? ORDER BY username', (req.user['id'],))
    return json_response({'users': [r[0] for r in rows]})


@route('GET', r'/api/galaxies')
def list_galaxies(req):
    """The universe: everyone, you first, then everyone else A to Z. Anyone's
    galaxy can be opened; a code is only asked for on a locked planet, and
    planets you can't see at all (private, or shared with others) show blurred."""
    users = req.db.execute('SELECT * FROM users ORDER BY username').fetchall()
    out = []
    for user in users:
        mine = user['id'] == req.user['id']
        rows = req.db.execute(
            'SELECT d.*, (SELECT COUNT(*) FROM connections c WHERE c.drawer_id = d.id) AS n '
            'FROM drawers d WHERE d.user_id = ? AND d.parent_id IS NULL ORDER BY d.created_at', (user['id'],)).fetchall()
        worlds = []
        for r in rows:
            open_ = mine or drawer_visible(req, r)
            hidden = not open_ and r['visibility'] != 'pin'
            worlds.append({'id': r['id'], 'c': json.loads(r['icon']).get('c'), 'n': 0 if hidden else r['n'],
                           'locked': not open_, 'private': hidden,
                           'look': r['look'], 'x': r['x'], 'y': r['y'],
                           'moons': [] if not open_ else [{'id': m['id'], 'look': m['look']} for m in moons_of(req, r['id'])]})
        opened = [w for w in worlds if not w['locked']]
        private = sum(1 for w in worlds if w['private'])
        out.append({
            'username': user['username'], 'you': mine, 'planets': len(worlds),
            'files': sum(w['n'] for w in opened), 'open': len(opened),
            'locked': len(worlds) - len(opened) - private, 'private': private,
            'worlds': worlds[:16],
        })
    out.sort(key=lambda g: (not g['you'], g['username']))
    return json_response({'galaxies': out})


# ---------------------------------------------------------------- drawers

@route('GET', r'/api/drawers')
def list_drawers(req):
    lite = req.arg('lite') == '1'
    drawers = drawers_of(req, req.user['id'], not lite)
    if req.arg('community') == '1':
        others = req.db.execute(
            'SELECT d.*, u.username AS owner_name, (SELECT COUNT(*) FROM connections c WHERE c.drawer_id = d.id) AS n '
            'FROM drawers d JOIN users u ON u.id = d.user_id WHERE d.community = 1 AND d.parent_id IS NULL AND d.user_id != ? '
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
    # New planets are public (look, don't add) until their owner says otherwise.
    visibility = body.get('visibility') or 'public'
    if visibility not in VISIBILITY:
        raise HttpError(400, 'That sharing setting could not be saved.')
    parent_id = body.get('parent') or None
    people = []
    # A new planet shows its owner a tip about sharing the first time they open it.
    modes = {'shareTip': True}
    if parent_id is not None:
        modes = {}
        parent = own_drawer(req, str(parent_id))
        if parent['parent_id']:
            raise HttpError(400, "Moons can't have moons.")
        moons = req.db.execute('SELECT COUNT(*) FROM drawers WHERE parent_id = ?', (parent['id'],)).fetchone()[0]
        if moons >= MAX_MOONS:
            raise HttpError(400, f'A planet can have up to {MAX_MOONS} moons.')
        if body.get('community'):
            raise HttpError(400, 'Moons can only be added to by their owner.')
        visibility = body.get('visibility') or parent['visibility']
        if 'visibility' not in body and parent['visibility'] == 'people':
            people = [r[0] for r in req.db.execute('SELECT user_id FROM drawer_access WHERE drawer_id = ?', (parent['id'],))]
        if visibility not in VISIBILITY:
            raise HttpError(400, 'That sharing setting could not be saved.')
        parent_id = parent['id']
        # A moon of a list starts as a list too, marked the same way. Its
        # owner can show it as files like any planet.
        parent_list = drawer_modes(parent).get('list') or {}
        if parent_list.get('on'):
            modes = clean_modes({'list': {k: v for k, v in parent_list.items() if k in LIST_DEFAULTS}
                                 | {'on': True, 'dismissed': False}}, {})
    drawer_id = new_id()
    stamp = now()
    with db.transaction(req.db):
        req.db.execute(
            'INSERT INTO drawers (id, user_id, title, description, icon, created_at, updated_at, community, visibility, parent_id, modes) '
            'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            (drawer_id, req.user['id'], title, description, json.dumps(icon), stamp, stamp,
             1 if body.get('community') else 0, visibility, parent_id, json.dumps(modes)))
        for user_id in people:
            req.db.execute('INSERT INTO drawer_access (drawer_id, user_id) VALUES (?, ?)', (drawer_id, user_id))
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
    if row['parent_id']:
        parent = req.db.execute('SELECT d.*, (SELECT COUNT(*) FROM connections c WHERE c.drawer_id = d.id) AS n '
                                'FROM drawers d WHERE d.id = ?', (row['parent_id'],)).fetchone()
        drawer['parent'] = planet_json(req, parent, parent['n'], drawer_previews(req, parent['id'], limit=12))
    return json_response({'drawer': drawer, 'blocks': blocks})


@route('PATCH', r'/api/drawers/(?P<drawer_id>[\w-]+)')
def update_drawer(req, drawer_id):
    moon = bool(own_drawer(req, drawer_id)['parent_id'])
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
        # Whoever had opened it with its code has to ask again.
        req.db.execute('DELETE FROM drawer_unlocks WHERE drawer_id = ?', (drawer_id,))
    if 'look' in body:
        if body['look'] is not None and body['look'] not in (MOON_LOOKS if moon else PLANET_LOOKS):
            raise HttpError(400, 'That kind of moon does not exist.' if moon else 'That kind of planet does not exist.')
        updates['look'] = body['look']
    if 'people' in body:
        set_planet_people(req, drawer_id, body['people'])
    if 'community' in body and moon and body['community']:
        raise HttpError(400, 'Moons can only be added to by their owner.')
    if 'modes' in body:
        current = drawer_modes(own_drawer(req, drawer_id))
        updates['modes'] = json.dumps(clean_modes(body['modes'], current))
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


# Your files that live only on this planet or its moons.
ORPHANS_SQL = (
    'SELECT DISTINCT b.id, b.file_key, b.thumb_key FROM connections c JOIN blocks b ON b.id = c.block_id '
    'JOIN drawers d ON d.id = c.drawer_id WHERE (d.id = :d OR d.parent_id = :d) AND b.user_id = :u '
    'AND NOT EXISTS (SELECT 1 FROM connections c2 JOIN drawers d2 ON d2.id = c2.drawer_id '
    'WHERE c2.block_id = b.id AND d2.id != :d AND (d2.parent_id IS NULL OR d2.parent_id != :d))')


@route('GET', r'/api/drawers/(?P<drawer_id>[\w-]+)/orphans')
def drawer_orphans(req, drawer_id):
    own_drawer(req, drawer_id)
    return json_response({'count': len(req.db.execute(ORPHANS_SQL, {'d': drawer_id, 'u': req.user['id']}).fetchall())})


@route('GET', r'/api/drawers/(?P<drawer_id>[\w-]+)/purpose')
def drawer_purpose(req, drawer_id):
    """What Mutt reads a planet as being about and for (sorting.purpose). Only
    its owner can ask; nothing in the app shows it yet. Features that appear
    when a planet needs them are meant to read this."""
    own_drawer(req, drawer_id)
    return json_response({'purpose': sorting.purpose(req.db, drawer_id)})


@route('GET', r'/api/drawers/(?P<drawer_id>[\w-]+)/modes')
def drawer_mode_signs(req, drawer_id):
    """Features this planet could use, and the signs for each, in plain words
    (list mode and reading mode). Only its owner sees these."""
    row = own_drawer(req, drawer_id)
    return json_response({'list': sorting.list_signs(req.db, drawer_id), 'reading': shelf_signs(req, row),
                          'documents': desk_signs(req, row)})


@route('POST', r'/api/drawers/(?P<drawer_id>[\w-]+)/listify')
def listify_drawer(req, drawer_id):
    """Turn list mode on. Notes written as lists, that are yours and only on
    this planet, become one item per line, in their place."""
    row = own_drawer(req, drawer_id)
    body = req.json()
    signs = sorting.list_signs(req.db, drawer_id)
    split = 0
    with db.transaction(req.db):
        if body.get('split', True):
            rows = req.db.execute(
                'SELECT b.id, b.content, c.position FROM connections c JOIN blocks b ON b.id = c.block_id '
                'WHERE c.drawer_id = ? AND b.user_id = ? AND b.kind = ? AND '
                '(SELECT COUNT(*) FROM connections c2 WHERE c2.block_id = b.id) = 1 '
                'ORDER BY c.position', (drawer_id, req.user['id'], 'text')).fetchall()
            for r in rows:
                if r['id'] not in signs['split']:
                    continue
                items = sorting.list_items(r['content'])
                after = req.db.execute('SELECT MIN(position) FROM connections WHERE drawer_id = ? AND position > ?',
                                       (drawer_id, r['position'])).fetchone()[0]
                gap = ((after - r['position']) if after is not None else len(items) + 1) / (len(items) + 1)
                for i, (text, ticked) in enumerate(items):
                    block_id = insert_block(req, kind='text', title='', content=text[:2000])
                    req.db.execute('INSERT INTO connections (block_id, drawer_id, position, connected_at, checked) '
                                   'VALUES (?, ?, ?, ?, ?)', (block_id, drawer_id, r['position'] + gap * (i + 1),
                                                             now(), now() if ticked else None))
                req.db.execute('DELETE FROM blocks WHERE id = ?', (r['id'],))
                split += 1
        modes = clean_modes({'list': {'on': True, 'dismissed': False,
                                      **({'type': signs['type']} if not (drawer_modes(row).get('list') or {})
                                         .get('type') else {})}}, drawer_modes(row))
        req.db.execute('UPDATE drawers SET modes = ?, updated_at = ? WHERE id = ?',
                       (json.dumps(modes), now(), drawer_id))
        # Its moons become lists too, marked the same way, unless their owner
        # already chose for them or what's on them isn't a list.
        for moon in req.db.execute('SELECT * FROM drawers WHERE parent_id = ?', (drawer_id,)).fetchall():
            if 'list' in drawer_modes(moon) or not sorting.list_signs(req.db, moon['id'])['fits']:
                continue
            moon_modes = clean_modes({'list': {k: v for k, v in modes['list'].items() if k in LIST_DEFAULTS}},
                                     drawer_modes(moon))
            req.db.execute('UPDATE drawers SET modes = ? WHERE id = ?', (json.dumps(moon_modes), moon['id']))
    row = own_drawer(req, drawer_id)
    blocks = blocks_in_drawer(req, drawer_id, community=bool(row['community']))
    return json_response({'drawer': planet_json(req, row, len(blocks)), 'blocks': blocks, 'split': split})


@route('POST', r'/api/drawers/(?P<drawer_id>[\w-]+)/check')
def check_item(req, drawer_id):
    """Tick something off (or back on) on a list planet."""
    writable_drawer(req, drawer_id)
    body = req.json()
    block_id = body.get('block')
    found = req.db.execute('SELECT 1 FROM connections WHERE drawer_id = ? AND block_id = ?',
                           (drawer_id, str(block_id))).fetchone()
    if not found:
        raise HttpError(404, 'That isn’t on this planet.')
    stamp = now() if body.get('checked') else None
    req.db.execute('UPDATE connections SET checked = ? WHERE drawer_id = ? AND block_id = ?',
                   (stamp, drawer_id, str(block_id)))
    return json_response({'checked': ms(stamp) if stamp else None})


@route('DELETE', r'/api/drawers/(?P<drawer_id>[\w-]+)')
def delete_drawer(req, drawer_id):
    row = own_drawer(req, drawer_id)
    if row['parent_id']:
        # A moon's files fall to its planet.
        with db.transaction(req.db):
            high = req.db.execute('SELECT MAX(position) FROM connections WHERE drawer_id = ?',
                                  (row['parent_id'],)).fetchone()[0]
            high = high if high is not None else -1
            moved = 0
            for c in req.db.execute('SELECT block_id FROM connections WHERE drawer_id = ? '
                                    'ORDER BY position, connected_at DESC', (drawer_id,)).fetchall():
                moved += 1
                req.db.execute('INSERT OR IGNORE INTO connections (block_id, drawer_id, position, connected_at) '
                               'VALUES (?, ?, ?, ?)', (c['block_id'], row['parent_id'], high + moved, now()))
            req.db.execute('DELETE FROM drawers WHERE id = ?', (drawer_id,))
            req.db.execute('UPDATE drawers SET updated_at = ? WHERE id = ?', (now(), row['parent_id']))
        return json_response({'ok': True, 'deletedBlocks': 0, 'movedBlocks': moved})
    orphans = req.db.execute(ORPHANS_SQL, {'d': drawer_id, 'u': req.user['id']}).fetchall() if req.arg('blocks') == 'orphans' else []
    with db.transaction(req.db):
        for orphan in orphans:
            req.db.execute('DELETE FROM blocks WHERE id = ?', (orphan['id'],))
        req.db.execute('DELETE FROM drawers WHERE parent_id = ?', (drawer_id,))
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

def stored_text(user_id, block):
    """What can be read inside a block's file, for sorting it."""
    ext = block['ext'] or ''
    if not block['file_key'] or not (ext in kinds.TEXTY or block['kind'] in ('doc', 'pdf') or ext == 'ipynb'):
        return ''
    return sorting.read_text(os.path.join(db.user_files_dir(user_id), block['file_key']), ext, ext in kinds.TEXTY)


def autosort(req, block_id, icon=None, text=None):
    """File a new block onto the planet it fits best, making one if nothing fits."""
    block = own_block(req, block_id)
    if text is None:
        text = stored_text(req.user['id'], block)
    drawer_id, title = sorting.pick(req.db, req.user['id'], block, text)
    created = drawer_id is None
    if created:
        drawer_id = new_id()
        stamp = now()
        req.db.execute(
            'INSERT INTO drawers (id, user_id, title, description, icon, created_at, updated_at, community, visibility, modes) '
            "VALUES (?, ?, ?, '', ?, ?, ?, 0, 'public', '{\"shareTip\": true}')",
            (drawer_id, req.user['id'], title, json.dumps(icon or default_icon()), stamp, stamp))
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
        # `position` puts a note back exactly where it was (Undo); `after` and `end` place a new one.
        position = body.get('position')
        if not isinstance(position, (int, float)) or isinstance(position, bool):
            position = place_in(req.db, drawer_id, body.get('after'), body.get('end'))
        connect(req.db, block_id, drawer_id, float(position) if position is not None else None)
    elif body.get('autosort'):
        sorted_into = autosort(req, block_id, icon_arg(body.get('icon')))
    return json_response({'block': reload_block(req, block_id), 'sortedInto': sorted_into}, status=201)


MEDIA_DETAILS = ('image', 'video', 'audio', 'pdf', 'doc')


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
    text = ''
    if size and (ext in kinds.TEXTY or kind in ('doc', 'pdf') or ext == 'ipynb'):
        text = sorting.read_text(path, ext, ext in kinds.TEXTY)
        if len(text) > len(meta.get('excerpt', '')):
            meta['gist'] = sorting.gist(text)  # the rest, for sorting and search later
    if size and kind in MEDIA_DETAILS:
        found = media.read(path, ext)  # camera, date, place, app, artist, album, author...
        if found:
            meta['media'] = found
    if text or kind in ('pdf', 'doc', 'image'):
        doctype = sorting.doc_type(text[:sorting.DOC_LIMIT], ' '.join([name, (meta.get('media') or {}).get('title', '')]))
        if doctype:
            meta['doctype'] = doctype  # an invoice, a payslip, a ticket... from the whole text
    if kind == 'pdf' and text:
        found = books.hints(text)
        if found:
            meta['bookish'] = found  # ISBN, copyright page, contents... a book's giveaways
    epub = books.read_epub(path) if size and ext in books.BOOK_EXTS else None
    if epub:
        meta['book'] = {'title': epub['title'], 'author': epub['author']}
    title = os.path.splitext(name)[0] if ext else name
    shared = {'shared_at': now()} if req.arg('share') == '1' else {}
    block_id = insert_block(req, kind=kind, title=title[:200], file_key=key, file_name=name,
                            mime=mime, ext=ext, size=size, meta=meta, **shared)
    if epub and epub['cover']:
        save_epub_cover(req, block_id, path, epub['cover'])
    sorted_into = None
    if drawer_id:
        connect(req.db, block_id, drawer_id)
    elif req.arg('autosort') == '1':
        sorted_into = autosort(req, block_id, icon_arg(req.arg('icon')), text)
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
    """A loose star dropped back into the void finds itself a planet. Uploads
    that waited for the browser to read the picture are sorted this way too."""
    own_block(req, block_id)
    if req.db.execute('SELECT 1 FROM connections WHERE block_id = ? LIMIT 1', (block_id,)).fetchone():
        return json_response({'block': reload_block(req, block_id), 'sortedInto': None,  # already placed
                              'connections': block_connections(req, block_id)})
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
    if 'look' in body or 'see' in body:
        meta = json.loads(row['meta'] or '{}')
        if 'look' in body:
            meta['look'] = clean_look(body['look'])
        if 'see' in body:
            meta['see'] = clean_see(body['see'])
        req.db.execute('UPDATE blocks SET meta = ? WHERE id = ?', (json.dumps(meta, ensure_ascii=False), block_id))
    if updates:
        updates['updated_at'] = now()
        assignments = ', '.join(f'{k} = ?' for k in updates)
        req.db.execute(f'UPDATE blocks SET {assignments} WHERE id = ?', (*updates.values(), block_id))
    return json_response({'block': reload_block(req, block_id)})


@route('DELETE', r'/api/blocks/(?P<block_id>[\w-]+)')
def delete_block(req, block_id):
    row = own_block(req, block_id)
    # Where it sat on each planet, so an Undo can put it back in the same place.
    positions = {r['drawer_id']: r['position'] for r in req.db.execute(
        'SELECT drawer_id, position FROM connections WHERE block_id = ?', (block_id,))}
    req.db.execute('DELETE FROM blocks WHERE id = ?', (block_id,))
    remove_block_files(req.user['id'], row['file_key'], row['thumb_key'])
    return json_response({'ok': True, 'positions': positions})


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

SEARCH_PAGE = 60
SEARCH_SORTS = {
    'new': 'b.created_at DESC',
    'old': 'b.created_at ASC',
    'size': "COALESCE(b.size, LENGTH(b.content)) DESC, b.created_at DESC",
    'az': "LOWER(COALESCE(NULLIF(b.title, ''), NULLIF(b.file_name, ''), b.content)) ASC, b.created_at DESC",
}


def list_arg(req, name, allowed=None):
    values = [v for v in (req.arg(name) or '').lower().split(',') if v][:12]
    if allowed is not None and not set(values) <= allowed:
        raise HttpError(400, f'Unknown {name}.')
    return values


@route('GET', r'/api/search')
def search(req):
    """Your planets and files, by words and/or kind, extension, date, colour and traits."""
    q = (req.arg('q') or '').strip()[:100]
    uid = req.user['id']
    where, params = ['b.user_id = ?'], [uid]
    pattern = None
    if q:
        pattern = '%' + q.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_') + '%'
        where.append("(b.title LIKE ? ESCAPE '\\' OR b.description LIKE ? ESCAPE '\\' OR "
                     "b.content LIKE ? ESCAPE '\\' OR b.file_name LIKE ? ESCAPE '\\' OR json_remove(b.meta, '$.look') LIKE ? ESCAPE '\\')")
        params += [pattern] * 5
    kind_list = list_arg(req, 'kind', set(kinds.KINDS))
    if kind_list:
        where.append(f"b.kind IN ({','.join('?' * len(kind_list))})")
        params += kind_list
    exts = [e for e in list_arg(req, 'ext') if re.match(r'^[a-z0-9]{1,10}$', e)]
    if exts:
        where.append(f"b.ext IN ({','.join('?' * len(exts))})")
        params += exts
    for name, op in (('from', '>='), ('to', '<')):
        value = int_arg(req.arg(name), 0, 10 ** 11)
        if value is not None:
            where.append(f'b.created_at {op} ?')
            params.append(value)
    color = req.arg('color')
    if color:
        if color not in LOOK_COLORS:
            raise HttpError(400, 'Unknown colour.')
        where.append(f"json_extract(b.meta, '$.look.colors.{color}') >= 0.08")
    for tag in list_arg(req, 'vibe', LOOK_TAGS):
        where.append("EXISTS (SELECT 1 FROM json_each(b.meta, '$.look.tags') WHERE value = ?)")
        params.append(tag)
    sort = req.arg('sort') or ''
    if sort in SEARCH_SORTS:
        order = SEARCH_SORTS[sort]
    elif color:
        order = f"json_extract(b.meta, '$.look.colors.{color}') DESC, b.created_at DESC"
    else:
        order = SEARCH_SORTS['new']
    offset = int(int_arg(req.arg('offset'), 0, 100_000) or 0)
    blocks = req.db.execute(
        f"SELECT {BLOCK_COLUMNS} FROM blocks b WHERE {' AND '.join(where)} ORDER BY {order} LIMIT ? OFFSET ?",
        (*params, SEARCH_PAGE + 1, offset)).fetchall()
    drawers = []
    if pattern and not offset:
        drawers = req.db.execute(
            "SELECT d.*, (SELECT COUNT(*) FROM connections c WHERE c.drawer_id = d.id) AS n FROM drawers d "
            "WHERE d.user_id = ? AND (d.title LIKE ? ESCAPE '\\' OR d.description LIKE ? ESCAPE '\\') "
            "ORDER BY d.updated_at DESC LIMIT 40", (uid, pattern, pattern)).fetchall()
    return json_response({
        'drawers': [drawer_json(d, d['n'], drawer_previews(req, d['id'])) for d in drawers],
        'blocks': [block_json(b) for b in blocks[:SEARCH_PAGE]],
        'more': len(blocks) > SEARCH_PAGE,
    })


@route('GET', r'/api/see/todo')
def see_todo(req):
    """Your files with a picture that the picture reader hasn't read yet."""
    rows = req.db.execute(
        f"SELECT {BLOCK_COLUMNS} FROM blocks b WHERE b.user_id = ? "
        "AND (b.thumb_key IS NOT NULL OR b.kind = 'image') "
        "AND COALESCE(json_extract(b.meta, '$.see.v'), 0) != ? "
        "ORDER BY b.created_at DESC LIMIT 200", (req.user['id'], sight.VERSION)).fetchall()
    return json_response({'blocks': [block_json(b) for b in rows]})


@route('GET', r'/api/see/model')
def see_model(req):
    """The picture reader's model, served by Mutt itself once it has fetched it."""
    if not sight.model_ready():
        sight.fetch_model()
        raise HttpError(503, 'The picture reader is still being fetched.')
    return file_response(req, sight.model_path(), 'application/octet-stream',
                         cache='public, max-age=31536000, immutable')


@route('GET', r'/api/looks/todo')
def looks_todo(req):
    """Your files with a picture whose colours haven't been measured (the current way) yet."""
    rows = req.db.execute(
        f"SELECT {BLOCK_COLUMNS} FROM blocks b WHERE b.user_id = ? "
        "AND (b.thumb_key IS NOT NULL OR b.kind = 'image') "
        "AND COALESCE(json_extract(b.meta, '$.look.v'), 0) < 2 "
        "ORDER BY b.created_at DESC LIMIT 300", (req.user['id'],)).fetchall()
    return json_response({'blocks': [block_json(b) for b in rows]})


# ---------------------------------------------------------------- books

MARK_KINDS = ('highlight', 'bookmark')
MARK_COLORS = ('yellow', 'green', 'blue', 'pink', 'purple', 'underline')
MAX_MARKS = 5000
MAX_BOOK_TEXT = 40 * 1024 * 1024


def book_path(row):
    return os.path.join(db.user_files_dir(row['user_id']), row['file_key'])


def save_epub_cover(req, block_id, path, cover):
    """An EPUB's own cover becomes its picture everywhere in Mutt."""
    try:
        data, _ = books.epub_part(path, cover)
    except Exception:  # a broken book just keeps no picture
        return
    if len(data) <= MAX_THUMB and kinds.thumb_type(data)[0]:
        save_thumb(req, block_id, data, kinds.thumb_type(data)[0])


def epub_of(row):
    if not row['file_key']:
        return None
    path = book_path(row)
    try:
        stamp = os.stat(path).st_mtime
    except OSError:
        return None
    return books.epub(path, stamp)


def desk_signs(req, row):
    files = req.db.execute('SELECT b.kind, b.content FROM connections c JOIN blocks b ON b.id = c.block_id '
                           'WHERE c.drawer_id = ?', (row['id'],)).fetchall()
    return documents.doc_signs(row['title'], files)


def shelf_signs(req, row):
    files = req.db.execute('SELECT b.* FROM connections c JOIN blocks b ON b.id = c.block_id WHERE c.drawer_id = ?',
                           (row['id'],)).fetchall()
    signs = books.shelf_signs(row['title'], [(f, json.loads(f['meta'] or '{}')) for f in files])
    signs.pop('books')
    return signs


def visible_drawer(req, drawer_id):
    row = req.db.execute('SELECT * FROM drawers WHERE id = ?', (drawer_id,)).fetchone()
    if not row or not drawer_visible(req, row):
        raise HttpError(404, 'That planet does not exist.')
    return row


def mark_json(r):
    return {'id': r['id'], 'kind': r['kind'], 'loc': r['loc'], 'text': r['text'], 'color': r['color'],
            'note': r['note'], 'percent': r['percent'], 'createdAt': ms(r['created_at'])}


def progress_of(req, block_id):
    r = req.db.execute('SELECT loc, percent, updated_at FROM book_progress WHERE user_id = ? AND block_id = ?',
                       (req.user['id'], block_id)).fetchone()
    return {'loc': r['loc'], 'percent': r['percent'], 'at': ms(r['updated_at'])} if r else None


def has_text(req, block_id):
    return bool(req.db.execute('SELECT 1 FROM book_texts WHERE block_id = ?', (block_id,)).fetchone())


@route('GET', r'/api/drawers/(?P<drawer_id>[\w-]+)/shelf')
def drawer_shelf(req, drawer_id):
    """The books on a planet, as the person looking sees them: cover, title,
    author, and how far through each they are."""
    visible_drawer(req, drawer_id)
    rows = req.db.execute('SELECT b.* FROM connections c JOIN blocks b ON b.id = c.block_id WHERE c.drawer_id = ? '
                          'ORDER BY c.position, c.connected_at DESC', (drawer_id,)).fetchall()
    read = {r['block_id']: r for r in req.db.execute(
        'SELECT p.block_id, p.percent, p.updated_at FROM book_progress p JOIN connections c ON c.block_id = p.block_id '
        'WHERE c.drawer_id = ? AND p.user_id = ?', (drawer_id, req.user['id']))}
    texts = {r[0] for r in req.db.execute(
        'SELECT t.block_id FROM book_texts t JOIN connections c ON c.block_id = t.block_id WHERE c.drawer_id = ?',
        (drawer_id,))}
    out = []
    for r in rows:
        meta = json.loads(r['meta'] or '{}')
        fmt = books.book_format(r, meta)
        if not fmt:
            continue
        info = meta.get('book') if isinstance(meta.get('book'), dict) else None
        if fmt == 'epub' and info is None:
            # Added before Mutt read books: read it once now.
            found = epub_of(r)
            info = {'title': found['title'], 'author': found['author']} if found else {}
            if r['user_id'] == req.user['id']:
                meta['book'] = info
                req.db.execute('UPDATE blocks SET meta = ? WHERE id = ?', (json.dumps(meta, ensure_ascii=False), r['id']))
                if found and found['cover'] and not r['thumb_key']:
                    save_epub_cover(req, r['id'], book_path(r), found['cover'])
                    r = req.db.execute('SELECT * FROM blocks WHERE id = ?', (r['id'],)).fetchone()
        info = info or {}
        media_ = meta.get('media') or {}
        progress = read.get(r['id'])
        out.append({
            'id': r['id'], 'format': fmt,
            'title': info.get('title') or media_.get('title') or r['title'] or r['file_name'],
            'author': info.get('author') or media_.get('author'),
            'cover': f"/t/{r['id']}?v={r['thumb_key'][:8]}" if r['thumb_key'] else None,
            'pages': books.pages_of(meta) or None,
            'percent': progress['percent'] if progress else 0,
            'readAt': ms(progress['updated_at']) if progress else None,
            'converted': r['id'] in texts,
            'book': books.is_book(r, meta),
        })
    return json_response({'books': out})


@route('GET', r'/api/books/(?P<block_id>[\w-]+)')
def get_book(req, block_id):
    """Everything the reader needs to open a book, plus where you were and your marks."""
    row, mine = readable_block(req, block_id)
    meta = json.loads(row['meta'] or '{}')
    fmt = books.book_format(row, meta)
    if not fmt or not row['file_key']:
        raise HttpError(404, 'That isn’t a book Mutt can open.')
    media_ = meta.get('media') or {}
    book = {'id': row['id'], 'format': fmt, 'mine': mine, 'title': row['title'], 'author': media_.get('author'),
            'file': f"/f/{row['id']}/{urllib.parse.quote(row['file_name'] or 'file')}",
            'cover': f"/t/{row['id']}?v={row['thumb_key'][:8]}" if row['thumb_key'] else None}
    if fmt == 'epub':
        found = epub_of(row)
        if not found or not found['spine']:
            raise HttpError(422, 'This book couldn’t be opened. The file may be damaged.')
        book.update({k: found[k] for k in ('spine', 'toc', 'dir', 'language', 'publisher')})
        book['title'] = found['title'] or book['title']
        book['author'] = found['author'] or book['author']
    else:
        book['title'] = media_.get('title') or book['title']
        book['pages'] = books.pages_of(meta) or None
        book['converted'] = has_text(req, block_id)
    marks = [mark_json(r) for r in req.db.execute(
        'SELECT * FROM book_marks WHERE user_id = ? AND block_id = ? ORDER BY percent, created_at',
        (req.user['id'], block_id))]
    return json_response({'book': book, 'progress': progress_of(req, block_id), 'marks': marks})


@route('GET', r'/api/books/(?P<block_id>[\w-]+)/part/(?P<name>.+)')
def book_part(req, block_id, name):
    """One chapter or picture from inside an EPUB."""
    row, _ = readable_block(req, block_id)
    if books.book_format(row, {}) != 'epub' or not row['file_key']:
        raise HttpError(404, 'Not found.')
    try:
        data, ctype = books.epub_part(book_path(row), urllib.parse.unquote(name))
    except (KeyError, ValueError, OSError, zipfile.BadZipFile):
        raise HttpError(404, 'That part of the book is missing.')
    return Response(200, [('Content-Type', ctype), ('Content-Length', str(len(data))),
                          ('Cache-Control', 'private, max-age=86400'), ('Content-Security-Policy', FILE_CSP)], data)


def clean_loc(body):
    loc = text_field(body, 'loc', 500, 'Place', strip=False)
    if not loc:
        raise HttpError(400, 'Where in the book is missing.')
    try:
        percent = min(1.0, max(0.0, float(body.get('percent') or 0)))
    except (TypeError, ValueError):
        raise HttpError(400, 'How far through is missing.')
    return loc, percent


@route('PUT', r'/api/books/(?P<block_id>[\w-]+)/progress')
def save_progress(req, block_id):
    readable_block(req, block_id)
    loc, percent = clean_loc(req.json())
    req.db.execute('INSERT INTO book_progress (user_id, block_id, loc, percent, updated_at) VALUES (?, ?, ?, ?, ?) '
                   'ON CONFLICT (user_id, block_id) DO UPDATE SET loc = excluded.loc, percent = excluded.percent, '
                   'updated_at = excluded.updated_at', (req.user['id'], block_id, loc, percent, now()))
    return json_response({'progress': progress_of(req, block_id)})


@route('POST', r'/api/books/(?P<block_id>[\w-]+)/marks')
def add_mark(req, block_id):
    """A highlight (with a colour and maybe a note) or a bookmark, yours only."""
    readable_block(req, block_id)
    body = req.json()
    kind = body.get('kind')
    if kind not in MARK_KINDS:
        raise HttpError(400, 'That kind of mark doesn’t exist.')
    loc, percent = clean_loc(body)
    color = body.get('color') if kind == 'highlight' else None
    if kind == 'highlight' and color not in MARK_COLORS:
        raise HttpError(400, 'That colour doesn’t exist.')
    count = req.db.execute('SELECT COUNT(*) FROM book_marks WHERE user_id = ? AND block_id = ?',
                           (req.user['id'], block_id)).fetchone()[0]
    if count >= MAX_MARKS:
        raise HttpError(400, 'That’s as many marks as one book can hold.')
    mark_id = new_id()
    req.db.execute('INSERT INTO book_marks (id, user_id, block_id, kind, loc, text, color, note, percent, created_at) '
                   'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                   (mark_id, req.user['id'], block_id, kind, loc, text_field(body, 'text', 4000, 'Text') or '',
                    color, text_field(body, 'note', 4000, 'Note') or '', percent, now()))
    row = req.db.execute('SELECT * FROM book_marks WHERE id = ?', (mark_id,)).fetchone()
    return json_response({'mark': mark_json(row)}, status=201)


def own_mark(req, block_id, mark_id):
    row = req.db.execute('SELECT * FROM book_marks WHERE id = ? AND block_id = ? AND user_id = ?',
                         (mark_id, block_id, req.user['id'])).fetchone()
    if not row:
        raise HttpError(404, 'That mark is gone.')
    return row


@route('PATCH', r'/api/books/(?P<block_id>[\w-]+)/marks/(?P<mark_id>[\w-]+)')
def update_mark(req, block_id, mark_id):
    row = own_mark(req, block_id, mark_id)
    body = req.json()
    updates = {}
    if 'color' in body:
        if row['kind'] != 'highlight' or body['color'] not in MARK_COLORS:
            raise HttpError(400, 'That colour doesn’t exist.')
        updates['color'] = body['color']
    note = text_field(body, 'note', 4000, 'Note')
    if note is not None:
        updates['note'] = note
    if updates:
        req.db.execute(f"UPDATE book_marks SET {', '.join(f'{k} = ?' for k in updates)} WHERE id = ?",
                       (*updates.values(), mark_id))
    return json_response({'mark': mark_json(own_mark(req, block_id, mark_id))})


@route('DELETE', r'/api/books/(?P<block_id>[\w-]+)/marks/(?P<mark_id>[\w-]+)')
def delete_mark(req, block_id, mark_id):
    own_mark(req, block_id, mark_id)
    req.db.execute('DELETE FROM book_marks WHERE id = ?', (mark_id,))
    return json_response({'ok': True})


@route('PUT', r'/api/books/(?P<block_id>[\w-]+)/text')
def save_book_text(req, block_id):
    """A PDF turned into reading format (in the browser): its chapters as JSON."""
    row = own_block(req, block_id)
    if row['kind'] != 'pdf':
        raise HttpError(400, 'Only PDFs are turned into reading format.')
    raw = req.read_bytes(MAX_BOOK_TEXT)
    try:
        data = json.loads(raw)
    except ValueError:
        raise HttpError(400, 'That book text could not be read.')
    if not isinstance(data, dict) or data.get('v') != 1 or not isinstance(data.get('chapters'), list) \
            or not data['chapters'] or len(data['chapters']) > 5000:
        raise HttpError(400, 'That book text could not be read.')
    for ch in data['chapters']:
        if not isinstance(ch, dict) or not isinstance(ch.get('blocks'), list):
            raise HttpError(400, 'That book text could not be read.')
    packed = gzip.compress(json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode('utf-8'), 6)
    req.db.execute('INSERT INTO book_texts (block_id, data, made_at) VALUES (?, ?, ?) '
                   'ON CONFLICT (block_id) DO UPDATE SET data = excluded.data, made_at = excluded.made_at',
                   (block_id, packed, now()))
    return json_response({'ok': True, 'chapters': len(data['chapters'])})


@route('GET', r'/api/books/(?P<block_id>[\w-]+)/text')
def get_book_text(req, block_id):
    readable_block(req, block_id)
    r = req.db.execute('SELECT data FROM book_texts WHERE block_id = ?', (block_id,)).fetchone()
    if not r:
        raise HttpError(404, 'This PDF hasn’t been turned into reading format yet.')
    data = bytes(r['data'])
    if 'gzip' in (req.header('Accept-Encoding') or ''):
        headers = [('Content-Encoding', 'gzip'), ('Vary', 'Accept-Encoding')]
    else:
        data, headers = gzip.decompress(data), []
    return Response(200, [('Content-Type', 'application/json; charset=utf-8'), ('Content-Length', str(len(data))),
                          ('Cache-Control', 'no-store'), *headers], data)


@route('DELETE', r'/api/books/(?P<block_id>[\w-]+)/text')
def delete_book_text(req, block_id):
    own_block(req, block_id)
    req.db.execute('DELETE FROM book_texts WHERE block_id = ?', (block_id,))
    return json_response({'ok': True})


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


# ---------------------------------------------------------------- documents

DOC_VERSION_EVERY = 10 * 60   # an automatic version at most this often while writing
DOC_VERSIONS_KEPT = 100       # unnamed ones; named versions are always kept
DOC_IMAGE_TYPES = {'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif'}
MAX_DOC_IMAGE = 8 * 1024 * 1024


def text_block(req, block_id):
    row, mine = readable_block(req, block_id)
    if row['kind'] != 'text':
        raise HttpError(400, 'Only text files open as documents.')
    return row, mine


def doc_json(req, row, mine):
    doc = req.db.execute('SELECT * FROM docs WHERE block_id = ?', (row['id'],)).fetchone()
    # Edited somewhere else since (as a note): the note's words win.
    fresh = bool(doc) and doc['synced_at'] >= row['updated_at'] - 0.001
    return {
        'id': row['id'],
        'html': doc['html'] if fresh else None,
        'settings': documents.settings_of(doc['settings'] if doc else None),
        'reads': documents.reads_as(row['content']),
        'savedAt': ms(doc['updated_at']) if doc else ms(row['updated_at']),
        'mine': mine,
    }


def comment_json(r):
    return {'id': r['id'], 'parentId': r['parent_id'], 'quote': r['quote'], 'prefix': r['prefix'],
            'suffix': r['suffix'], 'body': r['body'], 'resolved': bool(r['resolved']),
            'by': r['username'], 'byId': r['user_id'], 'createdAt': ms(r['created_at']),
            'updatedAt': ms(r['updated_at'])}


def comments_of(req, block_id):
    rows = req.db.execute('SELECT c.*, u.username FROM doc_comments c JOIN users u ON u.id = c.user_id '
                          'WHERE c.block_id = ? ORDER BY c.created_at', (block_id,)).fetchall()
    return [comment_json(r) for r in rows]


def add_version(req, block_id, title, html_text, text, name=''):
    words = documents.word_count(text)
    req.db.execute('INSERT INTO doc_versions (id, block_id, title, html, text, name, words, created_at) '
                   'VALUES (?, ?, ?, ?, ?, ?, ?, ?)', (new_id(), block_id, title or '', html_text, text, name, words, now()))
    old = req.db.execute("SELECT id FROM doc_versions WHERE block_id = ? AND name = '' ORDER BY created_at DESC "
                         'LIMIT -1 OFFSET ?', (block_id, DOC_VERSIONS_KEPT)).fetchall()
    for r in old:
        req.db.execute('DELETE FROM doc_versions WHERE id = ?', (r['id'],))


@route('GET', r'/api/docs/(?P<block_id>[\w-]+)')
def get_doc(req, block_id):
    """A note opened as a document: its fuller version (if the editor has saved
    one since it was last changed as a note), page setup and margin comments."""
    row, mine = text_block(req, block_id)
    block = mark_saved(req, [block_json(row, mine, None if mine else row['owner_name'])])[0]
    return json_response({'doc': doc_json(req, row, mine), 'block': block, 'comments': comments_of(req, block_id)})


@route('PUT', r'/api/docs/(?P<block_id>[\w-]+)')
def save_doc(req, block_id):
    """Save from the editor: `html` (cleaned here), `text` (the same words as a
    note, for the rest of Mutt), `title`, `settings`. Any can be left out."""
    row = own_block(req, block_id)
    if row['kind'] != 'text':
        raise HttpError(400, 'Only text files open as documents.')
    body = req.json()
    doc = req.db.execute('SELECT * FROM docs WHERE block_id = ?', (block_id,)).fetchone()
    stamp = now()
    updates = {}
    title = text_field(body, 'title', 200, 'Title')
    if title is not None:
        updates['title'] = title
    text = text_field(body, 'text', 200_000, 'Text', strip=False)
    if text is not None:
        updates['content'] = text.strip('\n') or ' '
    clean = None
    if 'html' in body:
        try:
            clean = documents.clean_html(body['html'])
        except ValueError:
            raise HttpError(400, 'That document is too large to save.')
    settings = None
    if 'settings' in body:
        try:
            settings = documents.clean_settings(body['settings'], documents.settings_of(doc['settings'] if doc else None))
        except ValueError:
            raise HttpError(400, 'Those page settings could not be saved.')
    if clean is None and doc is None and (updates or settings is not None):
        clean = ''  # first save of settings alone: the note's words stand until the editor sends its own
    if not doc:
        # The note as it was before it became a document, so it can always be got back.
        add_version(req, block_id, row['title'], None, row['content'] or '', name='As a note')
    updates['updated_at'] = stamp
    assignments = ', '.join(f'{k} = ?' for k in updates)
    req.db.execute(f'UPDATE blocks SET {assignments} WHERE id = ?', (*updates.values(), block_id))
    if doc:
        req.db.execute('UPDATE docs SET html = COALESCE(?, html), settings = COALESCE(?, settings), synced_at = ?, '
                       'updated_at = ? WHERE block_id = ?',
                       (clean, json.dumps(settings) if settings is not None else None, stamp, stamp, block_id))
    else:
        req.db.execute('INSERT INTO docs (block_id, html, settings, synced_at, updated_at) VALUES (?, ?, ?, ?, ?)',
                       (block_id, clean or '', json.dumps(settings or documents.DEFAULTS), stamp, stamp))
    if clean:
        last = req.db.execute("SELECT created_at, html FROM doc_versions WHERE block_id = ? AND html IS NOT NULL "
                              'ORDER BY created_at DESC LIMIT 1', (block_id,)).fetchone()
        if not last or (stamp - last['created_at'] >= DOC_VERSION_EVERY and last['html'] != clean):
            add_version(req, block_id, updates.get('title', row['title']), clean,
                        updates.get('content', row['content']) or '')
    fresh = own_block(req, block_id)
    return json_response({'block': block_json(fresh), 'doc': doc_json(req, fresh, True)})


@route('GET', r'/api/docs/(?P<block_id>[\w-]+)/versions')
def doc_versions(req, block_id):
    own_block(req, block_id)
    rows = req.db.execute('SELECT id, title, name, words, created_at FROM doc_versions WHERE block_id = ? '
                          'ORDER BY created_at DESC', (block_id,)).fetchall()
    return json_response({'versions': [{'id': r['id'], 'title': r['title'], 'name': r['name'], 'words': r['words'],
                                        'at': ms(r['created_at'])} for r in rows]})


@route('GET', r'/api/docs/(?P<block_id>[\w-]+)/versions/(?P<version_id>[\w-]+)')
def doc_version(req, block_id, version_id):
    own_block(req, block_id)
    r = req.db.execute('SELECT * FROM doc_versions WHERE id = ? AND block_id = ?', (version_id, block_id)).fetchone()
    if not r:
        raise HttpError(404, 'That version is gone.')
    return json_response({'version': {'id': r['id'], 'title': r['title'], 'name': r['name'], 'html': r['html'],
                                      'text': r['text'], 'words': r['words'], 'at': ms(r['created_at'])}})


@route('POST', r'/api/docs/(?P<block_id>[\w-]+)/versions')
def name_version(req, block_id):
    """Keep how it is now as a named version."""
    row = own_block(req, block_id)
    name = text_field(req.json(), 'name', 80, 'Name') or 'Saved version'
    doc = req.db.execute('SELECT * FROM docs WHERE block_id = ?', (block_id,)).fetchone()
    fresh = doc and doc['synced_at'] >= row['updated_at'] - 0.001
    add_version(req, block_id, row['title'], doc['html'] if fresh and doc['html'] else None, row['content'] or '', name=name)
    return doc_versions(req, block_id)


@route('PATCH', r'/api/docs/(?P<block_id>[\w-]+)/versions/(?P<version_id>[\w-]+)')
def rename_version(req, block_id, version_id):
    own_block(req, block_id)
    name = text_field(req.json(), 'name', 80, 'Name') or ''
    req.db.execute('UPDATE doc_versions SET name = ? WHERE id = ? AND block_id = ?', (name, version_id, block_id))
    return doc_versions(req, block_id)


@route('POST', r'/api/docs/(?P<block_id>[\w-]+)/img')
def add_doc_image(req, block_id):
    """A picture put into a document. It lives with the document, not as a file of its own."""
    own_block(req, block_id)
    mime = (req.header('CONTENT_TYPE') or '').split(';')[0].strip().lower()
    if mime not in DOC_IMAGE_TYPES:
        raise HttpError(400, 'Pictures in a document can be PNG, JPEG, WebP or GIF.')
    data = req.read_bytes(MAX_DOC_IMAGE)
    if not data:
        raise HttpError(400, 'That picture was empty.')
    image_id = new_id()
    req.db.execute('INSERT INTO doc_images (id, block_id, mime, data, created_at) VALUES (?, ?, ?, ?, ?)',
                   (image_id, block_id, mime, data, now()))
    return json_response({'src': f'/api/docs/{block_id}/img/{image_id}'}, status=201)


@route('GET', r'/api/docs/(?P<block_id>[\w-]+)/img/(?P<image_id>[\w-]+)')
def get_doc_image(req, block_id, image_id):
    readable_block(req, block_id)
    r = req.db.execute('SELECT mime, data FROM doc_images WHERE id = ? AND block_id = ?', (image_id, block_id)).fetchone()
    if not r:
        raise HttpError(404, 'That picture is gone.')
    return Response(200, [('Content-Type', r['mime']), ('Content-Length', str(len(r['data']))),
                          ('Cache-Control', 'private, max-age=31536000, immutable'),
                          ('Content-Security-Policy', FILE_CSP)], r['data'])


@route('GET', r'/api/docs/(?P<block_id>[\w-]+)/comments')
def get_doc_comments(req, block_id):
    text_block(req, block_id)
    return json_response({'comments': comments_of(req, block_id)})


@route('POST', r'/api/docs/(?P<block_id>[\w-]+)/comments')
def add_doc_comment(req, block_id):
    """A comment in the margin, by anyone who can see the document. It's tied
    to the words it was made on (quote, with a little before and after)."""
    text_block(req, block_id)
    body = req.json()
    text = text_field(body, 'body', 4000, 'Comment')
    if not text:
        raise HttpError(400, 'Write a comment first.')
    parent = body.get('parent')
    if parent:
        p = req.db.execute('SELECT id, parent_id FROM doc_comments WHERE id = ? AND block_id = ?', (parent, block_id)).fetchone()
        if not p:
            raise HttpError(404, 'That comment is gone.')
        parent = p['parent_id'] or p['id']
    quote = '' if parent else (text_field(body, 'quote', 2000, 'Quote') or '')
    prefix = '' if parent else (text_field(body, 'prefix', 64, 'Quote', strip=False) or '')
    suffix = '' if parent else (text_field(body, 'suffix', 64, 'Quote', strip=False) or '')
    stamp = now()
    req.db.execute('INSERT INTO doc_comments (id, block_id, user_id, parent_id, quote, prefix, suffix, body, created_at, updated_at) '
                   'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                   (new_id(), block_id, req.user['id'], parent or None, quote, prefix, suffix, text, stamp, stamp))
    return json_response({'comments': comments_of(req, block_id)}, status=201)


def comment_row(req, block_id, comment_id):
    r = req.db.execute('SELECT c.*, b.user_id AS doc_owner FROM doc_comments c JOIN blocks b ON b.id = c.block_id '
                       'WHERE c.id = ? AND c.block_id = ?', (comment_id, block_id)).fetchone()
    if not r:
        raise HttpError(404, 'That comment is gone.')
    return r


@route('PATCH', r'/api/docs/(?P<block_id>[\w-]+)/comments/(?P<comment_id>[\w-]+)')
def edit_doc_comment(req, block_id, comment_id):
    """Its writer can change the words; they or the document's owner can mark it done."""
    text_block(req, block_id)
    r = comment_row(req, block_id, comment_id)
    body = req.json()
    me = req.user['id']
    if 'body' in body:
        if r['user_id'] != me:
            raise HttpError(403, 'Only who wrote a comment can change it.')
        text = text_field(body, 'body', 4000, 'Comment')
        if not text:
            raise HttpError(400, 'Write a comment first.')
        req.db.execute('UPDATE doc_comments SET body = ?, updated_at = ? WHERE id = ?', (text, now(), comment_id))
    if 'resolved' in body:
        if me not in (r['user_id'], r['doc_owner']):
            raise HttpError(403, 'Only the document’s owner or who wrote it can mark a comment done.')
        req.db.execute('UPDATE doc_comments SET resolved = ? WHERE id = ?', (1 if body['resolved'] else 0, comment_id))
    return json_response({'comments': comments_of(req, block_id)})


@route('DELETE', r'/api/docs/(?P<block_id>[\w-]+)/comments/(?P<comment_id>[\w-]+)')
def delete_doc_comment(req, block_id, comment_id):
    text_block(req, block_id)
    r = comment_row(req, block_id, comment_id)
    if req.user['id'] not in (r['user_id'], r['doc_owner']):
        raise HttpError(403, 'Only the document’s owner or who wrote it can delete a comment.')
    req.db.execute('DELETE FROM doc_comments WHERE id = ?', (comment_id,))
    return json_response({'comments': comments_of(req, block_id)})


def doc_preview(raw):
    """The start of a document, for its page on the desk (no pictures)."""
    cut = raw[:5000]
    if len(raw) > 5000:
        cut = cut[:cut.rfind('>') + 1]
    return documents.clean_html(re.sub(r'<img\b[^>]*>', '', cut))


@route('GET', r'/api/drawers/(?P<drawer_id>[\w-]+)/docs')
def drawer_docs(req, drawer_id):
    """The writing on a planet, for its desk: how long each piece is, whether
    it reads as a poem, its page setup and open comments."""
    visible_drawer(req, drawer_id)
    rows = req.db.execute(
        'SELECT b.id, b.content, b.updated_at, d.settings, d.synced_at, d.html, '
        '(SELECT COUNT(*) FROM doc_comments k WHERE k.block_id = b.id AND k.resolved = 0 AND k.parent_id IS NULL) AS open '
        "FROM connections c JOIN blocks b ON b.id = c.block_id LEFT JOIN docs d ON d.block_id = b.id "
        "WHERE c.drawer_id = ? AND b.kind = 'text'", (drawer_id,)).fetchall()
    out = []
    for r in rows:
        settings = documents.settings_of(r['settings'])
        fresh = r['synced_at'] is not None and r['synced_at'] >= r['updated_at'] - 0.001 and r['html']
        layout = settings['layout'] if settings['layout'] != 'auto' else documents.reads_as(r['content'])
        out.append({'id': r['id'], 'words': documents.word_count(r['content']), 'poem': layout == 'poem',
                    'font': settings['font'], 'comments': r['open'], 'html': doc_preview(r['html']) if fresh else None,
                    'editedAt': ms(r['updated_at'])})
    return json_response({'docs': out})


@route('POST', r'/api/docs')
def new_doc(req):
    """A new, empty document on a planet (or a star, with no planet)."""
    body = req.json()
    drawer_id = target_drawer(req, body.get('drawer'))
    title = text_field(body, 'title', 200, 'Title') or ''
    block_id = insert_block(req, kind='text', title=title, content=' ')
    if drawer_id:
        connect(req.db, block_id, drawer_id, None)
    return json_response({'block': reload_block(req, block_id)}, status=201)
