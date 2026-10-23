"""HTTP API: accounts, drawers, blocks, connections, bundles, files."""
import json
import os
import random
import re
import secrets
import shutil
import sqlite3
import time
import urllib.parse

from . import auth, db, kinds, links
from .web import HttpError, file_response, json_response, route, stream_to_file

MAX_UPLOAD = int(float(os.environ.get('MUTT_MAX_UPLOAD_MB', '512')) * 1024 * 1024)
MAX_THUMB = 8 * 1024 * 1024
ALLOW_SIGNUPS = os.environ.get('MUTT_ALLOW_SIGNUPS', '1').lower() not in ('0', 'false', 'no', 'off')

ICON_SIZE = 9
ICON_RE = re.compile(r'^[0-3]{81}$')
COLOR_RE = re.compile(r'^#[0-9a-fA-F]{6}$')
PALETTE = ['#FF5C39', '#2F6BFF', '#14B86A', '#FFB020', '#A66BFF', '#FF6FB0', '#00B2C6', '#9A6240']


def now():
    return time.time()


def ms(t):
    return int(t * 1000) if t else None


def new_id():
    return secrets.token_urlsafe(9)


def fmt_wait(seconds):
    if seconds < 90:
        return f'{seconds} seconds'
    if seconds < 5400:
        return f'{round(seconds / 60)} minutes'
    return 'an hour'


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


def drawer_json(row, count=None, previews=None):
    data = {
        'id': row['id'],
        'title': row['title'],
        'description': row['description'],
        'icon': json.loads(row['icon']),
        'createdAt': ms(row['created_at']),
        'updatedAt': ms(row['updated_at']),
    }
    if count is not None:
        data['count'] = count
    if previews is not None:
        data['previews'] = previews
    return data


def block_json(row):
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
    }
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
        raise HttpError(404, 'That block does not exist.')
    return row


def reload_block(req, block_id):
    return block_json(own_block(req, block_id))


def block_connections(req, block_id):
    rows = req.db.execute(
        'SELECT d.*, c.position FROM connections c JOIN drawers d ON d.id = c.drawer_id '
        'WHERE c.block_id = ? ORDER BY c.connected_at', (block_id,)).fetchall()
    return [drawer_json(r) for r in rows]


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
    return own_drawer(req, drawer_id)['id']


# ---------------------------------------------------------------- accounts

@route('GET', r'/api/me', auth=False)
def me(req):
    if not req.user:
        raise HttpError(401, 'Please sign in.', signups=ALLOW_SIGNUPS)
    return json_response({'user': user_json(req.user)})


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
        raise HttpError(400, 'Your PIN needs to be 4 digits.')
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
    return json_response({'user': user_json(user)}, headers=[auth.cookie_header(req, token)])


@route('POST', r'/api/auth/login', auth=False)
def login(req):
    ip = req.client_ip
    wait = auth.login_failures_by_ip.retry_after(ip)
    if wait:
        raise HttpError(429, f'Too many tries. Wait {fmt_wait(wait)} and try again.', retryAfter=wait)
    body = req.json()
    username = auth.normalize_username(body.get('username'))
    pin = str(body.get('pin') or '')
    if not auth.PIN_RE.match(pin):
        raise HttpError(400, 'Your PIN is 4 digits.')
    user = req.db.execute('SELECT * FROM users WHERE username = ?', (username,)).fetchone()
    if not user:
        auth.burn_time(pin)
        auth.login_failures_by_ip.hit(ip)
        raise HttpError(401, "That username and PIN don't match.")
    stamp = now()
    if user['locked_until'] > stamp:
        wait = int(user['locked_until'] - stamp) + 1
        raise HttpError(429, f'Too many wrong PINs. Try again in {fmt_wait(wait)}.', retryAfter=wait)
    if not auth.check_pin(pin, user['pin_salt'], user['pin_hash']):
        failed = user['failed'] + 1
        lock = auth.lock_seconds(failed)
        req.db.execute('UPDATE users SET failed = ?, locked_until = ? WHERE id = ?',
                       (failed, stamp + lock if lock else 0, user['id']))
        auth.login_failures_by_ip.hit(ip)
        if lock:
            raise HttpError(429, f'Too many wrong PINs. Try again in {fmt_wait(lock)}.', retryAfter=lock)
        left = auth.FREE_ATTEMPTS - failed
        raise HttpError(401, "That username and PIN don't match.", attemptsLeft=left if left <= 2 else None)
    req.db.execute('UPDATE users SET failed = 0, locked_until = 0 WHERE id = ?', (user['id'],))
    token = auth.create_session(req.db, user['id'])
    if random.random() < 0.05:
        auth.prune_sessions(req.db)
    return json_response({'user': user_json(user)}, headers=[auth.cookie_header(req, token)])


@route('POST', r'/api/auth/logout', auth=False)
def logout(req):
    auth.end_session(req.db, req.session_token)
    return json_response({'ok': True}, headers=[auth.clear_cookie_header(req)])


def require_pin(req, pin, label='PIN'):
    if not auth.PIN_RE.match(pin or '') or not auth.check_pin(pin, req.user['pin_salt'], req.user['pin_hash']):
        auth.login_failures_by_ip.hit(req.client_ip)
        raise HttpError(403, f'That {label} is not right.')


@route('POST', r'/api/me/pin')
def change_pin(req):
    body = req.json()
    if auth.login_failures_by_ip.retry_after(req.client_ip):
        raise HttpError(429, 'Too many tries. Wait a few minutes.')
    require_pin(req, str(body.get('current') or ''), 'current PIN')
    new_pin = str(body.get('next') or '')
    if not auth.PIN_RE.match(new_pin):
        raise HttpError(400, 'Your new PIN needs to be 4 digits.')
    pin_hash, salt = auth.new_pin_hash(new_pin)
    req.db.execute('UPDATE users SET pin_hash = ?, pin_salt = ? WHERE id = ?', (pin_hash, salt, req.user['id']))
    auth.end_other_sessions(req.db, req.user['id'], req.session_token)
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


# ---------------------------------------------------------------- drawers

def drawer_previews(req, drawer_id, limit=3):
    rows = req.db.execute(
        'SELECT b.* FROM connections c JOIN blocks b ON b.id = c.block_id '
        'WHERE c.drawer_id = ? ORDER BY c.position, c.connected_at DESC LIMIT ?', (drawer_id, limit)).fetchall()
    return [block_json(r) for r in rows]


@route('GET', r'/api/drawers')
def list_drawers(req):
    rows = req.db.execute(
        'SELECT d.*, (SELECT COUNT(*) FROM connections c WHERE c.drawer_id = d.id) AS n '
        'FROM drawers d WHERE d.user_id = ? ORDER BY d.updated_at DESC', (req.user['id'],)).fetchall()
    lite = req.arg('lite') == '1'
    drawers = [drawer_json(r, r['n'], None if lite else drawer_previews(req, r['id'])) for r in rows]
    total = req.db.execute('SELECT COUNT(*) FROM blocks WHERE user_id = ?', (req.user['id'],)).fetchone()[0]
    return json_response({'drawers': drawers, 'totalBlocks': total})


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
        raise HttpError(400, 'Could not add those blocks.')
    drawer_id = new_id()
    stamp = now()
    with db.transaction(req.db):
        req.db.execute(
            'INSERT INTO drawers (id, user_id, title, description, icon, created_at, updated_at) '
            'VALUES (?, ?, ?, ?, ?, ?, ?)',
            (drawer_id, req.user['id'], title, description, json.dumps(icon), stamp, stamp))
        position = 0
        for block_id in block_ids:
            owned = req.db.execute('SELECT 1 FROM blocks WHERE id = ? AND user_id = ?',
                                   (str(block_id), req.user['id'])).fetchone()
            if owned:
                req.db.execute('INSERT OR IGNORE INTO connections (block_id, drawer_id, position, connected_at) '
                               'VALUES (?, ?, ?, ?)', (str(block_id), drawer_id, position, stamp))
                position += 1
    row = own_drawer(req, drawer_id)
    return json_response({'drawer': drawer_json(row, position, [])}, status=201)


@route('GET', r'/api/drawers/(?P<drawer_id>[\w-]+)')
def get_drawer(req, drawer_id):
    row = own_drawer(req, drawer_id)
    blocks = req.db.execute(
        f'SELECT {BLOCK_COLUMNS} FROM connections c JOIN blocks b ON b.id = c.block_id '
        'WHERE c.drawer_id = ? ORDER BY c.position, c.connected_at DESC', (drawer_id,)).fetchall()
    return json_response({'drawer': drawer_json(row, len(blocks)), 'blocks': [block_json(b) for b in blocks]})


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
    if updates:
        updates['updated_at'] = now()
        assignments = ', '.join(f'{k} = ?' for k in updates)
        req.db.execute(f'UPDATE drawers SET {assignments} WHERE id = ?', (*updates.values(), drawer_id))
    row = own_drawer(req, drawer_id)
    count = req.db.execute('SELECT COUNT(*) FROM connections WHERE drawer_id = ?', (drawer_id,)).fetchone()[0]
    return json_response({'drawer': drawer_json(row, count)})


ORPHANS_SQL = (
    'SELECT b.id, b.file_key, b.thumb_key FROM connections c JOIN blocks b ON b.id = c.block_id '
    'WHERE c.drawer_id = ? AND (SELECT COUNT(*) FROM connections c2 WHERE c2.block_id = b.id) = 1')


@route('GET', r'/api/drawers/(?P<drawer_id>[\w-]+)/orphans')
def drawer_orphans(req, drawer_id):
    own_drawer(req, drawer_id)
    return json_response({'count': len(req.db.execute(ORPHANS_SQL, (drawer_id,)).fetchall())})


@route('DELETE', r'/api/drawers/(?P<drawer_id>[\w-]+)')
def delete_drawer(req, drawer_id):
    own_drawer(req, drawer_id)
    orphans = req.db.execute(ORPHANS_SQL, (drawer_id,)).fetchall() if req.arg('blocks') == 'orphans' else []
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


# ---------------------------------------------------------------- blocks

@route('GET', r'/api/blocks')
def list_blocks(req):
    kind = req.arg('kind')
    params = [req.user['id']]
    where = 'b.user_id = ?'
    if kind:
        if kind not in kinds.KINDS:
            raise HttpError(400, 'Unknown kind.')
        where += ' AND b.kind = ?'
        params.append(kind)
    rows = req.db.execute(f'SELECT {BLOCK_COLUMNS} FROM blocks b WHERE {where} '
                          'ORDER BY b.created_at DESC LIMIT 5000', params).fetchall()
    return json_response({'blocks': [block_json(r) for r in rows]})


def save_thumb(req, block_id, data, ext):
    key = f't_{secrets.token_hex(10)}.{ext}'
    with open(os.path.join(db.user_files_dir(req.user['id']), key), 'wb') as f:
        f.write(data)
    old = req.db.execute('SELECT thumb_key FROM blocks WHERE id = ?', (block_id,)).fetchone()
    req.db.execute('UPDATE blocks SET thumb_key = ?, updated_at = ? WHERE id = ?', (key, now(), block_id))
    if old and old['thumb_key']:
        remove_block_files(req.user['id'], old['thumb_key'])


@route('POST', r'/api/blocks')
def create_block(req):
    body = req.json()
    content = text_field(body, 'content', 200_000, 'Text', strip=False) or ''
    title = text_field(body, 'title', 200, 'Title') or ''
    drawer_id = target_drawer(req, body.get('drawer'))
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
                                    meta={'source': stripped, 'domain': info.get('domain')})
        else:
            block_id = insert_block(req, kind='link', title=title or info.get('title') or stripped,
                                    content=stripped, meta=info)
            if preview:
                save_thumb(req, block_id, *preview)
    else:
        block_id = insert_block(req, kind='text', title=title, content=content.strip('\n'))

    if drawer_id:
        connect(req.db, block_id, drawer_id)
    return json_response({'block': reload_block(req, block_id)}, status=201)


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
    block_id = insert_block(req, kind=kind, title=title[:200], file_key=key, file_name=name,
                            mime=mime, ext=ext, size=size, meta=meta)
    if drawer_id:
        connect(req.db, block_id, drawer_id)
    return json_response({'block': reload_block(req, block_id)}, status=201)


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
    if pages:
        meta['pages'] = int(pages)
    req.db.execute('UPDATE blocks SET width = COALESCE(?, width), height = COALESCE(?, height), '
                   'duration = COALESCE(?, duration), meta = ? WHERE id = ?',
                   (int(width) if width else None, int(height) if height else None, duration,
                    json.dumps(meta, ensure_ascii=False), block_id))
    return json_response({'block': reload_block(req, block_id)})


@route('GET', r'/api/blocks/(?P<block_id>[\w-]+)')
def get_block(req, block_id):
    row = own_block(req, block_id)
    return json_response({'block': block_json(row), 'connections': block_connections(req, block_id)})


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
            raise HttpError(400, 'A text block needs some text.')
        updates['content'] = content.strip('\n')
    for key, high in (('width', 100000), ('height', 100000), ('duration', 10 ** 7)):
        if key in body:
            value = int_arg(body[key], 0, high)
            if value is not None:
                updates[key] = value
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
    drawer_id = own_drawer(req, str(body.get('drawer') or ''))['id']
    position = body.get('position')
    position = float(position) if isinstance(position, (int, float)) else None
    connect(req.db, block_id, drawer_id, position)
    return json_response({'block': reload_block(req, block_id), 'connections': block_connections(req, block_id)})


@route('DELETE', r'/api/blocks/(?P<block_id>[\w-]+)/connections/(?P<drawer_id>[\w-]+)')
def remove_connection(req, block_id, drawer_id):
    own_block(req, block_id)
    own_drawer(req, drawer_id)
    found = req.db.execute('SELECT position FROM connections WHERE block_id = ? AND drawer_id = ?',
                           (block_id, drawer_id)).fetchone()
    req.db.execute('DELETE FROM connections WHERE block_id = ? AND drawer_id = ?', (block_id, drawer_id))
    req.db.execute('UPDATE drawers SET updated_at = ? WHERE id = ?', (now(), drawer_id))
    return json_response({
        'block': reload_block(req, block_id),
        'connections': block_connections(req, block_id),
        'position': found['position'] if found else None,
    })


# ---------------------------------------------------------------- bundles & search

@route('GET', r'/api/bundles')
def bundles(req):
    counts = dict(req.db.execute('SELECT kind, COUNT(*) FROM blocks WHERE user_id = ? GROUP BY kind',
                                 (req.user['id'],)).fetchall())
    result = []
    for kind in kinds.KINDS:
        if not counts.get(kind):
            continue
        covers = req.db.execute(
            'SELECT * FROM blocks WHERE user_id = ? AND kind = ? '
            'ORDER BY CASE WHEN thumb_key IS NOT NULL OR kind = \'image\' THEN 0 ELSE 1 END, created_at DESC '
            'LIMIT 3', (req.user['id'], kind)).fetchall()
        result.append({'kind': kind, 'count': counts[kind], 'covers': [block_json(c) for c in covers]})
    return json_response({'bundles': result, 'total': sum(counts.values())})


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


# ---------------------------------------------------------------- files

FILE_CSP = "sandbox; default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'"


@route('GET', r'/f/(?P<block_id>[\w-]+)(?:/[^/]*)?')
def serve_file(req, block_id):
    row = own_block(req, block_id)
    if not row['file_key']:
        raise HttpError(404, 'This block has no file.')
    path = os.path.join(db.user_files_dir(req.user['id']), row['file_key'])
    content_type, inline, sandbox = kinds.serving(row['kind'], row['mime'] or '', row['ext'] or '')
    disposition = 'attachment' if req.arg('dl') == '1' or not inline else 'inline'
    headers = [('Content-Security-Policy', FILE_CSP)] if sandbox else []
    return file_response(req, path, content_type, filename=row['file_name'], disposition=disposition,
                         headers=headers)


@route('GET', r'/t/(?P<block_id>[\w-]+)')
def serve_thumb(req, block_id):
    row = own_block(req, block_id)
    if not row['thumb_key']:
        raise HttpError(404, 'No preview yet.')
    path = os.path.join(db.user_files_dir(req.user['id']), row['thumb_key'])
    ext = row['thumb_key'].rsplit('.', 1)[-1]
    return file_response(req, path, kinds.THUMB_TYPES.get(ext, 'application/octet-stream'),
                         headers=[('Content-Security-Policy', FILE_CSP)])
