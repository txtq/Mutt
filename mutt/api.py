"""HTTP API: accounts, settings, galaxies, drawers (planets), files (blocks), connections."""
import gzip
import hmac
import json
import os
import random
import re
import secrets
import shutil
import sqlite3
import threading
import time
import traceback
import urllib.parse
import zipfile
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone

from . import auth, books, convert, db, documents, export, hear, kinds, links, live, media, privacy, quotes, recipes, sight, sorting, transcode, webpush, when
from . import modes as modes_registry
from . import split as split_moons
from .web import HttpError, Response, content_disposition, file_response, json_response, route, stream_to_file

MAX_UPLOAD = int(float(os.environ.get('MUTT_MAX_UPLOAD_MB', '50')) * 1024 * 1024)
MAX_THUMB = 8 * 1024 * 1024
UNLOCK_TTL = 12 * 60 * 60
ALLOW_SIGNUPS = os.environ.get('MUTT_ALLOW_SIGNUPS', '1').lower() not in ('0', 'false', 'no', 'off')
# Whoever runs this Mutt: the usernames told of reset requests on their own
# galaxy (MUTT_ADMIN, comma-separated), and a key that lets a script outside
# Mutt (a check run by Claude) read the requests and make links (MUTT_ADMIN_KEY).
ADMINS = {n.strip().lower().lstrip('@') for n in os.environ.get('MUTT_ADMIN', '').split(',') if n.strip()}
ADMIN_KEY = os.environ.get('MUTT_ADMIN_KEY', '').strip()

ICON_RE = re.compile(r'^[0-3]{81}$')
COLOR_RE = re.compile(r'^#[0-9a-fA-F]{6}$')
USERNAME_PATH = r'(?P<username>[a-z0-9][a-z0-9_.-]{0,22}[a-z0-9])'
PALETTE = ['#FF5C39', '#2F6BFF', '#14B86A', '#FFB020', '#A66BFF', '#FF6FB0', '#00B2C6', '#9A6240']
VISIBILITY = ('private', 'pin', 'people', 'public')
# The kinds of planet (public/assets/js/planets.js draws them, in this order; DESIGN.md "Planets" says how to add one).
PLANET_LOOKS = ('ocean', 'terran', 'gas', 'pale', 'lava', 'ice', 'desert', 'storm', 'lagoon', 'bloom', 'haze', 'pearl',
                'dust', 'twilight')
# A planet with no kind of its own gets one from its id. Planets made before there were twelve keep
# drawing from the first eight, so none changed; `twelve` tells the page which a planet is.
TWELVE_SINCE = 1795132800   # 2026-11-20: safely after the day the twelve kinds went live, so no planet made before then changes


def twelve(row):
    return row['created_at'] >= TWELVE_SINCE
MOON_LOOKS = ('luna', 'io', 'europa', 'titan', 'enceladus', 'triton', 'phobos', 'hyperion', 'iapetus', 'callisto')
# What a planet with no kind of its own draws from (planets.js FIRST_KINDS; same order).
FIRST_LOOKS = ('ocean', 'terran', 'gas', 'lava', 'ice', 'desert', 'pearl', 'storm')
# A new planet or moon is given a kind its owner's galaxy doesn't show yet; once every
# kind is shown, the one shown least. Ties go in this order, so neighbours differ.
FRESH_PLANETS = ('ocean', 'lava', 'ice', 'dust', 'gas', 'bloom', 'desert', 'twilight', 'terran', 'storm', 'pearl',
                 'lagoon', 'haze', 'pale')
FRESH_MOONS = ('luna', 'io', 'europa', 'titan', 'triton', 'callisto', 'enceladus', 'phobos', 'iapetus', 'hyperion')


def first_draw(text):
    """The first number util.js `seeded(text)` gives, so the server knows which kind an id draws."""
    m = 0xFFFFFFFF
    seed = 2166136261
    for ch in text:
        seed = ((seed ^ ord(ch)) * 16777619) & m
    seed = (seed + 0x6D2B79F5) & m
    t = ((seed ^ (seed >> 15)) * (1 | seed)) & m
    t = ((t + (((t ^ (t >> 7)) * (61 | t)) & m)) & m) ^ t
    return ((t ^ (t >> 14)) & m) / 4294967296


def shown_look(row):
    """The kind a planet or moon is drawn as: its own, or the one its id gives (planets.js lookOf)."""
    if row['parent_id']:
        if row['look'] in MOON_LOOKS:
            return row['look']
        return MOON_LOOKS[int(first_draw(f"moon:{row['id']}") * len(MOON_LOOKS))]
    if row['look'] in PLANET_LOOKS:
        return row['look']
    pool = PLANET_LOOKS if twelve(row) else FIRST_LOOKS
    return pool[int(first_draw(f"look:{row['id']}") * len(pool))]


def fresh_look(conn, user_id, parent_id=None):
    """A kind for a new planet (or a moon of `parent_id`) that the galaxy shows least."""
    moon = parent_id is not None
    rows = conn.execute('SELECT id, look, created_at, parent_id FROM drawers WHERE user_id = ? AND parent_id IS '
                        + ('NOT NULL' if moon else 'NULL'), (user_id,)).fetchall()
    shown = {}
    here = {}
    for r in rows:
        look = shown_look(r)
        shown[look] = shown.get(look, 0) + 1
        if moon and r['parent_id'] == parent_id:
            here[look] = here.get(look, 0) + 1
    order = FRESH_MOONS if moon else FRESH_PLANETS
    # A moon first differs from the moons beside it, then from every moon in the galaxy.
    return min(order, key=lambda k: (here.get(k, 0), shown.get(k, 0), order.index(k)))
MAX_MOONS = 8
LAYOUT_REACH = (2000, 4000)  # how far from the void a planet can be put (x, y)

PREF_CHOICES = {
    'size': {'s', 'm', 'l'},
    'motion': {'fluid', 'calm', 'off'},
    'sky': {'vita', 'nebula', 'aurora', 'dusk'},
    'music': {'on', 'off'},
    'sound': {'on', 'off'},
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
    return {'username': row['username'], 'name': row['display_name'], 'createdAt': ms(row['created_at'])}


def me_json(req, row, short=None):
    """You, as your own pages see you: also whether you've a recovery key,
    whether you run this Mutt (and so are told of reset requests), and
    `oldCode` when you still sign in with 4 digits."""
    if short is None:
        short = bool(row['short_code']) if 'short_code' in row.keys() else False
    return {**user_json(row), 'hasKey': bool(row['recovery_hash']), 'admin': is_admin_name(row['username']),
            'sendKeys': req.db.execute('SELECT COUNT(*) FROM send_keys WHERE user_id = ?', (row['id'],)).fetchone()[0],
            'oldCode': short, 'canBeam': anyone_else(req.db, row['id']),
            'beamStops': req.db.execute('SELECT COUNT(*) FROM beam_stops WHERE user_id = ?', (row['id'],)).fetchone()[0]}


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
        'twelve': twelve(row),
        'x': row['x'] if 'x' in row.keys() else None,
        'y': row['y'] if 'y' in row.keys() else None,
        'parentId': row['parent_id'] if 'parent_id' in row.keys() else None,
        'modes': shown_modes(row),
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
    meta = dict(raw) if isinstance(raw, dict) else json.loads(raw or '{}')
    meta.pop('unplaced', None)
    if not mine:
        meta.pop('sortWhenSeen', None)
    see = meta.get('see')
    if isinstance(see, dict):
        if mine:
            meta['see'] = {'v': see.get('v')}
        else:
            meta.pop('see')
    if not mine and isinstance(meta.get('media'), dict):
        meta['media'] = {k: v for k, v in meta['media'].items() if k not in ('gps', 'location', 'taken', 'camera')}
    # An edited picture: where its original is kept stays on the server; how it was edited is its owner's.
    original = meta.pop('original', None)
    if not mine:
        meta.pop('edit', None)
        if isinstance(meta.get('beamedBy'), dict):   # who beamed it shows, as `savedFrom` does; their words are for the two of them
            meta['beamedBy'] = {k: v for k, v in meta['beamedBy'].items() if k != 'words'}
    elif isinstance(original, dict):
        meta['original'] = {k: original.get(k) for k in ('file_name', 'ext', 'size', 'width', 'height')}
    return meta


def drawer_modes(row):
    try:
        return json.loads(row['modes'] or '{}') if 'modes' in row.keys() else {}
    except ValueError:
        return {}


def shown_modes(row):
    """A planet's modes as the page gets them: what a split moved (kept for
    its Undo) stays on the server."""
    saved = drawer_modes(row)
    if isinstance(saved.get('split'), dict) and 'last' in saved['split']:
        saved['split'] = {k: v for k, v in saved['split'].items() if k != 'last'}
    return saved


LIST_DEFAULTS = modes_registry.LIST_DEFAULTS


def clean_modes(value, current, moon=False):
    """Check the modes a planet's owner is setting (mutt/modes.py checks every
    mode's settings the same way); returns the whole new value."""
    return modes_registry.clean(value, current, moon=moon)


def block_json(row, mine=True, owner=None):
    keys = row.keys()
    raw = json.loads(row['meta'] or '{}')
    meta = public_meta(raw, mine)
    file_url = None
    if row['file_key']:
        # A PDF marked up in Mutt is written anew each time; its address changes with it.
        rev = raw.get('rev')
        file_url = (f"/f/{row['id']}/" + (f"r{int(rev)}/" if isinstance(rev, int) else '')
                    + urllib.parse.quote(row['file_name'] or 'file'))
        if isinstance(raw.get('original'), dict):
            file_url += f"?e={row['file_key'][:8]}"  # an edited picture: a new address for each edit
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
        'meta': meta,
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
    if 'comment_count' in keys:
        data['commentCount'] = row['comment_count']
    if 'version_count' in keys and mine and row['kind'] == 'text':
        data['versions'] = row['version_count']  # earlier copies kept in its history (owner only)
    return data


BLOCK_COLUMNS = ('b.*, (SELECT COUNT(*) FROM connections cc WHERE cc.block_id = b.id) AS conn_count, '
                 '(SELECT COUNT(*) FROM file_comments fc WHERE fc.block_id = b.id) AS comment_count, '
                 '(SELECT COUNT(*) FROM doc_versions dv WHERE dv.block_id = b.id) AS version_count')


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

def keeper_of(conn, drawer):
    """The other keeper of a planet kept together (a moon asks its planet), or None."""
    planet_id = (drawer['parent_id'] if 'parent_id' in drawer.keys() else None) or drawer['id']
    row = conn.execute('SELECT user_id FROM drawer_keepers WHERE drawer_id = ?', (planet_id,)).fetchone()
    return row['user_id'] if row else None


def keeps(conn, drawer, user_id):
    """Does this person keep this planet (or this moon's planet): its owner, or its other keeper?"""
    return drawer['user_id'] == user_id or keeper_of(conn, drawer) == user_id


def own_drawer(req, drawer_id, owner_only=False):
    """A planet you keep: your own, or one kept together with you (both keepers
    can do everything to it but delete it). `owner_only` for what only its
    owner may do."""
    row = req.db.execute('SELECT * FROM drawers WHERE id = ?', (drawer_id,)).fetchone()
    if not row or not (row['user_id'] == req.user['id'] if owner_only else keeps(req.db, row, req.user['id'])):
        raise HttpError(404, 'That planet does not exist.')
    return row


def own_block(req, block_id, deleted=False):
    """One of your files. A deleted one only when `deleted` asks for it."""
    row = req.db.execute(f'SELECT {BLOCK_COLUMNS} FROM blocks b WHERE b.id = ? AND b.user_id = ?'
                         + ('' if deleted else ' AND b.deleted_at IS NULL'),
                         (block_id, req.user['id'])).fetchone()
    if not row:
        raise HttpError(404, 'That file does not exist.')
    return row


def is_unlocked(req, row):
    """Has this session opened a Code planet with the planet's own code?"""
    if keeps(req.db, row, req.user['id']):
        return True
    if not row['share_hash']:
        return False
    return bool(req.db.execute(
        'SELECT 1 FROM drawer_unlocks WHERE session_hash = ? AND drawer_id = ? AND expires_at > ?',
        (auth.session_key(req.session_token), row['id'], now())).fetchone())


def drawer_visible(req, row):
    """Can the signed-in person look inside this drawer (planet)? A moon is
    never more open than its planet: both have to let you in. Both keepers
    of a planet kept together always can."""
    if keeps(req.db, row, req.user['id']):
        return True
    parent_id = row['parent_id'] if 'parent_id' in row.keys() else None
    parent = None
    if parent_id:
        parent = req.db.execute('SELECT * FROM drawers WHERE id = ?', (parent_id,)).fetchone()
        if not parent or not drawer_visible(req, parent):
            return False
    visibility = row['visibility']
    if row['community'] and visibility == 'public':
        return True
    if visibility == 'public':
        return True
    if visibility == 'people':
        return bool(req.db.execute('SELECT 1 FROM drawer_access WHERE drawer_id = ? AND user_id = ?',
                                   (row['id'], req.user['id'])).fetchone())
    if (visibility == 'pin' and parent and parent['visibility'] == 'pin'
            and not (row['share_hash'] if 'share_hash' in row.keys() else None)):
        return True  # a Code moon of a Code planet, with no code of its own, opens with its planet's
    return visibility == 'pin' and is_unlocked(req, row)


def writable_drawer(req, drawer_id):
    row = req.db.execute('SELECT * FROM drawers WHERE id = ?', (drawer_id,)).fetchone()
    if not row or not (keeps(req.db, row, req.user['id']) or (row['community'] and row['visibility'] == 'public')):
        raise HttpError(404, 'That planet does not exist.')
    return row


def in_community_drawer(req, block_id):
    return bool(req.db.execute(
        'SELECT 1 FROM connections c JOIN drawers d ON d.id = c.drawer_id '
        "WHERE c.block_id = ? AND d.community = 1 AND d.visibility = 'public' LIMIT 1", (block_id,)).fetchone())


def readable_block(req, block_id, deleted=False, beamed=True):
    """Your own file, a shared one, or one on a planet you're allowed to see,
    or one beamed to you that waits for your answer (not with `beamed=False`:
    such a file can be looked at, not commented on or saved).
    A deleted file is gone for everyone, except its owner when `deleted` asks
    (its picture in Recently deleted)."""
    row = req.db.execute(
        f'SELECT {BLOCK_COLUMNS}, u.username AS owner_name FROM blocks b JOIN users u ON u.id = b.user_id '
        'WHERE b.id = ?', (block_id,)).fetchone()
    if row and row['deleted_at'] and not (deleted and row['user_id'] == req.user['id']):
        row = None
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
    if beamed and req.db.execute('SELECT 1 FROM beams WHERE block_id = ? AND to_id = ? AND answer IS NULL',
                                 (block_id, req.user['id'])).fetchone():
        return row, False
    # the dish photo of a recipe card beamed to you comes with the card
    if beamed and req.db.execute(
            'SELECT 1 FROM beams bm JOIN blocks r ON r.id = bm.block_id WHERE bm.to_id = ? AND bm.answer IS NULL '
            "AND r.user_id = ? AND json_extract(r.meta, '$.recipe.photo') = ?",
            (req.user['id'], row['user_id'], block_id)).fetchone():
        return row, False
    raise HttpError(404, 'That file does not exist.')


def reload_block(req, block_id):
    return block_json(own_block(req, block_id))


def block_connections(req, block_id):
    rows = req.db.execute(
        'SELECT d.*, c.position FROM connections c JOIN drawers d ON d.id = c.drawer_id '
        'WHERE c.block_id = ? ORDER BY c.connected_at', (block_id,)).fetchall()
    return [drawer_json(r) for r in rows if drawer_visible(req, r)]


def connect(conn, block_id, drawer_id, position=None, placed='hand'):
    """Put a file on a planet. placed: 'hand' (its owner did) or 'auto' (autosort did)."""
    if position is None:
        low = conn.execute('SELECT MIN(position) FROM connections WHERE drawer_id = ?', (drawer_id,)).fetchone()[0]
        position = low - 1 if low is not None else 0
    conn.execute('INSERT OR IGNORE INTO connections (block_id, drawer_id, position, connected_at, placed) '
                 'VALUES (?, ?, ?, ?, ?)', (block_id, drawer_id, position, now(), placed))
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
        "WHERE user_id = ? AND deleted_at IS NULL AND json_extract(meta, '$.savedFrom.id') IS NOT NULL",
        (req.user['id'],))}


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


# A recipe card's dish photo, copied with the card (saved or beamed, `copy_block`), goes where its
# card goes and is no star of its own while the card is there (`meta.dishOf`).
DISH_KEPT = ("AND NOT EXISTS (SELECT 1 FROM blocks r WHERE r.id = json_extract(b.meta, '$.dishOf') "
             'AND r.deleted_at IS NULL) ')


def user_stats(conn, user_id):
    files = conn.execute('SELECT COUNT(*) FROM blocks WHERE user_id = ? AND deleted_at IS NULL', (user_id,)).fetchone()[0]
    drawers = conn.execute('SELECT COUNT(*) FROM drawers WHERE user_id = ? AND parent_id IS NULL', (user_id,)).fetchone()[0]
    stars = conn.execute(
        'SELECT COUNT(*) FROM blocks b WHERE b.user_id = ? AND b.deleted_at IS NULL AND NOT EXISTS '
        f'(SELECT 1 FROM connections c WHERE c.block_id = b.id) {DISH_KEPT}', (user_id,)).fetchone()[0]
    return {'files': files, 'drawers': drawers, 'stars': stars}


# ---------------------------------------------------------------- live (mutt/live.py)

@route('GET', r'/api/live')
def live_stream(req):
    """One open page's stream of notices: what changed elsewhere, to look at again."""
    tab = (req.query.get('tab') or [''])[0]
    if not live.TAB_RE.match(tab):
        raise HttpError(400, 'Which page is this?')
    body = live.stream(req.user['id'], tab)
    if body is None:
        raise HttpError(400, 'Which page is this?')
    return Response(200, [
        ('Content-Type', 'text/event-stream; charset=utf-8'),
        ('Cache-Control', 'no-store'),
        ('X-Accel-Buffering', 'no'),   # proxies pass each notice on at once
    ], body)


@route('POST', r'/api/live/watch')
def live_watch(req):
    """What an open page shows now: a planet (only one you may see) or someone's galaxy."""
    body = req.json()
    tab = str(body.get('tab') or '')
    if not live.TAB_RE.match(tab):
        raise HttpError(400, 'Which page is this?')
    planet = galaxy = None
    if body.get('planet'):
        row = req.db.execute('SELECT * FROM drawers WHERE id = ?', (str(body['planet']),)).fetchone()
        if row and drawer_visible(req, row):
            planet = row['id']
    if body.get('galaxy'):
        row = req.db.execute('SELECT id FROM users WHERE username = ?', (str(body['galaxy']).lower(),)).fetchone()
        galaxy = row['id'] if row else None
    if not live.watch(req.user['id'], tab, planet=planet, galaxy=galaxy):
        planet = galaxy = None   # someone else's page
    return json_response({'planet': planet, 'galaxy': galaxy is not None})


# ---------------------------------------------------------------- health

@route('GET', r'/api/health', auth=False)
def health(req):
    req.db.execute('SELECT 1').fetchone()
    # `forwarded`: how many addresses reached Mutt in X-Forwarded-For (never the
    # addresses), so MUTT_PROXY_HOPS can be checked: send one yourself and the
    # count is yours plus the number of proxies.
    return json_response({'ok': True, 'persistentStorage': db.PERSISTENT, 'forwarded': len(req.forwarded)})


# ---------------------------------------------------------------- accounts

@route('GET', r'/api/me', auth=False)
def me(req):
    if not req.user:
        raise HttpError(401, 'Please sign in.', signups=ALLOW_SIGNUPS)
    headers = []
    if not auth.known_device(req.db, req.user['id'], req.cookie(auth.DEVICE_COOKIE)):
        headers.append(auth.remember_device(req, req.db, req.user['id']))  # signed in before device cookies
    return json_response({'user': me_json(req, req.user), 'prefs': user_prefs(req.user),
                          'stats': user_stats(req.db, req.user['id'])}, headers=headers)


@route('GET', r'/api/auth/available', auth=False)
def username_available(req):
    name = auth.normalize_username(req.arg('username'))
    problem = auth.username_problem(name)
    taken = not problem and bool(req.db.execute('SELECT 1 FROM users WHERE username = ?', (name,)).fetchone())
    if taken:
        problem = 'That username is taken.'
    # `taken` lets the sign-in page tell "this is someone, ask for their code"
    # from "this name can't be used".
    return json_response({'available': not problem, 'reason': problem, 'taken': taken})


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
    problem = auth.pin_problem(pin)
    if problem:
        raise HttpError(400, problem, weakPin=True)
    pin_hash, salt = auth.new_pin_hash(pin)
    key = auth.new_recovery_key()
    key_hash, key_salt = auth.new_key_hash(key)
    try:
        with db.transaction(req.db):
            cursor = req.db.execute(
                'INSERT INTO users (username, pin_hash, pin_salt, created_at, recovery_hash, recovery_salt, recovery_at) '
                'VALUES (?, ?, ?, ?, ?, ?, ?)',
                (username, pin_hash, salt, now(), key_hash, key_salt, now()))
            token = auth.create_session(req.db, cursor.lastrowid)
    except sqlite3.IntegrityError:
        raise HttpError(409, 'That username is taken.')
    auth.signups_by_ip.hit(ip)
    user = req.db.execute('SELECT * FROM users WHERE id = ?', (cursor.lastrowid,)).fetchone()
    return json_response({'user': me_json(req, user, False), 'prefs': {}, 'stats': {'files': 0, 'drawers': 0},
                          'recoveryKey': key},
                         headers=[auth.cookie_header(req, token), auth.remember_device(req, req.db, user['id'])])


@route('POST', r'/api/auth/check-pin', auth=False)
def check_new_pin(req):
    """Is a code someone is picking too easy to guess? Says why, or nothing."""
    return json_response({'problem': auth.pin_problem(str(req.json().get('pin') or ''))})


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
        raise HttpError(400, 'Codes are 4 or 6 digits.')
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
        raise HttpError(401, 'That username and code don’t match.')
    try:
        pin_gate(req, user, pin, device=req.cookie(auth.DEVICE_COOKIE))
    except HttpError as err:
        if err.status == 401:
            err.message = 'That username and code don’t match.'
        raise
    token = auth.create_session(req.db, user['id'])
    short = len(pin) == 4
    req.db.execute('UPDATE users SET short_code = ? WHERE id = ?', (1 if short else 0, user['id']))
    if random.random() < 0.05:
        auth.prune_sessions(req.db)
    return json_response({'user': me_json(req, user, short), 'prefs': user_prefs(user),
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
    if body.get('forgot'):
        # Forgotten it, but still signed in here: a browser that signed in to
        # this account may set a new code without the old one.
        if not auth.known_device(req.db, req.user['id'], req.cookie(auth.DEVICE_COOKIE)):
            raise HttpError(403, 'Only a device you’ve signed in on before can do this.')
    else:
        require_pin(req, str(body.get('current') or ''), 'current code')
    new_pin = str(body.get('next') or '')
    problem = auth.pin_problem(new_pin)
    if problem:
        raise HttpError(400, problem.replace('Your code', 'Your new code'), weakPin=True)
    if uses_planet_code(req, new_pin):
        raise HttpError(400, 'That’s the code for one of your planets. Pick a different one.')
    pin_hash, salt = auth.new_pin_hash(new_pin)
    req.db.execute('UPDATE users SET pin_hash = ?, pin_salt = ?, short_code = 0 WHERE id = ?', (pin_hash, salt, req.user['id']))
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
    with db.transaction(req.db):
        # Planets kept with someone stay with them, with a copy of every file this account had on them.
        for planet in req.db.execute(
                'SELECT d.* FROM drawers d WHERE d.parent_id IS NULL AND (d.id IN (SELECT drawer_id FROM drawer_keepers '
                'WHERE user_id = ?) OR (d.user_id = ? AND d.id IN (SELECT drawer_id FROM drawer_keepers)))',
                (user_id, user_id)).fetchall():
            tell_other_keeper(req, planet, 'gone')
            part_ways(req.db, planet, user_id, leaving=False)
        req.db.execute('DELETE FROM users WHERE id = ?', (user_id,))
    shutil.rmtree(os.path.join(db.FILES_DIR, str(int(user_id))), ignore_errors=True)
    return json_response({'ok': True}, headers=[auth.clear_cookie_header(req)])


# ---------------------------------------------------------------- getting back in

reset_requests_by_ip = auth.RateLimiter(limit=5, window=60 * 60)


def is_admin_name(username):
    return username in ADMINS


def require_admin(req):
    """You run this Mutt: signed in as one of MUTT_ADMIN, or carrying MUTT_ADMIN_KEY."""
    given = req.header('X-Mutt-Admin') or ''
    if ADMIN_KEY and given and hmac.compare_digest(given.encode(), ADMIN_KEY.encode()):
        return
    if req.user and is_admin_name(req.user['username']):
        return
    if given:
        auth.login_failures_by_ip.hit(req.client_ip)
    raise HttpError(404, 'Not found.')


def set_new_code(req, user, pin):
    """A new sign-in code for someone who couldn't get in: every other
    sign-in ends, misses are forgotten, and they get a fresh recovery key.
    Returns the response that signs them in here."""
    problem = auth.pin_problem(pin)
    if problem:
        raise HttpError(400, problem, weakPin=True)
    pin_hash, salt = auth.new_pin_hash(pin)
    key = auth.new_recovery_key()
    key_hash, key_salt = auth.new_key_hash(key)
    with db.transaction(req.db):
        req.db.execute('UPDATE users SET pin_hash = ?, pin_salt = ?, short_code = 0, recovery_hash = ?, recovery_salt = ?, recovery_at = ? '
                       'WHERE id = ?', (pin_hash, salt, key_hash, key_salt, now(), user['id']))
        req.db.execute('DELETE FROM sessions WHERE user_id = ?', (user['id'],))
        req.db.execute('DELETE FROM login_failures WHERE user_id = ?', (user['id'],))
        req.db.execute("UPDATE reset_requests SET state = 'done', answered_at = ? WHERE user_id = ? "
                       "AND state IN ('waiting', 'sent')", (now(), user['id']))
        token = auth.create_session(req.db, user['id'])
    user = req.db.execute('SELECT * FROM users WHERE id = ?', (user['id'],)).fetchone()
    return json_response({'user': me_json(req, user), 'prefs': user_prefs(user),
                          'stats': user_stats(req.db, user['id']), 'recoveryKey': key},
                         headers=[auth.cookie_header(req, token), auth.remember_device(req, req.db, user['id'])])


@route('PUT', r'/api/me/name')
def set_name(req):
    """The name you'd like to be called. Any words, or none: it's never checked against anything."""
    name = auth.clean_name(text_field(req.json(), 'name', 200, 'Your name'))
    req.db.execute('UPDATE users SET display_name = ? WHERE id = ?', (name, req.user['id']))
    return json_response({'name': name})


@route('POST', r'/api/me/recovery-key')
def make_recovery_key(req):
    """A new recovery key, shown once; the old one stops working."""
    key = auth.new_recovery_key()
    key_hash, key_salt = auth.new_key_hash(key)
    req.db.execute('UPDATE users SET recovery_hash = ?, recovery_salt = ?, recovery_at = ? WHERE id = ?',
                   (key_hash, key_salt, now(), req.user['id']))
    return json_response({'recoveryKey': key})


SEND_KEYS_MOST = 10


@route('POST', r'/api/me/send-key')
def make_send_key(req):
    """A key for the "Send to Mutt" shortcut on one more device, shown once. Each device
    has its own, so setting up a phone never stops the computer's; past `SEND_KEYS_MOST`
    the one used longest ago ends."""
    key = auth.new_send_key()
    req.db.execute('INSERT INTO send_keys (key_hash, user_id, made_at) VALUES (?, ?, ?)',
                   (auth.send_key_hash(key), req.user['id'], now()))
    req.db.execute('DELETE FROM send_keys WHERE user_id = ? AND key_hash NOT IN (SELECT key_hash FROM send_keys '
                   'WHERE user_id = ? ORDER BY COALESCE(used_at, made_at) DESC LIMIT ?)',
                   (req.user['id'], req.user['id'], SEND_KEYS_MOST))
    count = req.db.execute('SELECT COUNT(*) FROM send_keys WHERE user_id = ?', (req.user['id'],)).fetchone()[0]
    return json_response({'sendKey': key, 'sendKeys': count})


@route('DELETE', r'/api/me/send-key')
def end_send_keys(req):
    """Turns the Share menu off: every device's key stops working."""
    req.db.execute('DELETE FROM send_keys WHERE user_id = ?', (req.user['id'],))
    return json_response({'sendKeys': 0})


@route('POST', r'/api/auth/recover', auth=False)
def recover(req):
    """Forgot your code: your recovery key lets you pick a new one. The key is
    spent, and a new one is given."""
    body = req.json()
    ip = req.client_ip
    wait = auth.login_failures_by_ip.retry_after(ip)
    if wait:
        raise HttpError(429, f'Too many tries. Wait {auth.format_wait(wait)} and try again.', retryAfter=wait)
    pin = str(body.get('pin') or '')
    problem = auth.pin_problem(pin)
    if problem:
        raise HttpError(400, problem, weakPin=True)
    user = req.db.execute('SELECT * FROM users WHERE username = ?',
                          (auth.normalize_username(body.get('username')),)).fetchone()
    if not user:
        auth.burn_time(pin)
        auth.login_failures_by_ip.hit(ip)
        raise HttpError(401, 'That key isn’t right.')
    failure = auth.try_key(req.db, user, body.get('key'), ip)
    if failure:
        status, message, extra = failure
        raise HttpError(status, message, **extra)
    return set_new_code(req, user, pin)


@route('POST', r'/api/auth/reset-request', auth=False)
def request_reset(req):
    """Ask whoever runs Mutt for a link to set a new code. The answer is the
    same whether or not the name is someone's, and one waiting request per
    account is kept (asking again only updates its note)."""
    ip = req.client_ip
    wait = reset_requests_by_ip.retry_after(ip)
    if wait:
        raise HttpError(429, f'You’ve asked a few times already. Try again in {auth.format_wait(wait)}.', retryAfter=wait)
    reset_requests_by_ip.hit(ip)
    body = req.json()
    note = text_field(body, 'note', 300, 'Your note') or ''
    user = req.db.execute('SELECT id FROM users WHERE username = ?',
                          (auth.normalize_username(body.get('username')),)).fetchone()
    if user:
        waiting = req.db.execute("SELECT id FROM reset_requests WHERE user_id = ? AND state = 'waiting'",
                                 (user['id'],)).fetchone()
        if waiting:
            req.db.execute('UPDATE reset_requests SET note = ?, created_at = ? WHERE id = ?', (note, now(), waiting['id']))
        else:
            req.db.execute('INSERT INTO reset_requests (id, user_id, note, source, created_at) VALUES (?, ?, ?, ?, ?)',
                           (new_id(), user['id'], note, auth.source_key(ip), now()))
    return json_response({'ok': True})


def reset_link_user(req, token):
    row = req.db.execute('SELECT u.* FROM reset_links l JOIN users u ON u.id = l.user_id '
                         'WHERE l.token_hash = ? AND l.used_at IS NULL AND l.expires_at > ?',
                         (auth.reset_token_hash(token), now())).fetchone()
    if not row:
        raise HttpError(404, 'This link has run out or been used. Ask for a new one.')
    return row


@route('GET', r'/api/auth/reset/(?P<token>[\w-]{20,80})', auth=False)
def reset_link(req, token):
    user = reset_link_user(req, token)
    return json_response({'username': user['username']})


@route('POST', r'/api/auth/reset/(?P<token>[\w-]{20,80})', auth=False)
def use_reset_link(req, token):
    if auth.login_failures_by_ip.retry_after(req.client_ip):
        raise HttpError(429, 'Too many tries. Wait a few minutes.')
    user = reset_link_user(req, token)
    pin = str(req.json().get('pin') or '')
    response = set_new_code(req, user, pin)
    req.db.execute('UPDATE reset_links SET used_at = ? WHERE token_hash = ?', (now(), auth.reset_token_hash(token)))
    return response


def admin_request_json(row):
    return {'id': row['id'], 'username': row['username'], 'name': row['display_name'], 'note': row['note'],
            'hasKey': bool(row['recovery_hash']), 'createdAt': ms(row['created_at'])}


@route('GET', r'/api/admin/resets', auth=False)
def admin_resets(req):
    """Requests for a reset that no one has answered yet, oldest first."""
    require_admin(req)
    rows = req.db.execute("SELECT r.*, u.username, u.display_name, u.recovery_hash FROM reset_requests r "
                          "JOIN users u ON u.id = r.user_id WHERE r.state = 'waiting' ORDER BY r.created_at").fetchall()
    return json_response({'requests': [admin_request_json(r) for r in rows]})


def make_reset_link(req, user_id):
    """A one-time link to set a new code, good for three days. Any older
    link for the same account stops working."""
    token, token_hash = auth.new_reset_token()
    req.db.execute('DELETE FROM reset_links WHERE user_id = ?', (user_id,))
    req.db.execute('INSERT INTO reset_links (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
                   (token_hash, user_id, now(), now() + auth.RESET_LINK_TTL))
    scheme = 'https' if req.is_secure else 'http'
    return {'link': f'{scheme}://{req.host}/login?reset={token}', 'expiresAt': ms(now() + auth.RESET_LINK_TTL)}


@route('POST', r'/api/admin/resets/(?P<request_id>[\w-]+)/(?P<answer>link|wave)', auth=False)
def answer_reset(req, request_id, answer):
    require_admin(req)
    row = req.db.execute("SELECT * FROM reset_requests WHERE id = ? AND state = 'waiting'", (request_id,)).fetchone()
    if not row:
        raise HttpError(404, 'That request has already been answered.')
    req.db.execute('UPDATE reset_requests SET state = ?, answered_at = ? WHERE id = ?',
                   ('sent' if answer == 'link' else 'waved', now(), request_id))
    return json_response(make_reset_link(req, row['user_id']) if answer == 'link' else {'ok': True})


@route('POST', r'/api/admin/users/' + USERNAME_PATH + r'/reset-link', auth=False)
def admin_link_for(req, username):
    """A link for someone who asked some other way (in person, by message)."""
    require_admin(req)
    user = find_user(req, username)
    req.db.execute("UPDATE reset_requests SET state = 'sent', answered_at = ? WHERE user_id = ? AND state = 'waiting'",
                   (now(), user['id']))
    return json_response(make_reset_link(req, user['id']))


# ---------------------------------------------------------------- look & feel

@route('GET', r'/api/me/export')
def export_everything(req):
    """All your files, a folder per planet, and everything Mutt keeps about you, as one zip."""
    # `mark` comes back as a short-lived cookie once the zip is packed (or failed), so the
    # page can say "Packing your galaxy…" until the download has really started.
    mark = req.arg('mark') or ''
    told = re.fullmatch(r'[a-z0-9]{1,16}', mark)
    try:
        tmp, size, name = export.build(req.db, req.user['id'])
    except Exception:
        if told:
            req.extra_headers.append(('Set-Cookie', f'mutt-export={mark}.x; Path=/; Max-Age=120; SameSite=Lax'))
        raise
    if told:
        req.extra_headers.append(('Set-Cookie', f'mutt-export={mark}; Path=/; Max-Age=120; SameSite=Lax'))
    return Response(200, [
        ('Content-Type', 'application/zip'),
        ('Content-Length', str(size)),
        ('Content-Disposition', content_disposition('attachment', name)),
        ('Cache-Control', 'no-store'),
    ], export.stream(tmp))


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
        'SELECT b.*, c.checked, u.username AS owner_name FROM connections c JOIN blocks b ON b.id = c.block_id '
        'JOIN users u ON u.id = b.user_id '
        f'WHERE c.drawer_id = ? ORDER BY {order} LIMIT ?', (drawer_id, limit)).fetchall()
    me_id = req.user['id']
    return [block_json(r, mine=r['user_id'] == me_id, owner=None if r['user_id'] == me_id else r['owner_name'])
            for r in rows]


def blocks_in_drawer(req, drawer_id, community=False):
    rows = req.db.execute(
        f'SELECT {BLOCK_COLUMNS}, c.checked, u.username AS owner_name, u.display_name AS owner_display FROM connections c '
        'JOIN blocks b ON b.id = c.block_id '
        'JOIN users u ON u.id = b.user_id '
        'WHERE c.drawer_id = ? ORDER BY c.position, c.connected_at DESC', (drawer_id,)).fetchall()
    me_id = req.user['id']
    blocks = []
    for r in rows:
        b = block_json(r, mine=r['user_id'] == me_id, owner=None if r['user_id'] == me_id else r['owner_name'])
        if not b['mine'] and r['owner_display']:
            b['ownerName'] = r['owner_display']   # the name they gave, shown in place of @username
        if community and not b['mine']:
            b['community'] = True
        blocks.append(b)
    return also_on(req, mark_saved(req, blocks), drawer_id)


def also_on(req, blocks, here_id):
    """Which other planets (and moons) each file on a planet is on, as far as
    this person may see them: the "also on" under a file box and in the file
    view. Only files on more than one planet are looked up."""
    ids = [b['id'] for b in blocks if (b.get('connectionCount') or 0) > 1]
    found = {}
    seen = {}
    for start in range(0, len(ids), 500):
        part = ids[start:start + 500]
        rows = req.db.execute(
            'SELECT c.block_id, d.* FROM connections c JOIN drawers d ON d.id = c.drawer_id '
            f"WHERE c.drawer_id != ? AND c.block_id IN ({','.join('?' * len(part))}) ORDER BY c.connected_at",
            (here_id, *part)).fetchall()
        for r in rows:
            if r['id'] not in seen:
                seen[r['id']] = drawer_visible(req, r)
            if seen[r['id']]:
                found.setdefault(r['block_id'], []).append(
                    {'id': r['id'], 'title': r['title'], 'icon': {'c': json.loads(r['icon']).get('c')},
                     'parentId': r['parent_id']})
    for b in blocks:
        if b['id'] in found:
            b['alsoOn'] = found[b['id']]
    return blocks


def drawers_of(req, user_id, with_previews, owner=None):
    rows = req.db.execute(
        'SELECT d.*, (SELECT COUNT(*) FROM connections c WHERE c.drawer_id = d.id) AS n '
        'FROM drawers d WHERE (d.user_id = ? OR d.id IN (SELECT drawer_id FROM drawer_keepers WHERE user_id = ?)) '
        'AND d.parent_id IS NULL ORDER BY d.updated_at DESC', (user_id, user_id)).fetchall()
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


def planet_use(req, row):
    """How used a planet is, 0 (forgotten) to 1 (busy today), from when a file was last added to it or
    changed on it. The galaxy draws it: weather on a busy planet, dust on a forgotten one. Busy for a day,
    calm (0.5) by a week, the first dust at a month (under USE_DUST), all of it at three."""
    last = req.db.execute('SELECT MAX(c.connected_at), MAX(b.updated_at) FROM connections c JOIN blocks b ON b.id = c.block_id '
                          'WHERE c.drawer_id = ?', (row['id'],)).fetchone()
    days = (now() - max(last[0] or 0, last[1] or 0, row['created_at'])) / 86400
    for start, end, high, low in USE_STEPS:
        if days < end:
            return round(high + (low - high) * max(0.0, days - start) / (end - start), 3)
    return 0.0


USE_DUST = 0.385   # under this a planet gathers dust (the painter's `1 - use * 2.6`)
# (from day, to day, use at the start, use at the end)
USE_STEPS = ((0, 1, 1.0, 1.0), (1, 7, 1.0, 0.5), (7, 30, 0.5, USE_DUST), (30, 90, USE_DUST, 0.0))


def planet_json(req, row, count, previews=None, locked=False):
    data = drawer_json(row, count, previews)
    if previews is not None and not row['parent_id']:
        # everyone who can open a planet sees how used it is; a locked one says nothing
        data['use'] = planet_use(req, row)
    if not data['parentId']:
        data['moons'] = [] if locked else moons_of(req, row['id'])
    if previews is not None:
        # The peek on hover shows what was put here last.
        data['recent'] = drawer_previews(req, row['id'], limit=4, newest=True) if previews else []
    keeper = keeper_of(req.db, row)
    data['mine'] = row['user_id'] == req.user['id'] or keeper == req.user['id']
    if keeper:
        # Kept together: both keepers, and for each of them the other one.
        pair = {r['id']: r for r in req.db.execute('SELECT id, username, display_name FROM users WHERE id IN (?, ?)',
                                                     (row['user_id'], keeper))}
        data['keepers'] = [person(pair.get(row['user_id'])), person(pair.get(keeper))]
        if data['mine']:
            data['keptWith'] = person(pair.get(keeper if row['user_id'] == req.user['id'] else row['user_id']))
    if data['mine'] and row['visibility'] == 'people':
        data['people'] = planet_people(req, row['id'])
    if locked:
        data['locked'] = True
        data['description'] = ''
    return data


def private_planet(row):
    return {'id': row['id'], 'title': '', 'icon': {'c': json.loads(row['icon']).get('c')}, 'look': row['look'], 'twelve': twelve(row),
            'x': row['x'], 'y': row['y'], 'count': 0, 'moons': [], 'locked': True, 'private': True,
            'mine': False, 'visibility': 'private', 'hasCode': False}


def galaxy_rows(conn, user_id):
    """The planets in someone's galaxy: their own, and those they keep together
    with someone else's (`kept_here`, placed at `kx`/`ky`)."""
    return conn.execute(
        'SELECT * FROM (SELECT d.*, (SELECT COUNT(*) FROM connections c WHERE c.drawer_id = d.id) AS n, '
        '0 AS kept_here, NULL AS kx, NULL AS ky FROM drawers d WHERE d.user_id = ? AND d.parent_id IS NULL '
        'UNION ALL SELECT d.*, (SELECT COUNT(*) FROM connections c WHERE c.drawer_id = d.id) AS n, '
        '1 AS kept_here, k.x AS kx, k.y AS ky FROM drawers d JOIN drawer_keepers k ON k.drawer_id = d.id '
        'WHERE k.user_id = ?) ORDER BY created_at', (user_id, user_id)).fetchall()


def galaxy_of(req, owner):
    """Someone's planets as you're allowed to see them, plus your own loose stars."""
    mine = owner['id'] == req.user['id']
    rows = galaxy_rows(req.db, owner['id'])
    planets = []
    for r in rows:
        if mine or drawer_visible(req, r):
            p = planet_json(req, r, r['n'], drawer_previews(req, r['id'], limit=12))
        elif r['visibility'] == 'pin':
            p = planet_json(req, r, r['n'], locked=True)
        else:
            # Private planets, and people-only ones you're not on, show
            # blurred: where they are and what kind, never their name or files.
            p = private_planet(r)
        if r['kept_here']:
            p['x'], p['y'] = r['kx'], r['ky']   # where its other keeper put it in their own galaxy
        if p.get('keepers'):
            # the one it is shared with, seen from this galaxy: its second light and "with Rae"
            p['pairWith'] = next((k for k in p['keepers'] if k and k['username'] != owner['username']), None)
        planets.append(p)
    open_ids = {p['id'] for p in planets if not p.get('locked')}
    open_ids |= {m['id'] for p in planets for m in p.get('moons') or [] if not m.get('locked')}
    data = {
        'user': {**user_json(owner), 'you': mine},
        'planets': planets,
        'threads': planet_threads(req, [p['id'] for p in planets], open_ids),
    }
    if mine:
        stars = req.db.execute(
            f'SELECT {BLOCK_COLUMNS} FROM blocks b WHERE b.user_id = ? AND b.deleted_at IS NULL AND NOT EXISTS '
            f'(SELECT 1 FROM connections c WHERE c.block_id = b.id) {DISH_KEPT}ORDER BY b.created_at DESC LIMIT 3000',
            (owner['id'],)).fetchall()
        data['stars'] = [block_json(r) for r in stars]
        data['constellations'] = constellations_of(req.db, owner['id'])
        data['stats'] = user_stats(req.db, owner['id'])
        # files beamed to you that wait for an answer (the galaxy fetches them only if there are some)
        data['beams'] = req.db.execute(
            'SELECT COUNT(*) FROM beams bm JOIN blocks b ON b.id = bm.block_id '
            'WHERE bm.to_id = ? AND bm.answer IS NULL AND b.deleted_at IS NULL', (owner['id'],)).fetchone()[0]
    return data


def planet_threads(req, planet_ids, open_ids):
    """The threads between the planets of one galaxy (`planet_ids`, kept
    planets included): each pair of planets that share files, and how many.
    A moon counts as its planet. Only planets (and moons) this person can
    open are counted, so a thread never gives away a private one."""
    if not planet_ids:
        return []
    marks = ','.join('?' * len(planet_ids))
    rows = req.db.execute(
        'SELECT c1.block_id, c1.drawer_id AS da, c2.drawer_id AS db, '
        'COALESCE(d1.parent_id, d1.id) AS a, COALESCE(d2.parent_id, d2.id) AS b '
        'FROM connections c1 JOIN connections c2 ON c2.block_id = c1.block_id AND c2.drawer_id > c1.drawer_id '
        'JOIN drawers d1 ON d1.id = c1.drawer_id JOIN drawers d2 ON d2.id = c2.drawer_id '
        f'WHERE COALESCE(d1.parent_id, d1.id) IN ({marks}) AND COALESCE(d2.parent_id, d2.id) IN ({marks})',
        (*planet_ids, *planet_ids)).fetchall()
    pairs = {}
    for r in rows:
        if r['a'] == r['b'] or r['da'] not in open_ids or r['db'] not in open_ids:
            continue
        pairs.setdefault(tuple(sorted((r['a'], r['b']))), set()).add(r['block_id'])
    return [{'a': a, 'b': b, 'n': len(files)} for (a, b), files in sorted(pairs.items())]


def saved_copies(req):
    return saved_copies_of(req.db)


def saved_copies_of(conn):
    """Every saved copy there is: {copy id: (the id it was saved from, the id
    of the first one, who saved it, whom they saved it from)}. The first one
    is `madeBy` when the copy carries it (saved since 2026-11-15); older copies
    are followed back along `savedFrom`."""
    rows = conn.execute(
        "SELECT id, user_id, deleted_at, json_extract(meta, '$.savedFrom.id') AS src, "
        "json_extract(meta, '$.savedFrom.username') AS src_name, json_extract(meta, '$.madeBy.id') AS root "
        "FROM blocks WHERE json_extract(meta, '$.savedFrom.id') IS NOT NULL").fetchall()
    parent = {r['id']: r['src'] for r in rows}
    out = {}
    for r in rows:
        root = r['root']
        if not root:
            root = r['src']
            for _ in range(16):
                if root not in parent:
                    break
                root = parent[root]
        out[r['id']] = {'src': r['src'], 'root': root, 'by': r['user_id'], 'from': r['src_name'],
                        'deleted': bool(r['deleted_at'])}
    return out


def first_of(copies, block_id):
    """The id of the first file a copy (or a copy of a copy) came from."""
    return copies[block_id]['root'] if block_id in copies else block_id


def galaxy_links(req, open_ids):
    """Galaxies that share files, for the universe: a file on planets in two
    galaxies (someone's file on a planet others can add to), a copy and the
    file it came from both on planets this person can see, and always a copy
    and the person it was saved from, wherever the copy sits, as long as this
    person can see the copy (on a planet they can open, or it's their own).
    A copy of a copy leads back to the first. [{a, b, n}] by username."""
    copies = saved_copies(req)
    ids = dict(req.db.execute('SELECT username, id FROM users').fetchall())
    rows = req.db.execute(
        'SELECT c.block_id, c.drawer_id, d.user_id AS planet_owner, b.user_id AS file_owner FROM connections c '
        'JOIN drawers d ON d.id = c.drawer_id JOIN blocks b ON b.id = c.block_id WHERE b.deleted_at IS NULL').fetchall()
    owners, seen = {}, set()
    for r in rows:
        if r['drawer_id'] in open_ids:
            owners.setdefault(first_of(copies, r['block_id']), set()).update((r['planet_owner'], r['file_owner']))
            seen.add(r['block_id'])
    files = {}
    for people_root, people in owners.items():
        people = sorted(people)
        for i, a in enumerate(people):
            for b in people[i + 1:]:
                files.setdefault((a, b), set()).add(people_root)
    # Two people keeping a planet together are always joined, while this person can open it.
    kept = {}
    for r in req.db.execute('SELECT k.drawer_id, k.user_id, d.user_id AS owner FROM drawer_keepers k '
                            'JOIN drawers d ON d.id = k.drawer_id').fetchall():
        if r['drawer_id'] in open_ids:
            pair = tuple(sorted((r['owner'], r['user_id'])))
            files.setdefault(pair, set()).add('kept:' + r['drawer_id'])
            kept.setdefault(pair, []).append(r['drawer_id'])
    for copy_id, c in copies.items():
        source = ids.get(c['from'])
        if c['deleted'] or not source or source == c['by']:
            continue
        if copy_id in seen or c['by'] == req.user['id']:
            files.setdefault(tuple(sorted((c['by'], source))), set()).add(c['root'])
    if not files:
        return []
    names = {v: k for k, v in ids.items()}
    links = []
    for (a, b), n in files.items():
        if a in names and b in names:
            link = {'a': names[a], 'b': names[b], 'n': len(n)}
            if (a, b) in kept:
                link['kept'] = sorted(kept[(a, b)])   # the planets they keep together
            links.append(link)
    return sorted(links, key=lambda l: (l['a'], l['b']))


def person(row_or_none, username=None):
    """Someone as a file's story shows them: their handle and the name they gave."""
    if row_or_none:
        return {'username': row_or_none['username'], 'name': row_or_none['display_name']}
    return {'username': username, 'name': None} if username else None


def file_story(req, row):
    """Who made a file, who saved this copy and from whom, and every other
    copy of it on planets this person can open, with whose planets they are.
    A copy kept as a loose star (or on a planet you can't open) stays out,
    unless it's your own."""
    copies = saved_copies(req)
    users = {r['id']: r for r in req.db.execute('SELECT id, username, display_name FROM users')}
    by_name = {r['username']: r for r in users.values()}
    meta = json.loads(row['meta'] or '{}')
    root = first_of(copies, row['id'])
    story = {}
    if row['id'] in copies:
        made = meta.get('madeBy') if isinstance(meta.get('madeBy'), dict) else {}
        first = req.db.execute('SELECT user_id FROM blocks WHERE id = ?', (root,)).fetchone()
        maker = users.get(first['user_id']) if first else by_name.get(made.get('username'))
        source = (meta.get('savedFrom') or {}).get('username')
        story['madeBy'] = person(maker, made.get('username') or (None if first else source))
        story['savedBy'] = person(users.get(row['user_id']))
        story['savedFrom'] = person(by_name.get(source), source)
        story['savedAt'] = ms(row['created_at'])
    family = [i for i, c in copies.items() if c['root'] == root and not c['deleted']]
    if root not in copies:
        family.append(root)
    family = [i for i in family if i != row['id']]
    elsewhere = []
    if family:
        marks = ','.join('?' * len(family))
        found = req.db.execute(
            f'SELECT d.*, c.block_id, b.user_id AS file_owner FROM connections c '
            f'JOIN drawers d ON d.id = c.drawer_id JOIN blocks b ON b.id = c.block_id '
            f'WHERE c.block_id IN ({marks}) AND b.deleted_at IS NULL ORDER BY d.user_id, c.connected_at',
            family).fetchall()
        for d in found:
            if not drawer_visible(req, d):
                continue
            planet = drawer_json(d)
            planet['file'] = d['block_id']
            planet['by'] = person(users.get(d['user_id']))
            planet['first'] = d['block_id'] == root
            elsewhere.append(planet)
        placed = {d['block_id'] for d in found}
        for i in family:
            if i in copies and copies[i]['by'] == req.user['id'] and i not in placed:
                elsewhere.append({'file': i, 'star': True, 'by': person(users.get(req.user['id']))})
    story['elsewhere'] = elsewhere
    return story


@route('GET', r'/api/galaxy')
def my_galaxy(req):
    return json_response(galaxy_of(req, req.user))


@route('GET', r'/api/galaxy/' + USERNAME_PATH)
def get_galaxy(req, username):
    owner = find_user(req, username)
    draw_near(req, owner['id'], NEAR_VISIT, visit=True)
    return json_response(galaxy_of(req, owner))


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
        galaxy_owner = owner
        if wanted:
            row = req.db.execute("SELECT share_hash, user_id FROM drawers WHERE id = ? AND visibility = 'pin' AND (user_id = ? "
                                 'OR id IN (SELECT drawer_id FROM drawer_keepers WHERE user_id = ?))',
                                 (wanted, owner['id'], owner['id'])).fetchone()
            if not row:
                raise HttpError(404, 'That planet does not exist.')
            if row['user_id'] != owner['id']:
                # A planet kept together, seen in its other keeper's galaxy: its code is its owner's.
                owner = req.db.execute('SELECT * FROM users WHERE id = ?', (row['user_id'],)).fetchone()
            if not row['share_hash']:
                raise HttpError(403, f"@{owner['username']} hasn’t given this planet a code yet.", noCode=True)
        wait = auth.login_failures_by_ip.retry_after(req.client_ip)
        if wait:
            raise HttpError(429, f'Too many tries. Wait {auth.format_wait(wait)} and try again.', retryAfter=wait)
        if not auth.CODE_RE.match(code):
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
        owner = galaxy_owner
    return json_response({**galaxy_of(req, owner), 'opened': opened})


@route('PUT', r'/api/drawers/(?P<drawer_id>[\w-]+)/code')
def set_planet_code(req, drawer_id):
    """The owner picks the code people need to look inside a Code planet.
    Changing it closes the planet again to everyone who had the old one."""
    planet = own_drawer(req, drawer_id)
    code = str(req.json().get('code') or '')
    if not auth.CODE_RE.match(code):
        raise HttpError(400, 'The code needs to be 4 digits.')
    if auth.check_pin(code, req.user['pin_salt'], req.user['pin_hash']):
        raise HttpError(400, "That’s your sign-in code. Pick a different one, so sharing this planet "
                             "doesn’t share your account.")
    with db.transaction(req.db):
        req.db.execute('UPDATE drawers SET share_hash = ?, updated_at = ? WHERE id = ?',
                       (auth.share_hash(planet['user_id'], code), now(), drawer_id))
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
        req.db.execute('UPDATE drawer_keepers SET x = NULL, y = NULL WHERE user_id = ?', (req.user['id'],))
        req.db.execute('UPDATE constellations SET x = NULL, y = NULL WHERE user_id = ?', (req.user['id'],))
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
            # a constellation's place is saved with the planets' (its id as the page knows it: sky:<id>)
            if row[2].startswith('sky:'):
                if not req.db.execute('UPDATE constellations SET x = ?, y = ? WHERE id = ? AND user_id = ?',
                                      (row[0], row[1], row[2][4:], row[3])).rowcount:
                    raise HttpError(404, 'One of those constellations is not yours.')
                continue
            if not (req.db.execute('UPDATE drawers SET x = ?, y = ? WHERE id = ? AND user_id = ? AND parent_id IS NULL', row).rowcount
                    or req.db.execute('UPDATE drawer_keepers SET x = ?, y = ? WHERE drawer_id = ? AND user_id = ?', row).rowcount):
                raise HttpError(404, 'One of those planets is not yours.')
    return json_response({'ok': True})


# ---------------------------------------------------------------- constellations

# A few of your stars joined in your sky, with a name (DESIGN.md "Constellations").
# Only their owner ever sees them, like the stars themselves. The files stay
# stars: nothing here makes a connection until one becomes a planet.
CONSTELLATION_MAX = 12        # stars in one; past this it should be a planet (the figure gets crowded)
CONSTELLATION_NAME = 'Constellation'


def tidy_constellations(conn, user_id):
    """A constellation needs two stars (counting deleted ones, which may come back)."""
    conn.execute('DELETE FROM constellations WHERE user_id = ? AND '
                 '(SELECT COUNT(*) FROM constellation_stars s WHERE s.constellation_id = constellations.id) < 2',
                 (user_id,))


def constellation_members(conn, constellation_id):
    """Its stars as they show: not deleted, still on no planet, in order."""
    return [r[0] for r in conn.execute(
        'SELECT s.block_id FROM constellation_stars s JOIN blocks b ON b.id = s.block_id '
        'WHERE s.constellation_id = ? AND b.deleted_at IS NULL AND NOT EXISTS '
        '(SELECT 1 FROM connections c WHERE c.block_id = b.id) ORDER BY s.position, s.added_at', (constellation_id,))]


def constellation_json(conn, row):
    return {'id': row['id'], 'title': row['title'], 'stars': constellation_members(conn, row['id']),
            'dismissed': bool(row['dismissed']), 'x': row['x'], 'y': row['y']}


def constellations_of(conn, user_id):
    """Your constellations that show: two stars or more left in your sky."""
    tidy_constellations(conn, user_id)
    rows = conn.execute('SELECT * FROM constellations WHERE user_id = ? ORDER BY created_at', (user_id,)).fetchall()
    return [c for c in (constellation_json(conn, r) for r in rows) if len(c['stars']) >= 2]


def own_constellation(req, constellation_id):
    row = req.db.execute('SELECT * FROM constellations WHERE id = ? AND user_id = ?',
                         (constellation_id, req.user['id'])).fetchone()
    if not row:
        raise HttpError(404, 'That constellation does not exist.')
    return row


def own_star(req, block_id):
    """One of your files that is a star (on no planet)."""
    row = own_block(req, str(block_id or ''))
    if req.db.execute('SELECT 1 FROM connections WHERE block_id = ?', (row['id'],)).fetchone():
        raise HttpError(400, 'Only stars can join a constellation.')
    return row


def constellation_name(body):
    title = text_field(body, 'title', 80, 'Name')
    return title or CONSTELLATION_NAME


def join_star(conn, constellation_id, block_id):
    """Put a star at the end of a constellation (leaving any other it was in)."""
    if conn.execute('SELECT 1 FROM constellation_stars WHERE block_id = ? AND constellation_id = ?',
                    (block_id, constellation_id)).fetchone():
        return
    have = len(constellation_members(conn, constellation_id))
    if have >= CONSTELLATION_MAX:
        raise HttpError(400, f'A constellation holds up to {CONSTELLATION_MAX} stars. Make it a planet to keep going.')
    last = conn.execute('SELECT COALESCE(MAX(position), -1) FROM constellation_stars WHERE constellation_id = ?',
                        (constellation_id,)).fetchone()[0]
    conn.execute('INSERT OR REPLACE INTO constellation_stars (block_id, constellation_id, position, added_at) '
                 'VALUES (?, ?, ?, ?)', (block_id, constellation_id, last + 1, now()))
    conn.execute('UPDATE constellations SET updated_at = ? WHERE id = ?', (now(), constellation_id))


@route('POST', r'/api/constellations')
def create_constellation(req):
    """Two (or more) stars joined into a new constellation."""
    body = req.json()
    ids = body.get('stars')
    if not isinstance(ids, list) or not 2 <= len(ids) <= CONSTELLATION_MAX or len(set(map(str, ids))) != len(ids):
        raise HttpError(400, 'A constellation is two stars or more.')
    title = constellation_name(body)
    stars = [own_star(req, i)['id'] for i in ids]
    cid, stamp = new_id(), now()
    with db.transaction(req.db):
        req.db.execute('INSERT INTO constellations (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
                       (cid, req.user['id'], title, stamp, stamp))
        for block_id in stars:
            join_star(req.db, cid, block_id)
        tidy_constellations(req.db, req.user['id'])   # one they left may be down to a single star
    return json_response({'constellation': constellation_json(req.db, own_constellation(req, cid)),
                          'constellations': constellations_of(req.db, req.user['id'])}, status=201)


@route('PATCH', r'/api/constellations/(?P<cid>[\w-]+)')
def update_constellation(req, cid):
    """A new name, or the offer to become a planet waved away (`dismissed`)."""
    row = own_constellation(req, cid)
    body = req.json()
    sets, params = [], []
    if 'title' in body:
        sets.append('title = ?')
        params.append(constellation_name(body))
    if 'dismissed' in body:
        sets.append('dismissed = ?')
        params.append(1 if body.get('dismissed') else 0)
    if sets:
        req.db.execute(f"UPDATE constellations SET {', '.join(sets)}, updated_at = ? WHERE id = ?", (*params, now(), row['id']))
    return json_response({'constellation': constellation_json(req.db, own_constellation(req, cid))})


@route('POST', r'/api/constellations/(?P<cid>[\w-]+)/stars')
def add_to_constellation(req, cid):
    """One more star (taken out of any other constellation it was in)."""
    row = own_constellation(req, cid)
    star = own_star(req, req.json().get('block'))
    with db.transaction(req.db):
        join_star(req.db, row['id'], star['id'])
        tidy_constellations(req.db, req.user['id'])
    return json_response({'constellation': constellation_json(req.db, row),
                          'constellations': constellations_of(req.db, req.user['id'])})


@route('DELETE', r'/api/constellations/(?P<cid>[\w-]+)/stars/(?P<block_id>[\w-]+)')
def take_from_constellation(req, cid, block_id):
    """A star back to being loose. Left with one star, the constellation ends."""
    row = own_constellation(req, cid)
    with db.transaction(req.db):
        req.db.execute('DELETE FROM constellation_stars WHERE constellation_id = ? AND block_id = ?', (row['id'], block_id))
        tidy_constellations(req.db, req.user['id'])
    return json_response({'constellations': constellations_of(req.db, req.user['id'])})


@route('DELETE', r'/api/constellations/(?P<cid>[\w-]+)')
def break_constellation(req, cid):
    """Broken up: its stars are loose again."""
    row = own_constellation(req, cid)
    req.db.execute('DELETE FROM constellations WHERE id = ?', (row['id'],))
    return json_response({'constellations': constellations_of(req.db, req.user['id'])})


@route('POST', r'/api/constellations/(?P<cid>[\w-]+)/planet')
def constellation_to_planet(req, cid):
    """It becomes a planet of the same name, holding its stars in order (they
    stop being stars). `x`/`y` put the planet where the constellation was, on a
    galaxy arranged by hand."""
    row = own_constellation(req, cid)
    body = req.json()
    stars = constellation_members(req.db, row['id'])
    if len(stars) < 2:
        raise HttpError(400, 'That constellation has no stars left.')
    xy = [None, None]
    for k, (key, reach) in enumerate(zip(('x', 'y'), LAYOUT_REACH)):
        n = body.get(key)
        if isinstance(n, (int, float)) and not isinstance(n, bool) and n == n and abs(n) != float('inf'):
            xy[k] = round(max(-reach, min(reach, float(n))), 1)
    if None in xy:
        xy = [None, None]
    drawer_id, stamp = new_id(), now()
    with db.transaction(req.db):
        # A new planet as POST /api/drawers makes one: public, look don't add, with the sharing tip.
        req.db.execute(
            'INSERT INTO drawers (id, user_id, title, description, icon, created_at, updated_at, community, visibility, '
            "modes, x, y) VALUES (?, ?, ?, '', ?, ?, ?, 0, 'public', ?, ?, ?)",
            (drawer_id, req.user['id'], row['title'][:80], json.dumps(default_icon()), stamp, stamp,
             json.dumps({'shareTip': True}), *xy))
        for position, block_id in enumerate(stars):
            req.db.execute('INSERT OR IGNORE INTO connections (block_id, drawer_id, position, connected_at) '
                           'VALUES (?, ?, ?, ?)', (block_id, drawer_id, position, stamp))
        req.db.execute('DELETE FROM constellations WHERE id = ?', (row['id'],))
    drawer = own_drawer(req, drawer_id)
    return json_response({'drawer': planet_json(req, drawer, len(stars), drawer_previews(req, drawer_id, limit=12)),
                          'constellations': constellations_of(req.db, req.user['id'])}, status=201)


@route('GET', r'/api/users')
def list_users(req):
    """Everyone else's username, A to Z, for picking who to share a planet with;
    and `names`, the name each gave (only those who gave one), which search shows."""
    rows = req.db.execute('SELECT username, display_name FROM users WHERE id != ? ORDER BY username',
                          (req.user['id'],)).fetchall()
    return json_response({'users': [r[0] for r in rows], 'names': {r[0]: r[1] for r in rows if r[1]}})


@route('GET', r'/api/users/' + USERNAME_PATH)
def person_card(req, username):
    """Someone else, as the sheet under their name in the top bar shows them:
    their name, when they joined, their planets (how many open, with a code,
    private, as their galaxy already shows), and how many of their own files
    you can see (on planets and moons you can open, theirs or anyone's; never
    their stars or anything private). `keptWithYou` and `savedByYou` only
    count what is between the two of you."""
    owner = find_user(req, username)
    planets = galaxy_rows(req.db, owner['id'])
    open_ = sum(1 for r in planets if drawer_visible(req, r))
    private = sum(1 for r in planets if not drawer_visible(req, r) and r['visibility'] != 'pin')
    places = req.db.execute(
        'SELECT DISTINCT d.* FROM drawers d JOIN connections c ON c.drawer_id = d.id JOIN blocks b ON b.id = c.block_id '
        'WHERE b.user_id = ? AND b.deleted_at IS NULL', (owner['id'],)).fetchall()
    seen = [r['id'] for r in places if drawer_visible(req, r)]
    files = req.db.execute(
        f'SELECT COUNT(DISTINCT c.block_id) FROM connections c JOIN blocks b ON b.id = c.block_id '
        f'WHERE b.user_id = ? AND b.deleted_at IS NULL AND c.drawer_id IN ({",".join("?" * len(seen))})',
        (owner['id'], *seen)).fetchone()[0] if seen else 0
    me = req.user['id']
    kept = req.db.execute(
        'SELECT COUNT(*) FROM drawer_keepers k JOIN drawers d ON d.id = k.drawer_id '
        'WHERE (d.user_id = ? AND k.user_id = ?) OR (d.user_id = ? AND k.user_id = ?)',
        (owner['id'], me, me, owner['id'])).fetchone()[0] if owner['id'] != me else 0
    saved = req.db.execute(
        "SELECT COUNT(*) FROM blocks WHERE user_id = ? AND deleted_at IS NULL "
        "AND json_extract(meta, '$.savedFrom.username') = ?", (me, owner['username'])).fetchone()[0] if owner['id'] != me else 0
    return json_response({**user_json(owner), 'you': owner['id'] == me, 'files': files,
                          'planets': len(planets), 'open': open_, 'locked': len(planets) - open_ - private,
                          'private': private, 'keptWithYou': kept, 'savedByYou': saved})


# ---------------------------------------------------------------- nearness

# Galaxies you visit or save files from are drawn closer to yours in the
# universe. A save weighs more than a visit; a visit counts once an hour; and
# the pull halves every month, so the universe follows what you do now.
NEAR_SAVE = 3.0
NEAR_VISIT = 1.0
NEAR_VISIT_EVERY = 3600
NEAR_HALF_LIFE = 30 * 86400


def faded(score, at, t):
    return score * 0.5 ** (max(0.0, t - at) / NEAR_HALF_LIFE)


def draw_near(req, other_id, weight, visit=False):
    me = req.user['id'] if req.user else None
    if not me or not other_id or other_id == me:
        return
    t = now()
    row = req.db.execute('SELECT score, at, visited_at FROM nearness WHERE user_id = ? AND other_id = ?',
                         (me, other_id)).fetchone()
    if visit and row and t - row['visited_at'] < NEAR_VISIT_EVERY:
        return
    score = (faded(row['score'], row['at'], t) if row else 0.0) + weight
    visited = t if visit else (row['visited_at'] if row else 0)
    req.db.execute('INSERT INTO nearness (user_id, other_id, score, at, visited_at) VALUES (?, ?, ?, ?, ?) '
                   'ON CONFLICT (user_id, other_id) DO UPDATE SET score = excluded.score, at = excluded.at, '
                   'visited_at = excluded.visited_at', (me, other_id, score, t, visited))


def nearness_of(req):
    t = now()
    return {r['other_id']: round(faded(r['score'], r['at'], t), 3) for r in req.db.execute(
        'SELECT other_id, score, at FROM nearness WHERE user_id = ?', (req.user['id'],))}


@route('GET', r'/api/galaxies')
def list_galaxies(req):
    """The universe: everyone, you first, then everyone else A to Z. Anyone's
    galaxy can be opened; a code is only asked for on a locked planet, and
    planets you can't see at all (private, or shared with others) show blurred."""
    users = req.db.execute('SELECT * FROM users ORDER BY username').fetchall()
    near = nearness_of(req)
    out = []
    open_ids = set()
    for user in users:
        mine = user['id'] == req.user['id']
        rows = galaxy_rows(req.db, user['id'])
        worlds = []
        for r in rows:
            open_ = mine or drawer_visible(req, r)
            hidden = not open_ and r['visibility'] != 'pin'
            moons = moons_of(req, r['id']) if open_ else []
            if open_:
                open_ids.add(r['id'])
                open_ids.update(m['id'] for m in moons if not m['locked'])
            worlds.append({'id': r['id'], 'c': json.loads(r['icon']).get('c'), 'n': 0 if hidden else r['n'],
                           'locked': not open_, 'private': hidden,
                           'look': r['look'], 'twelve': twelve(r),
                           'x': r['kx'] if r['kept_here'] else r['x'], 'y': r['ky'] if r['kept_here'] else r['y'],
                           'moons': [{'id': m['id'], 'look': m['look']} for m in moons]})
            if open_ and keeper_of(req.db, r):
                worlds[-1]['kept'] = True   # kept together: the universe draws it once, between the two galaxies
        opened = [w for w in worlds if not w['locked']]
        private = sum(1 for w in worlds if w['private'])
        out.append({
            'username': user['username'], 'name': user['display_name'], 'you': mine, 'planets': len(worlds),
            'files': sum(w['n'] for w in opened), 'open': len(opened),
            'locked': len(worlds) - len(opened) - private, 'private': private,
            'worlds': worlds[:16],
            # How strongly your visits and saves pull this galaxy toward yours.
            'near': 0 if mine else near.get(user['id'], 0),
        })
    out.sort(key=lambda g: (not g['you'], g['username']))
    return json_response({'galaxies': out, 'links': galaxy_links(req, open_ids)})


# ---------------------------------------------------------------- keeping a planet together

# A binary planet: a planet two people keep together. It sits in both their
# galaxies and both can do all its owner can, except delete it while the
# other keeps it. Decided with the user on 2026-11-16: you can ask someone
# who already shares it (has added files to it, or it's shared with them by
# name); leaving (or deleting an account) leaves both with everything: the
# leaver takes a planet of the same name with their files and copies of the
# other's, and the one who stays keeps the planet with copies of the leaver's.
KEEP_ASK_AGAIN = 7 * 86400   # an ask that was put away can be made again after a week
KEEP_WAITING = 3             # new planets made with one person that can wait for their answer at once
NEAR_KEEP = 5.0              # keeping a planet together pulls two galaxies close


def users_by_id(conn, *ids):
    ids = [i for i in ids if i]
    if not ids:
        return {}
    return {r['id']: r for r in conn.execute(
        f'SELECT id, username, display_name FROM users WHERE id IN ({",".join("?" * len(ids))})', ids)}


def stopped(conn, user_id, other_id):
    """Has `user_id` stopped beams (and asks to keep planets together) from `other_id`?"""
    return bool(conn.execute('SELECT 1 FROM beam_stops WHERE user_id = ? AND other_id = ?',
                             (user_id, other_id)).fetchone())


def keep_candidates(req, row):
    """The people a planet's owner may ask to keep it together: those who
    already share it. Someone who has added files to it (or its moons), and,
    when it's shared by name, the people it's shared with."""
    ids = [r[0] for r in req.db.execute(
        'SELECT DISTINCT b.user_id FROM connections c JOIN blocks b ON b.id = c.block_id '
        'JOIN drawers d ON d.id = c.drawer_id WHERE (d.id = ? OR d.parent_id = ?) AND b.user_id != ? '
        'AND b.deleted_at IS NULL', (row['id'], row['id'], row['user_id']))]
    if row['visibility'] == 'people':
        ids += [r[0] for r in req.db.execute('SELECT user_id FROM drawer_access WHERE drawer_id = ?', (row['id'],))]
    people = users_by_id(req.db, *dict.fromkeys(ids))
    return sorted((person(p) for p in people.values()), key=lambda p: (p['name'] or p['username']).lower())[:6]


def keep_state(req, row):
    """What Share shows the owner of a planet not (yet) kept together:
    `keepWith`, who they could ask; `keepAsk`, the ask waiting, if any."""
    if row['parent_id'] or row['user_id'] != req.user['id'] or keeper_of(req.db, row):
        return {}
    ask = req.db.execute('SELECT * FROM keep_asks WHERE drawer_id = ?', (row['id'],)).fetchone()
    out = {'keepWith': keep_candidates(req, row)}
    if ask and now() - ask['asked_at'] < KEEP_ASK_AGAIN or ask and not ask['waved']:
        to = users_by_id(req.db, ask['to_id']).get(ask['to_id'])
        out['keepAsk'] = {'to': person(to), 'at': ms(ask['asked_at'])}
    return out


def tell_other_keeper(req, row, what):
    """Leave the other keeper a note they'll see once on their galaxy."""
    planet = row
    if row['parent_id']:
        planet = req.db.execute('SELECT * FROM drawers WHERE id = ?', (row['parent_id'],)).fetchone()
    keeper = keeper_of(req.db, planet)
    if not keeper:
        return
    other = keeper if req.user['id'] == planet['user_id'] else planet['user_id']
    if other == req.user['id']:
        return
    req.db.execute('INSERT INTO keep_news (id, user_id, drawer_id, what, by_name, title, at) VALUES (?, ?, ?, ?, ?, ?, ?)',
                   (new_id(), other, planet['id'], what, req.user['display_name'] or '@' + req.user['username'],
                    row['title'], now()))


@route('POST', r'/api/drawers/(?P<drawer_id>[\w-]+)/keep')
def ask_to_keep(req, drawer_id):
    """Ask someone who already shares this planet to keep it together."""
    row = own_drawer(req, drawer_id, owner_only=True)
    if row['parent_id']:
        raise HttpError(400, 'A moon is kept with its planet.')
    if keeper_of(req.db, row):
        raise HttpError(400, 'You already keep this planet with someone.')
    username = auth.normalize_username(str(req.json().get('with') or ''))
    other = req.db.execute('SELECT * FROM users WHERE username = ?', (username,)).fetchone()
    if not other or other['username'] not in {p['username'] for p in keep_candidates(req, row)}:
        raise HttpError(400, 'You can ask someone who already shares this planet.')
    ask = req.db.execute('SELECT * FROM keep_asks WHERE drawer_id = ?', (drawer_id,)).fetchone()
    if ask and ask['to_id'] == other['id'] and now() - ask['asked_at'] < KEEP_ASK_AGAIN:
        raise HttpError(400, 'You asked a little while ago. Give it a few days.')
    # Someone who stopped hearing from you is asked as anyone is, but never sees it.
    req.db.execute('INSERT OR REPLACE INTO keep_asks (drawer_id, from_id, to_id, asked_at, waved) VALUES (?, ?, ?, ?, ?)',
                   (drawer_id, req.user['id'], other['id'], now(), 1 if stopped(req.db, other['id'], req.user['id']) else 0))
    return json_response({'drawer': planet_json(req, row, None) | keep_state(req, row)})


@route('DELETE', r'/api/drawers/(?P<drawer_id>[\w-]+)/keep')
def take_back_ask(req, drawer_id):
    row = own_drawer(req, drawer_id, owner_only=True)
    req.db.execute('DELETE FROM keep_asks WHERE drawer_id = ? AND from_id = ?', (drawer_id, req.user['id']))
    return json_response({'drawer': planet_json(req, row, None) | keep_state(req, row)})


@route('GET', r'/api/keep')
def keep_waiting(req):
    """For your own galaxy: asks to keep a planet together that wait for you,
    and news of planets you keep with someone (each said once, then gone)."""
    asks = []
    for a in req.db.execute(
            'SELECT a.*, d.title, d.look, d.icon, u.username, u.display_name FROM keep_asks a '
            'JOIN drawers d ON d.id = a.drawer_id JOIN users u ON u.id = a.from_id '
            'WHERE a.to_id = ? AND a.waved = 0 ORDER BY a.asked_at', (req.user['id'],)).fetchall():
        planet = req.db.execute('SELECT * FROM drawers WHERE id = ?', (a['drawer_id'],)).fetchone()
        if planet['user_id'] != a['from_id'] or keeper_of(req.db, planet):
            continue
        asks.append({'drawer': {'id': a['drawer_id'], 'title': a['title'], 'look': a['look'],
                                'icon': json.loads(a['icon'])}, 'from': person(a), 'at': ms(a['asked_at'])})
    news = [{'what': r['what'], 'by': r['by_name'], 'title': r['title'], 'drawer': r['drawer_id'], 'at': ms(r['at'])}
            for r in req.db.execute('SELECT * FROM keep_news WHERE user_id = ? ORDER BY at', (req.user['id'],))]
    req.db.execute('DELETE FROM keep_news WHERE user_id = ?', (req.user['id'],))
    return json_response({'asks': asks, 'news': news})


@route('POST', r'/api/keep/(?P<drawer_id>[\w-]+)')
def answer_ask(req, drawer_id):
    """Say yes to keeping a planet together, or put the ask away (`wave`)."""
    answer = req.json().get('answer')
    ask = req.db.execute('SELECT * FROM keep_asks WHERE drawer_id = ? AND to_id = ? AND waved = 0',
                         (drawer_id, req.user['id'])).fetchone()
    if not ask:
        raise HttpError(404, 'That ask is no longer waiting.')
    if answer == 'wave':
        req.db.execute('UPDATE keep_asks SET waved = 1 WHERE drawer_id = ?', (drawer_id,))
        return json_response({'ok': True})
    if answer != 'yes':
        raise HttpError(400, 'Say yes or not now.')
    planet = req.db.execute('SELECT * FROM drawers WHERE id = ?', (drawer_id,)).fetchone()
    if not planet or planet['user_id'] != ask['from_id'] or keeper_of(req.db, planet):
        req.db.execute('DELETE FROM keep_asks WHERE drawer_id = ?', (drawer_id,))
        raise HttpError(404, 'That planet can’t be kept together any more.')
    with db.transaction(req.db):
        req.db.execute('DELETE FROM keep_asks WHERE drawer_id = ?', (drawer_id,))
        req.db.execute('INSERT INTO drawer_keepers (drawer_id, user_id, since) VALUES (?, ?, ?)',
                       (drawer_id, req.user['id'], now()))
        # They were sharing it already; whatever named them on it is no longer needed.
        req.db.execute('DELETE FROM drawer_access WHERE user_id = ? AND drawer_id IN '
                       '(SELECT id FROM drawers WHERE id = ? OR parent_id = ?)', (req.user['id'], drawer_id, drawer_id))
    tell_other_keeper(req, planet, 'joined')
    draw_near(req, planet['user_id'], NEAR_KEEP)
    req.db.execute('INSERT INTO nearness (user_id, other_id, score, at) VALUES (?, ?, ?, ?) ON CONFLICT (user_id, other_id) '
                   'DO UPDATE SET score = score + excluded.score', (planet['user_id'], req.user['id'], NEAR_KEEP, now()))
    count = req.db.execute('SELECT COUNT(*) FROM connections WHERE drawer_id = ?', (drawer_id,)).fetchone()[0]
    return json_response({'drawer': planet_json(req, planet, count, drawer_previews(req, drawer_id, limit=12))})


def part_ways(conn, planet, leaver_id, leaving=True):
    """One keeper goes: by leaving (`leaving`), or because their account is
    being deleted. The one who stays keeps the planet and its moons, with a
    copy of every file the leaver had on them, in the same places. Someone
    leaving also takes a planet of the same name (and moons) of their own:
    their files move there, beside copies of the other keeper's. Files other
    people added stay where they are. Returns the leaver's new planet's id."""
    keeper = keeper_of(conn, planet)
    stayer = keeper if leaver_id == planet['user_id'] else planet['user_id']
    names = {r['id']: r['username'] for r in conn.execute('SELECT id, username FROM users WHERE id IN (?, ?)',
                                                          (leaver_id, stayer))}
    stamp = now()
    worlds = [planet] + conn.execute('SELECT * FROM drawers WHERE parent_id = ? ORDER BY created_at',
                                     (planet['id'],)).fetchall()
    new_planet = None
    for world in worlds:
        theirs = None
        if leaving:
            # The leaver's own world: same name, kind and colour, private until they say otherwise
            # (it holds copies of the other keeper's files, which were shared only on this planet).
            theirs = new_id()
            conn.execute(
                'INSERT INTO drawers (id, user_id, title, description, icon, created_at, updated_at, community, '
                "visibility, parent_id, modes, own_sharing, look) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'private', ?, ?, ?, ?)",
                (theirs, leaver_id, world['title'], world['description'], world['icon'], stamp, stamp,
                 new_planet if world['parent_id'] else None,
                 json.dumps({k: v for k, v in drawer_modes(world).items() if k not in ('shareTip', 'split')}),
                 1 if world['parent_id'] else 0, world['look']))
            if not world['parent_id']:
                new_planet = theirs
        files = conn.execute(
            f'SELECT {BLOCK_COLUMNS}, c.position, c.checked FROM connections c JOIN blocks b ON b.id = c.block_id '
            'WHERE c.drawer_id = ? AND b.deleted_at IS NULL AND b.user_id IN (?, ?)',
            (world['id'], leaver_id, stayer)).fetchall()
        for f in files:
            if f['user_id'] == leaver_id:
                copy = copy_block(conn, f, stayer, names.get(leaver_id))
                conn.execute('UPDATE connections SET block_id = ? WHERE drawer_id = ? AND block_id = ?',
                             (copy, world['id'], f['id']))
                if theirs:
                    conn.execute('INSERT OR IGNORE INTO connections (block_id, drawer_id, position, connected_at, checked, placed) '
                                 "VALUES (?, ?, ?, ?, ?, 'hand')", (f['id'], theirs, f['position'], stamp, f['checked']))
            elif theirs:
                copy = copy_block(conn, f, leaver_id, names.get(stayer))
                conn.execute('INSERT INTO connections (block_id, drawer_id, position, connected_at, checked, placed) '
                             "VALUES (?, ?, ?, ?, ?, 'hand')", (copy, theirs, f['position'], stamp, f['checked']))
    if leaver_id == planet['user_id']:
        # The planet becomes the other keeper's, where they had put it in their galaxy.
        spot = conn.execute('SELECT x, y FROM drawer_keepers WHERE drawer_id = ?', (planet['id'],)).fetchone()
        conn.execute('UPDATE drawers SET user_id = ?, x = ?, y = ?, share_hash = NULL WHERE id = ?',
                     (stayer, spot['x'], spot['y'], planet['id']))
        conn.execute('UPDATE drawers SET user_id = ?, share_hash = NULL WHERE parent_id = ?', (stayer, planet['id']))
    conn.execute('DELETE FROM drawer_keepers WHERE drawer_id = ?', (planet['id'],))
    conn.execute('DELETE FROM drawer_unlocks WHERE drawer_id IN (SELECT id FROM drawers WHERE id = ? OR parent_id = ?)',
                 (planet['id'], planet['id']))
    conn.execute('UPDATE drawers SET updated_at = ? WHERE id = ?', (stamp, planet['id']))
    return new_planet


@route('POST', r'/api/drawers/(?P<drawer_id>[\w-]+)/leave')
def leave_planet(req, drawer_id):
    """Stop keeping a planet together (either keeper). See part_ways."""
    planet = own_drawer(req, drawer_id)
    if planet['parent_id']:
        raise HttpError(400, 'Leave its planet instead.')
    if not keeper_of(req.db, planet):
        raise HttpError(400, 'You keep this planet on your own.')
    tell_other_keeper(req, planet, 'left')
    with db.transaction(req.db):
        mine = part_ways(req.db, planet, req.user['id'])
    row = own_drawer(req, mine)
    count = req.db.execute('SELECT COUNT(*) FROM connections WHERE drawer_id = ?', (mine,)).fetchone()[0]
    return json_response({'drawer': planet_json(req, row, count, drawer_previews(req, mine, limit=12))})


# ---------------------------------------------------------------- beaming out / beaming in

# Beaming a file to someone (decided with the user on 2026-11-16): anyone can
# beam anyone. It stays the sender's until the receiver answers, so nothing
# lands in their galaxy uninvited: they Keep it (a copy, as saving makes one,
# that also says who beamed it and their words), put it on a planet, or let
# it go; the sender is never told which. From someone they had never crossed
# paths with it waits quietly (no ring, no note) and is let go after a month.
BEAM_WORDS = 140           # the few words that may go with a file
BEAM_WAITING = 12          # files from one person waiting for someone at once
BEAM_WAITING_QUIET = 3     # the same, from someone they never crossed paths with
BEAM_DAY = 60              # files one person may beam in a day, to everyone
BEAM_QUIET_DAYS = 30
BEAM_LIST = 300            # people listed in Beam to…, to scroll through


def crossed(conn, a, b):
    """Have these two crossed paths: either visited or saved from the other,
    they keep a planet together, or one kept a file the other beamed?"""
    return bool(conn.execute(
        'SELECT 1 FROM nearness WHERE (user_id = ? AND other_id = ?) OR (user_id = ? AND other_id = ?) '
        'UNION SELECT 1 FROM drawer_keepers k JOIN drawers d ON d.id = k.drawer_id '
        'WHERE (k.user_id = ? AND d.user_id = ?) OR (k.user_id = ? AND d.user_id = ?) '
        "UNION SELECT 1 FROM beams WHERE answer = 'kept' AND ((from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)) LIMIT 1",
        (a, b, b, a) * 3).fetchone())


def anyone_else(conn, user_id):
    """Is there anyone else in this Mutt to beam a file to? Then "Beam to…" is
    in every file's menu and file view, so people find it by seeing it, with
    no tip (the user, 2026-11-16; before, it waited until you'd crossed paths
    with someone, and new people never knew it was there)."""
    return bool(conn.execute('SELECT 1 FROM users WHERE id != ? LIMIT 1', (user_id,)).fetchone())


@route('GET', r'/api/beam/people')
def beam_people(req):
    """Who you might beam a file to: everyone, so no one has to know a
    username. The people you've crossed paths with come first, nearest first,
    then everyone else A to Z by the name they go by; with `q`, only those
    whose name or @username starts with it."""
    me = req.user['id']
    near = nearness_of(req)
    theirs = {r['user_id']: r['score'] for r in req.db.execute('SELECT user_id, score FROM nearness WHERE other_id = ?', (me,))}
    q = (req.arg('q') or '').strip().lstrip('@').lower()[:40]
    out = []
    for u in req.db.execute('SELECT id, username, display_name FROM users WHERE id != ?', (me,)).fetchall():
        if stopped(req.db, me, u['id']):
            continue
        pull = near.get(u['id'], 0) + theirs.get(u['id'], 0)
        known = pull > 0 or crossed(req.db, me, u['id'])
        if q:
            words = [u['username'].lower(), *(u['display_name'] or '').lower().split()]
            if not any(w.startswith(q) for w in words) and not (u['display_name'] or '').lower().startswith(q):
                continue
        out.append((not known, -pull, (u['display_name'] or u['username']).lower(), {**person(u), 'known': known}))
    out.sort(key=lambda t: t[:3])
    return json_response({'people': [t[3] for t in out[:BEAM_LIST]]})


BEAM_FORMS = ('recipe', 'document')


def beam_form(conn, row, asked):
    """The form a file is beamed in, so it arrives as it was sent: what the
    page it was beamed from showed it as (a cookbook's card, a desk's page),
    else what it is (a recipe card, a note with a document's pages)."""
    meta = json.loads(row['meta'] or '{}')
    recipe = isinstance(meta.get('recipe'), dict)
    if asked == 'recipe' and recipe:
        return 'recipe'
    if asked == 'document' and row['kind'] == 'text':
        return 'document'
    if recipe:
        return 'recipe'
    doc = conn.execute('SELECT synced_at FROM docs WHERE block_id = ?', (row['id'],)).fetchone()
    if doc and row['kind'] == 'text' and doc['synced_at'] >= row['updated_at'] - 0.001:
        return 'document'
    return None


@route('POST', r'/api/blocks/(?P<block_id>[\w-]+)/beam')
def beam_block(req, block_id):
    """Beam one of your files to someone: {to: username, words}."""
    row = own_block(req, block_id)
    body = req.json()
    username = auth.normalize_username(str(body.get('to') or ''))
    other = req.db.execute('SELECT * FROM users WHERE username = ?', (username,)).fetchone()
    if not other:
        raise HttpError(400, f'No one here is called @{username}.')
    if other['id'] == req.user['id']:
        raise HttpError(400, 'That’s you.')
    words = text_field(body, 'words', BEAM_WORDS, 'Your words') or ''
    me = req.user['id']
    if req.db.execute('SELECT COUNT(*) FROM beams WHERE from_id = ? AND sent_at > ?', (me, now() - 86400)).fetchone()[0] >= BEAM_DAY:
        raise HttpError(429, 'That’s a lot of beaming for one day. Try again tomorrow.')
    if req.db.execute('SELECT 1 FROM beams WHERE block_id = ? AND to_id = ? AND answer IS NULL', (block_id, other['id'])).fetchone():
        raise HttpError(400, f'That file is already on its way to {other["display_name"] or "@" + other["username"]}.')
    form = beam_form(req.db, row, body.get('form'))
    quiet = not crossed(req.db, me, other['id'])
    waiting = req.db.execute('SELECT COUNT(*) FROM beams WHERE from_id = ? AND to_id = ? AND answer IS NULL',
                             (me, other['id'])).fetchone()[0]
    if waiting >= (BEAM_WAITING_QUIET if quiet else BEAM_WAITING):
        raise HttpError(429, f'That’s plenty on its way to {other["display_name"] or "@" + other["username"]} for now.')
    beam_id = new_id()
    if not stopped(req.db, other['id'], me):
        # Someone who stopped your beams never gets them, and you're not told.
        req.db.execute('INSERT INTO beams (id, block_id, from_id, to_id, words, sent_at, quiet, form) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                       (beam_id, block_id, me, other['id'], words, now(), 1 if quiet else 0, form))
    return json_response({'beam': {'id': beam_id, 'to': person(other)}}, status=201)


@route('DELETE', r'/api/beams/(?P<beam_id>[\w-]+)')
def take_back_beam(req, beam_id):
    """The sender's Undo, while it still waits."""
    req.db.execute('DELETE FROM beams WHERE id = ? AND from_id = ? AND answer IS NULL', (beam_id, req.user['id']))
    return json_response({'ok': True})


@route('GET', r'/api/beams')
def beams_waiting(req):
    """Files beamed to you that wait for an answer, oldest first. A file its
    sender has since deleted waits no more."""
    me = req.user['id']
    req.db.execute("UPDATE beams SET answer = 'gone', answered_at = ? WHERE to_id = ? AND answer IS NULL AND quiet = 1 "
                   'AND sent_at < ?', (now(), me, now() - BEAM_QUIET_DAYS * 86400))
    rows = req.db.execute(
        f'SELECT {BLOCK_COLUMNS}, bm.id AS beam_id, bm.words, bm.sent_at, bm.quiet, bm.noted, bm.form, '
        'u.username AS from_name, u.display_name AS from_display FROM beams bm JOIN blocks b ON b.id = bm.block_id '
        'JOIN users u ON u.id = bm.from_id WHERE bm.to_id = ? AND bm.answer IS NULL AND b.deleted_at IS NULL '
        'ORDER BY bm.sent_at', (me,)).fetchall()
    out = []
    for r in rows:
        block = block_json(r, mine=False, owner=r['from_name'])
        block['beam'] = r['beam_id']
        if r['from_display']:
            block['ownerName'] = r['from_display']
        one = {'id': r['beam_id'], 'block': block, 'from': {'username': r['from_name'], 'name': r['from_display']},
               'words': r['words'], 'sentAt': ms(r['sent_at']), 'quiet': bool(r['quiet']), 'noted': bool(r['noted'])}
        # as it was sent: a recipe card, or a document's first page
        meta = json.loads(r['meta'] or '{}')
        if r['form'] == 'recipe' and isinstance(meta.get('recipe'), dict):
            one['card'] = card_json(req, r, meta, meta['recipe'])
        elif r['form'] == 'document':
            doc = req.db.execute('SELECT html, settings, synced_at FROM docs WHERE block_id = ?', (r['id'],)).fetchone()
            settings = documents.settings_of(doc['settings'] if doc else None)
            layout = settings['layout'] if settings['layout'] != 'auto' else documents.reads_as(r['content'])
            fresh = doc and doc['synced_at'] >= r['updated_at'] - 0.001
            one['page'] = {'html': doc_preview(doc['html']) if fresh else None, 'kind': layout, 'font': settings['font'],
                           'words': documents.word_count(r['content'])}
        out.append(one)
    return json_response({'beams': out})


def waiting_beam(req, beam_id):
    row = req.db.execute(
        'SELECT bm.*, u.username AS from_name, u.display_name AS from_display FROM beams bm '
        'JOIN users u ON u.id = bm.from_id JOIN blocks b ON b.id = bm.block_id '
        'WHERE bm.id = ? AND bm.to_id = ? AND bm.answer IS NULL AND b.deleted_at IS NULL',
        (beam_id, req.user['id'])).fetchone()
    if not row:
        raise HttpError(404, 'That file is no longer waiting.')
    return row


@route('POST', r'/api/beams/(?P<beam_id>[\w-]+)')
def answer_beam(req, beam_id):
    """Keep a beamed file ({answer: 'keep', drawer?: a planet to put it on}),
    or let it go ({answer: 'gone'}). `noted` only puts its note away."""
    beam = waiting_beam(req, beam_id)
    body = req.json()
    answer = body.get('answer')
    if answer == 'noted':
        req.db.execute('UPDATE beams SET noted = 1 WHERE id = ?', (beam_id,))
        return json_response({'ok': True})
    if answer == 'gone':
        req.db.execute("UPDATE beams SET answer = 'gone', answered_at = ? WHERE id = ?", (now(), beam_id))
        return json_response({'ok': True})
    if answer != 'keep':
        raise HttpError(400, 'Keep it or let it go.')
    drawer_id = target_drawer(req, body.get('drawer'))
    file = req.db.execute('SELECT * FROM blocks WHERE id = ?', (beam['block_id'],)).fetchone()
    with db.transaction(req.db):
        copy_id = copy_block(req.db, file, req.user['id'], beam['from_name'], {'beamedBy': {
            'username': beam['from_name'], 'name': beam['from_display'], 'at': ms(beam['sent_at']), 'words': beam['words']}})
        req.db.execute("UPDATE beams SET answer = 'kept', answered_at = ?, copy_id = ? WHERE id = ?", (now(), copy_id, beam_id))
        if drawer_id:
            connect(req.db, copy_id, drawer_id)
    draw_near(req, beam['from_id'], NEAR_SAVE)
    return json_response({'block': reload_block(req, copy_id), 'connections': block_connections(req, copy_id)}, status=201)


@route('POST', r'/api/beams/(?P<beam_id>[\w-]+)/undo')
def unanswer_beam(req, beam_id):
    """Undo letting a beamed file go (the toast's Undo): it waits again."""
    req.db.execute("UPDATE beams SET answer = NULL, answered_at = NULL WHERE id = ? AND to_id = ? AND answer = 'gone'",
                   (beam_id, req.user['id']))
    return json_response({'ok': True})


@route('POST', r'/api/beam-stops')
def stop_beams(req):
    """Stop beams (and asks to keep a planet together) from someone: what
    waits from them is let go. They aren't told."""
    username = auth.normalize_username(str(req.json().get('username') or ''))
    other = req.db.execute('SELECT id FROM users WHERE username = ?', (username,)).fetchone()
    if not other or other['id'] == req.user['id']:
        raise HttpError(404, 'No one here is called that.')
    me = req.user['id']
    with db.transaction(req.db):
        req.db.execute('INSERT OR IGNORE INTO beam_stops (user_id, other_id, at) VALUES (?, ?, ?)', (me, other['id'], now()))
        req.db.execute("UPDATE beams SET answer = 'gone', answered_at = ? WHERE to_id = ? AND from_id = ? AND answer IS NULL",
                       (now(), me, other['id']))
        req.db.execute('UPDATE keep_asks SET waved = 1 WHERE to_id = ? AND from_id = ?', (me, other['id']))
    return json_response({'ok': True})


@route('GET', r'/api/beam-stops')
def stopped_people(req):
    rows = req.db.execute('SELECT u.username, u.display_name, s.at FROM beam_stops s JOIN users u ON u.id = s.other_id '
                          'WHERE s.user_id = ? ORDER BY s.at DESC', (req.user['id'],)).fetchall()
    return json_response({'people': [{**person(r), 'at': ms(r['at'])} for r in rows]})


@route('DELETE', r'/api/beam-stops/' + USERNAME_PATH)
def unstop_beams(req, username):
    other = find_user(req, username)
    req.db.execute('DELETE FROM beam_stops WHERE user_id = ? AND other_id = ?', (req.user['id'], other['id']))
    return json_response({'ok': True})


# ---------------------------------------------------------------- drawers

@route('GET', r'/api/drawers')
def list_drawers(req):
    lite = req.arg('lite') == '1'
    drawers = drawers_of(req, req.user['id'], not lite)
    if req.arg('community') == '1':
        others = req.db.execute(
            'SELECT d.*, u.username AS owner_name, (SELECT COUNT(*) FROM connections c WHERE c.drawer_id = d.id) AS n '
            "FROM drawers d JOIN users u ON u.id = d.user_id WHERE d.community = 1 AND d.visibility = 'public' "
            'AND d.parent_id IS NULL AND d.user_id != ? '
            'ORDER BY d.updated_at DESC', (req.user['id'],)).fetchall()
        drawers += [{**drawer_json(r, r['n']), 'owner': r['owner_name']} for r in others]
    stats = user_stats(req.db, req.user['id'])
    return json_response({'drawers': drawers, 'totalBlocks': stats['files'], 'stats': stats})


def moon_start(req, parent):
    """How a new moon of `parent` starts: (visibility, people, modes). It
    follows its planet's sharing, and a moon of a list starts as a list too,
    marked the same way (its owner can show it as files like any planet)."""
    people = []
    if parent['visibility'] == 'people':
        people = [r[0] for r in req.db.execute('SELECT user_id FROM drawer_access WHERE drawer_id = ?', (parent['id'],))]
    modes = {}
    parent_list = drawer_modes(parent).get('list') or {}
    if parent_list.get('on'):
        modes = clean_modes({'list': {k: v for k, v in parent_list.items() if k in LIST_DEFAULTS}
                             | {'on': True, 'dismissed': False}}, {})
    return parent['visibility'], people, modes


@route('POST', r'/api/drawers')
def create_drawer(req):
    body = req.json()
    title = text_field(body, 'title', 80, 'Drawer name') or ''
    if not title:
        raise HttpError(400, 'Give your planet a name.')
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
    owner_id = req.user['id']
    # A new planet shows its owner a tip about sharing the first time they open it.
    modes = {'shareTip': True}
    if parent_id is not None:
        modes = {}
        parent = own_drawer(req, str(parent_id))
        owner_id = parent['user_id']   # a moon of a planet kept together is its planet's owner's, kept by both
        if parent['parent_id']:
            raise HttpError(400, 'Moons can’t have moons.')
        moons = req.db.execute('SELECT COUNT(*) FROM drawers WHERE parent_id = ?', (parent['id'],)).fetchone()[0]
        if moons >= MAX_MOONS:
            raise HttpError(400, f'A planet can have up to {MAX_MOONS} moons.')
        if body.get('community'):
            raise HttpError(400, 'Moons can only be added to by their owner.')
        visibility, people, modes = moon_start(req, parent)
        if 'visibility' in body:
            visibility, people = body.get('visibility') or visibility, []
        if visibility not in VISIBILITY:
            raise HttpError(400, 'That sharing setting could not be saved.')
        parent_id = parent['id']
    if body.get('community') and visibility != 'public':
        raise HttpError(400, 'Only a public planet can take files from others.')
    # A planet made with someone ("Make a planet with Sam"): shared with them by name
    # straight away, and they're asked to keep it together; it's theirs too once they say yes.
    partner = None
    if body.get('with'):
        if parent_id is not None or body.get('community'):
            raise HttpError(400, 'A shared planet is made on its own.')
        partner = req.db.execute('SELECT * FROM users WHERE username = ?',
                                 (auth.normalize_username(str(body['with'])),)).fetchone()
        if not partner or partner['id'] == req.user['id']:
            raise HttpError(400, 'Pick someone else to share it with.')
        waiting = req.db.execute('SELECT COUNT(*) FROM keep_asks WHERE from_id = ? AND to_id = ? AND waved = 0',
                                 (req.user['id'], partner['id'])).fetchone()[0]
        if waiting >= KEEP_WAITING:
            raise HttpError(400, f'{partner["display_name"] or "@" + partner["username"]} hasn’t answered your last few yet.')
        visibility, people, modes = 'people', [partner['id']], {}
    drawer_id = new_id()
    stamp = now()
    with db.transaction(req.db):
        req.db.execute(
            'INSERT INTO drawers (id, user_id, title, description, icon, created_at, updated_at, community, visibility, '
            'parent_id, modes, own_sharing, look) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            (drawer_id, owner_id, title, description, json.dumps(icon), stamp, stamp,
             1 if body.get('community') else 0, visibility, parent_id, json.dumps(modes),
             1 if parent_id and 'visibility' in body else 0, fresh_look(req.db, owner_id, parent_id)))
        for user_id in people:
            req.db.execute('INSERT INTO drawer_access (drawer_id, user_id) VALUES (?, ?)', (drawer_id, user_id))
        if partner:
            # Someone who stopped hearing from you is asked as anyone is, but never sees it.
            req.db.execute('INSERT INTO keep_asks (drawer_id, from_id, to_id, asked_at, waved) VALUES (?, ?, ?, ?, ?)',
                           (drawer_id, req.user['id'], partner['id'], stamp,
                            1 if stopped(req.db, partner['id'], req.user['id']) else 0))
        position = 0
        for block_id in block_ids:
            owned = req.db.execute('SELECT 1 FROM blocks WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
                                   (str(block_id), req.user['id'])).fetchone()
            if owned:
                req.db.execute('INSERT OR IGNORE INTO connections (block_id, drawer_id, position, connected_at) '
                               'VALUES (?, ?, ?, ?)', (str(block_id), drawer_id, position, stamp))
                position += 1
    row = own_drawer(req, drawer_id)
    out = planet_json(req, row, position, [])
    if partner:
        out |= keep_state(req, row)
    return json_response({'drawer': out}, status=201)


@route('GET', r'/api/drawers/(?P<drawer_id>[\w-]+)')
def get_drawer(req, drawer_id):
    row = req.db.execute('SELECT d.*, u.username AS owner_name, u.display_name AS owner_display FROM drawers d '
                         'JOIN users u ON u.id = d.user_id WHERE d.id = ?', (drawer_id,)).fetchone()
    if not row or not drawer_visible(req, row):
        if row and row['visibility'] == 'pin':
            count = req.db.execute('SELECT COUNT(*) FROM connections WHERE drawer_id = ?', (drawer_id,)).fetchone()[0]
            raise HttpError(403, 'Locked.', locked=True, owner=row['owner_name'], ownerName=row['owner_display'],
                            drawer=planet_json(req, row, count, locked=True))
        raise HttpError(404, 'That planet does not exist.')
    blocks = blocks_in_drawer(req, drawer_id, community=bool(row['community']))
    drawer = planet_json(req, row, len(blocks)) | keep_state(req, row)
    if not drawer['mine']:
        drawer['owner'] = row['owner_name']
        draw_near(req, row['user_id'], NEAR_VISIT, visit=True)
        drawer['ownerName'] = row['owner_display']
    if row['parent_id']:
        parent = req.db.execute('SELECT d.*, (SELECT COUNT(*) FROM connections c WHERE c.drawer_id = d.id) AS n '
                                'FROM drawers d WHERE d.id = ?', (row['parent_id'],)).fetchone()
        drawer['parent'] = planet_json(req, parent, parent['n'], drawer_previews(req, parent['id'], limit=12))
    return json_response({'drawer': drawer, 'blocks': blocks})


@route('PATCH', r'/api/drawers/(?P<drawer_id>[\w-]+)')
def update_drawer(req, drawer_id):
    before = own_drawer(req, drawer_id)
    moon = bool(before['parent_id'])
    body = req.json()
    # "Others can add files" only goes with Public: asking for both together
    # with another setting is refused, and leaving Public turns it off.
    public = body.get('visibility', before['visibility']) == 'public'
    if body.get('community') and not public:
        raise HttpError(400, 'Only a public planet can take files from others.')
    if not public and before['community']:
        body['community'] = False
    updates = {}
    title = text_field(body, 'title', 80, 'Drawer name')
    if title is not None:
        if not title:
            raise HttpError(400, 'Give your planet a name.')
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
        updates['modes'] = json.dumps(clean_modes(body['modes'], current, moon=moon))
    if 'community' in body:
        updates['community'] = 1 if body['community'] else 0
        if not body['community']:
            # Back to private: other people's files leave with them (a keeper's stay).
            req.db.execute('DELETE FROM connections WHERE drawer_id = ? AND block_id IN '
                           '(SELECT id FROM blocks WHERE user_id NOT IN (?, ?))',
                           (drawer_id, before['user_id'], keeper_of(req.db, before) or before['user_id']))
    sharing = 'visibility' in body or 'people' in body
    if sharing and moon:
        updates['own_sharing'] = 1  # the owner chose for this moon: it stops following its planet
    if updates:
        updates['updated_at'] = now()
        assignments = ', '.join(f'{k} = ?' for k in updates)
        req.db.execute(f'UPDATE drawers SET {assignments} WHERE id = ?', (*updates.values(), drawer_id))
    if sharing and not moon:
        follow_planet_sharing(req, drawer_id)
    row = own_drawer(req, drawer_id)
    if (sharing or 'community' in body) and (row['visibility'], row['community']) != (before['visibility'], before['community']):
        tell_other_keeper(req, row, 'sharing')
    count = req.db.execute('SELECT COUNT(*) FROM connections WHERE drawer_id = ?', (drawer_id,)).fetchone()[0]
    return json_response({'drawer': planet_json(req, row, count) | keep_state(req, row)})


def follow_planet_sharing(req, planet_id):
    """Moons whose owner never set their sharing take their planet's again."""
    planet = own_drawer(req, planet_id)
    people = [r[0] for r in req.db.execute('SELECT user_id FROM drawer_access WHERE drawer_id = ?', (planet_id,))]
    with db.transaction(req.db):
        for (moon_id,) in req.db.execute('SELECT id FROM drawers WHERE parent_id = ? AND own_sharing = 0',
                                         (planet_id,)).fetchall():
            req.db.execute('UPDATE drawers SET visibility = ? WHERE id = ?', (planet['visibility'], moon_id))
            req.db.execute('DELETE FROM drawer_access WHERE drawer_id = ?', (moon_id,))
            for user_id in people:
                req.db.execute('INSERT INTO drawer_access (drawer_id, user_id) VALUES (?, ?)', (moon_id, user_id))
            req.db.execute('DELETE FROM drawer_unlocks WHERE drawer_id = ?', (moon_id,))


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
    planet = req.db.execute('SELECT * FROM drawers WHERE id = ?', (drawer_id,)).fetchone()
    ids -= {planet['user_id'], keeper_of(req.db, planet)}   # its keepers always see it
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
    """Features this planet could use, and the signs for each, in plain words.
    Every mode is read in one place (mutt/modes.py). Only its owner sees these."""
    row = own_drawer(req, drawer_id)
    found = modes_registry.signs(req.db, row, drawer_modes(row))
    if keeper_of(req.db, row):
        found.pop('split', None)   # a kept planet's files are two people's: it isn't split
    return json_response(found)


@route('POST', r'/api/moment')
def moment_signs(req):
    """What the words being written right now call for (the moment modes):
    {text, held: the ones already showing, drawer: the planet it's on, if any}."""
    body = req.json()
    text = body.get('text')
    if not isinstance(text, str):
        raise HttpError(400, 'Nothing to read.')
    held = [k for k in body.get('held') or [] if isinstance(k, str)][:10]
    saved, moon = {}, False
    if body.get('drawer'):
        row = own_drawer(req, str(body['drawer']))
        saved, moon = drawer_modes(row), bool(row['parent_id'])
    return json_response(modes_registry.moment(text, held, saved, moon, _local_now(_tz_arg(body.get('tz')))))


# ---------------------------------------------------------------- comets

# A note of yours with a day or time in it can be made a comet: a reminder that
# crosses your own sky from the moment you made it to its time, and tells you
# when it comes (DESIGN.md "Comets"; the days are read by mutt/when.py). Only the
# owner ever sees one. It reminds you once, at its time (9 am for a day alone; no
# heads-up before it: the user, 2026-11-23, "less reminders for comets"), on the
# devices that asked (mutt/webpush.py), under the clock in Mutt, and in the
# owner's calendar if they added it there. A list item's comet ends when it's ticked.
COMET_MORNING = '09:00'   # a day with no time goes off then
COMET_LEAVING = 2         # days after a birthday's comet is dealt with before it comes round for next year
COMET_BURN = 600          # seconds a comet ticked off or done is still listed, so the galaxy burns it up into the void once
COMET_PUSH_EVERY = 30     # seconds between looks for comets coming due


def _tz_arg(value):
    try:
        return max(-14 * 60, min(14 * 60, int(value or 0)))
    except (TypeError, ValueError):
        return 0


def _local_now(tz):
    return datetime.fromtimestamp(now(), timezone.utc).replace(tzinfo=None) + timedelta(minutes=tz)


def _utc(local, tz):
    """Seconds since 1970 for a naive local time in the zone `tz` minutes east."""
    return (local - timedelta(minutes=tz)).replace(tzinfo=timezone.utc).timestamp()


def comet_times(day, clock, tz):
    """(at, ahead): when a comet on `day` (at `clock`, or none) goes off. There is no heads-up any more,
    so `ahead` is the same moment (kept so older rows and the page read alike)."""
    h, m = map(int, (clock or COMET_MORNING).split(':'))
    at = _utc(datetime(day.year, day.month, day.day, h, m), tz)
    return at, at


def first_day(text, tz):
    """The first day a note's words name that is still to come (read as if written now), or None."""
    local = _local_now(tz)
    for f in when.read(text, local):
        day = when.next_of(f, local.date())
        at, _ = comet_times(day, f['time'], tz)
        if at > now():
            return f, day
    return None


def words_of(row):
    """What a file says about when: a note's words, else its name."""
    if row['kind'] == 'text':
        return row['content'] or ''
    return row['title'] or re.sub(r'\.[A-Za-z0-9]{1,5}$', '', row['file_name'] or '').replace('_', ' ')


def ticked(db_, block_id):
    """A list item ticked off (on every list it is on)."""
    rows = db_.execute('SELECT checked FROM connections WHERE block_id = ?', (block_id,)).fetchall()
    return bool(rows) and all(r['checked'] for r in rows)


def comet_title(r):
    """What a comet is called: a file's name, or a note's first line."""
    if r['title']:
        return r['title']
    if r['kind'] == 'text':
        return (r['content'] or '').strip().split('\n', 1)[0] or 'A note'
    return r['file_name'] or (r['content'] if r['kind'] == 'link' else '') or 'A file'


def comet_on(db_, block_id):
    """Where a comet's file is: (planet to open it on, the list it is an item of, or None)."""
    on = db_.execute('SELECT c.drawer_id, c.checked, d.parent_id, d.title, d.modes FROM connections c '
                     'JOIN drawers d ON d.id = c.drawer_id WHERE c.block_id = ? ORDER BY c.connected_at', (block_id,)).fetchall()
    planet = (on[0]['parent_id'] or on[0]['drawer_id']) if on else None
    lst = next(({'id': c['drawer_id'], 'title': c['title']} for c in on
                if (json.loads(c['modes'] or '{}').get('list') or {}).get('on')), None)
    return on, planet, lst


def comet_json(r, planet=None, lst=None, db_=None):
    """A comet as the page sees it, with what its file is (`kind`: list item, note, picture, link…),
    so it is shown as what it is, never as a note when it isn't one."""
    if db_ is not None:
        _, planet, lst = comet_on(db_, r['block_id'])
    kind = 'item' if lst and r['kind'] == 'text' else r['kind']
    thumb = f"/t/{r['block_id']}?v={r['thumb_key'][:8]}" if r['thumb_key'] else None
    return {'id': r['block_id'], 'title': comet_title(r)[:80], 'kind': kind, 'list': lst, 'thumb': thumb,
            'planet': planet, 'day': r['day'], 'time': r['time'],
            'said': r['said'] or '', 'yearly': bool(r['yearly']), 'at': ms(r['at']), 'ahead': ms(r['ahead']),
            'from': ms(r['made_at']), 'done': ms(r['done_at']) if r['done_at'] else None,
            'due': r['at'] <= now() and not r['done_at'], 'soon': False,   # no heads-up any more (comet_times)
            'closed': r['closed'] == r['at']}


def roll_yearly(db_, user_id=None):
    """A birthday's comet, dealt with and gone, comes round again for next year."""
    gone = now() - COMET_LEAVING * 86400
    rows = db_.execute('SELECT * FROM reminders WHERE yearly = 1 AND done_at IS NOT NULL AND done_at < ?'
                       + (' AND user_id = ?' if user_id else ''), (gone, user_id) if user_id else (gone,)).fetchall()
    for r in rows:
        day = date.fromisoformat(r['day'])
        day = when.next_of({'day': day, 'yearly': True}, day + timedelta(days=1))
        at, ahead = comet_times(day, r['time'], r['tz'])
        db_.execute('UPDATE reminders SET day = ?, at = ?, ahead = ?, made_at = ?, sent_ahead = 0, sent_at = 0, closed = NULL, '
                    'done_at = NULL WHERE block_id = ?', (day.isoformat(), at, ahead, r['done_at'], r['block_id']))


def live_comets(db_, user_id):
    """Your comets still in the sky, nearest first, with the planet each is on. One ticked off or done
    is gone; for a few minutes it is still listed with `done`, so the galaxy burns it up into the void."""
    roll_yearly(db_, user_id)
    burning = now() - COMET_BURN
    rows = db_.execute('SELECT r.*, b.content, b.kind, b.title, b.file_name, b.thumb_key FROM reminders r JOIN blocks b ON b.id = r.block_id '
                       'WHERE r.user_id = ? AND b.deleted_at IS NULL AND (r.done_at IS NULL OR r.done_at > ?) '
                       'ORDER BY r.at', (user_id, burning)).fetchall()
    out = []
    for r in rows:
        on, planet, lst = comet_on(db_, r['block_id'])
        c = comet_json(r, planet, lst)
        if on and all(x['checked'] for x in on) and not r['done_at']:
            # ticked off on its list: done with, burning up if that was just now
            ticked = max(x['checked'] for x in on)
            if ticked <= burning:
                continue
            c.update(done=ms(ticked), due=False, soon=False)
        out.append(c)
    return out


@route('GET', r'/api/comets')
def comets(req):
    """Your comets: {comets: [...]}, every one, waiting ones and the nearest first."""
    out = live_comets(req.db, req.user['id'])
    out.sort(key=lambda c: (c['done'] is not None, c['at']))
    return json_response({'comets': out})


@route('GET', r'/api/drawers/(?P<drawer_id>[\w-]+)/comets')
def planet_comets(req, drawer_id):
    """For a list of yours: which of your notes on it are comets ({id: comet}), and which name a day
    still to come and could be (`could`, with `tz`), so each item can offer one in its menu."""
    own_drawer(req, drawer_id)   # yours, or kept together with you: only your own notes on it count
    tz = _tz_arg(req.arg('tz'))
    rows = req.db.execute('SELECT b.id, b.content, c.checked, r.block_id AS made FROM connections c JOIN blocks b ON b.id = c.block_id '
                          'LEFT JOIN reminders r ON r.block_id = b.id '
                          'WHERE c.drawer_id = ? AND b.user_id = ? AND b.kind = \'text\' AND b.deleted_at IS NULL',
                          (drawer_id, req.user['id'])).fetchall()
    made = {r['id'] for r in rows if r['made']}
    live = {c['id']: c for c in live_comets(req.db, req.user['id']) if c['id'] in made and not c['done']}
    could = [r['id'] for r in rows if not r['made'] and not r['checked'] and first_day(r['content'], tz)]
    ticked = [r['id'] for r in rows if r['checked']]   # Done on a comet elsewhere ticks it off here too
    return json_response({'comets': live, 'could': could, 'ticked': ticked})


@route('GET', r'/api/comets/due')
def comets_due(req):
    """What to tell you now: comets whose time has come and not been dealt with (`due`), unless their
    note was closed. Asked by the page and by the device's service worker when a push wakes it.
    A closed note's comet still waits in the sky until it is done."""
    out = [c for c in live_comets(req.db, req.user['id']) if (c['due'] or c['soon']) and not c['closed']]
    return json_response({'comets': out})


def _own_comet(req, block_id):
    own_block(req, block_id)
    r = req.db.execute('SELECT r.*, b.content, b.kind, b.title, b.file_name, b.thumb_key FROM reminders r JOIN blocks b ON b.id = r.block_id WHERE r.block_id = ?',
                       (block_id,)).fetchone()
    if not r:
        raise HttpError(404, 'That file isn’t a comet.')
    return r


@route('POST', r'/api/blocks/(?P<block_id>[\w-]+)/comet')
def make_comet(req, block_id):
    """Make one of your files a comet: {tz} (the page's minutes east of UTC), and {day, time} when you
    picked when (any file). Without them it reminds you of the first day a note's words name that is
    still to come. Made again, it starts over."""
    row = own_block(req, block_id)
    body = req.json()
    tz = _tz_arg(body.get('tz'))
    if body.get('day'):
        try:
            day = date.fromisoformat(str(body['day']))
        except ValueError:
            raise HttpError(400, 'That isn’t a day.')
        clock = body.get('time') or None
        if clock is not None and not re.fullmatch(r'([01]\d|2[0-3]):[0-5]\d', str(clock)):
            raise HttpError(400, 'That isn’t a time.')
        f = {'time': clock, 'said': '', 'yearly': False}
        got = first_day(words_of(row), tz)
        if got and got[1] == day and got[0]['time'] == clock:
            f = got[0]   # what the words say: it keeps following them
    else:
        got = first_day(words_of(row), tz)
        if not got:
            raise HttpError(400, 'Pick a day for the comet to remind you.')
        f, day = got
    at, ahead = comet_times(day, f['time'], tz)
    if at <= now():
        raise HttpError(400, 'That time has already gone.')
    req.db.execute('INSERT OR REPLACE INTO reminders (block_id, user_id, day, time, said, yearly, tz, at, ahead, made_at, '
                   'sent_ahead, sent_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)',
                   (block_id, req.user['id'], day.isoformat(), f['time'], f['said'][:80], int(f['yearly']), tz, at, ahead, now(),
                    int(ahead <= now())))
    return json_response({'comet': comet_json(_own_comet(req, block_id), db_=req.db)})


@route('GET', r'/api/blocks/(?P<block_id>[\w-]+)/comet')
def get_comet(req, block_id):
    """A note's comet, or {comet: null}; with `tz`, also what day its words name now (`could`), for the offer."""
    row = own_block(req, block_id)
    r = req.db.execute('SELECT r.*, b.content, b.kind, b.title, b.file_name, b.thumb_key FROM reminders r JOIN blocks b ON b.id = r.block_id WHERE r.block_id = ?',
                       (block_id,)).fetchone()
    could = None
    if req.arg('tz') is not None:
        got = first_day(words_of(row), _tz_arg(req.arg('tz')))
        if got:
            could = {'day': got[1].isoformat(), 'time': got[0]['time'], 'said': got[0]['said']}
    return json_response({'comet': comet_json(r, db_=req.db) if r and (r['done_at'] or not ticked(req.db, block_id)) else None, 'could': could})


@route('DELETE', r'/api/blocks/(?P<block_id>[\w-]+)/comet')
def stop_comet(req, block_id):
    """No longer a comet (the note stays as it is)."""
    _own_comet(req, block_id)
    req.db.execute('DELETE FROM reminders WHERE block_id = ?', (block_id,))
    return json_response({'ok': True})


@route('POST', r'/api/blocks/(?P<block_id>[\w-]+)/comet/(?P<act>done|snooze|close|back)')
def deal_with_comet(req, block_id, act):
    """done: dealt with, it swings round and leaves. snooze {for: 'hour' | 'tomorrow'}: it backs out a
    little and comes in again. close: the heads-up note waved away. back: Undo of done or snooze, with
    {comet}: the comet as it was."""
    r = _own_comet(req, block_id)
    body = req.json()
    if act == 'done':
        req.db.execute('UPDATE reminders SET done_at = ? WHERE block_id = ?', (now(), block_id))
        # done is ticked off too, on every list it is on (the comet opened from the sky, the note under the clock)
        req.db.execute("UPDATE connections SET checked = ? WHERE block_id = ? AND checked IS NULL AND drawer_id IN "
                       "(SELECT id FROM drawers WHERE json_extract(modes, '$.list.on') = 1)", (now(), block_id))
    elif act == 'close':
        req.db.execute('UPDATE reminders SET closed = at WHERE block_id = ?', (block_id,))
    elif act == 'snooze':
        span = body.get('for')
        if span == 'hour':
            at = now() + 3600
        elif span == 'tomorrow':
            local = _local_now(r['tz']) + timedelta(days=1)
            h, m = map(int, (r['time'] or COMET_MORNING).split(':'))
            at = _utc(datetime(local.year, local.month, local.day, h, m), r['tz'])
        else:
            raise HttpError(400, 'Snooze for an hour or until tomorrow.')
        # it comes in again from most of the way there (its journey 85% gone)
        req.db.execute('UPDATE reminders SET at = ?, ahead = ?, made_at = ?, sent_ahead = 1, sent_at = 0, done_at = NULL '
                       'WHERE block_id = ?', (at, at, now() - (at - now()) * 0.85 / 0.15, block_id))
    else:
        was = body.get('comet') or {}
        try:
            at, ahead, made = float(was['at']) / 1000, float(was['ahead']) / 1000, float(was['from']) / 1000
        except (KeyError, TypeError, ValueError):
            raise HttpError(400, 'Nothing to put back.')
        req.db.execute('UPDATE reminders SET at = ?, ahead = ?, made_at = ?, done_at = NULL, sent_ahead = ?, sent_at = ? '
                       'WHERE block_id = ?', (at, ahead, made, int(ahead <= now()), int(at <= now()), block_id))
        if r['done_at']:   # what Done ticked off comes back too
            req.db.execute('UPDATE connections SET checked = NULL WHERE block_id = ? AND checked >= ?', (block_id, r['done_at']))
    return json_response({'comet': comet_json(_own_comet(req, block_id), db_=req.db)})


def follow_words(db_, block_id, content):
    """A note's words changed: its comet follows the day they now name (if they still name one)."""
    r = db_.execute('SELECT * FROM reminders WHERE block_id = ? AND done_at IS NULL', (block_id,)).fetchone()
    if not r or not r['said']:
        return   # a day picked by hand stays as it was picked
    got = first_day(content, r['tz'])
    if not got:
        return  # no day any more: it keeps the one it had until it's stopped
    f, day = got
    if day.isoformat() == r['day'] and f['time'] == r['time']:
        return
    at, ahead = comet_times(day, f['time'], r['tz'])
    db_.execute('UPDATE reminders SET day = ?, time = ?, said = ?, yearly = ?, at = ?, ahead = ?, sent_ahead = ?, sent_at = 0, '
                'closed = NULL WHERE block_id = ?',
                (day.isoformat(), f['time'], f['said'][:80], int(f['yearly']), at, ahead, int(ahead <= now()), block_id))


def _ics_text(text):
    return re.sub(r'([,;\\])', r'\\\1', text).replace('\n', '\\n')


@route('GET', r'/api/blocks/(?P<block_id>[\w-]+)/comet\.ics')
def comet_calendar(req, block_id):
    """The comet as a calendar entry with its one alarm, so a phone's own Calendar can remind you too."""
    r = _own_comet(req, block_id)
    first = comet_title(r)[:120]
    stamp = lambda t: datetime.fromtimestamp(t, timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    day = date.fromisoformat(r['day'])
    if r['time']:
        when_lines = [f'DTSTART:{stamp(r["at"])}', f'DTEND:{stamp(r["at"] + 1800)}']
        alarms = ['PT0M']
    else:
        when_lines = [f'DTSTART;VALUE=DATE:{day:%Y%m%d}', f'DTEND;VALUE=DATE:{day + timedelta(days=1):%Y%m%d}']
        alarms = ['PT9H']   # 9 am on the day
    lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Mutt//Comets//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
             f'UID:comet-{block_id}@mutt', f'DTSTAMP:{stamp(now())}', *when_lines, f'SUMMARY:{_ics_text(first)}',
             f'DESCRIPTION:{_ics_text("A comet in Mutt: " + (r["content"] or "")[:1000])}']
    if r['yearly']:
        lines.append('RRULE:FREQ=YEARLY')
    for trigger in alarms:
        lines += ['BEGIN:VALARM', 'ACTION:DISPLAY', f'DESCRIPTION:{_ics_text(first)}', f'TRIGGER:{trigger}', 'END:VALARM']
    lines += ['END:VEVENT', 'END:VCALENDAR']
    body = ('\r\n'.join(lines) + '\r\n').encode()
    name = re.sub(r'[^\w -]+', '', first)[:40].strip() or 'Comet'
    return Response(200, [('Content-Type', 'text/calendar; charset=utf-8'), ('Content-Length', str(len(body))),
                          ('Content-Disposition', f'attachment; filename="{name}.ics"'), ('Cache-Control', 'no-store')], [body])


@route('GET', r'/api/push/key')
def push_key(req):
    """The key a device subscribes to comet pushes with (none when pushes are off)."""
    return json_response({'key': webpush.public_key() if webpush.ON else None})


@route('POST', r'/api/push')
def push_subscribe(req):
    """{endpoint}: this device wants to be told when a comet is due, even with Mutt closed."""
    endpoint = req.json().get('endpoint')
    if not isinstance(endpoint, str) or len(endpoint) > 1000 or not webpush.allowed(endpoint):
        raise HttpError(400, 'That device can’t be told.')
    req.db.execute('INSERT OR REPLACE INTO push_subs (endpoint, user_id, contact, made_at) VALUES (?, ?, ?, ?)',
                   (endpoint, req.user['id'], f'https://{req.host}', now()))
    return json_response({'ok': True})


@route('DELETE', r'/api/push')
def push_unsubscribe(req):
    endpoint = req.json().get('endpoint')
    if isinstance(endpoint, str):
        req.db.execute('DELETE FROM push_subs WHERE endpoint = ? AND user_id = ?', (endpoint, req.user['id']))
    return json_response({'ok': True})


def push_due(conn):
    """Send what has come due, once each (no heads-up first), to every device each owner asked on."""
    t = now()
    roll_yearly(conn)
    rows = conn.execute('SELECT r.block_id, r.user_id, r.at, r.ahead, r.sent_ahead, r.sent_at FROM reminders r '
                        'JOIN blocks b ON b.id = r.block_id WHERE r.done_at IS NULL AND b.deleted_at IS NULL '
                        'AND r.sent_at = 0 AND r.at <= ?', (t,)).fetchall()
    wake = set()
    for r in rows:
        conn.execute('UPDATE reminders SET sent_ahead = 1, sent_at = 1 WHERE block_id = ?', (r['block_id'],))
        if not ticked(conn, r['block_id']):
            wake.add(r['user_id'])
    for uid in wake:
        live.tell_person(uid, 'comets')
        for sub in conn.execute('SELECT endpoint, contact FROM push_subs WHERE user_id = ?', (uid,)).fetchall():
            if webpush.send(sub['endpoint'], sub['contact']) == 'gone':
                conn.execute('DELETE FROM push_subs WHERE endpoint = ?', (sub['endpoint'],))


def start_comets():
    """Every half a minute, tell the devices of anyone whose comet has come due."""
    def loop():
        while True:
            try:
                conn = db.connect()
                try:
                    push_due(conn)
                finally:
                    conn.close()
            except Exception:
                traceback.print_exc()
            time.sleep(COMET_PUSH_EVERY)
    threading.Thread(target=loop, name='comets', daemon=True).start()


# ---------------------------------------------------------------- cookbooks

def drawer_files(req, drawer_id):
    return req.db.execute('SELECT b.* FROM connections c JOIN blocks b ON b.id = c.block_id WHERE c.drawer_id = ? '
                          'ORDER BY c.position, c.connected_at DESC', (drawer_id,)).fetchall()


def read_recipe(row, meta, lenient=False):
    """The card for one file, or None if it isn't a recipe. Returns
    (recipe, changed): changed means the file's saved card is out of date.
    Notes and links are read as on a planet about food: it's a cookbook."""
    old = meta.get('recipe') if isinstance(meta.get('recipe'), dict) else None
    changed = False
    if row['kind'] == 'text':
        stamp = recipes.sig(row['content'])
        if old and old.get('sig') == stamp:
            rec = dict(old)
        else:
            # A note edited somewhere else is read again; its chapter and photo stay.
            found = ((recipes.parse(row['content'], row['title']) or recipes.stub(row['content'], row['title']))
                     if old or lenient else recipes.is_recipe_note(row['content'], row['title'], food=True))
            if not found:
                return None, False
            keep = {k: old[k] for k in ('chapter', 'chapterSet', 'photo') if old and k in old}
            rec = {**found, **keep, 'sig': stamp}
            changed = True
    elif row['kind'] == 'link':
        if old:
            rec = dict(old)
        elif recipes.is_recipe_link(row, meta, food=True):
            rec = {'title': row['title'] or '', 'serves': None, 'makes': '', 'prep': None, 'cook': None,
                   'ingredients': [], 'steps': [], 'notes': ''}
        else:
            return None, False
    else:
        return None, False
    if not rec.get('chapter'):
        rec['chapter'] = recipes.chapter_of(rec)
        changed = True
    return rec, changed


def save_recipe_meta(req, block_id, meta, rec):
    meta['recipe'] = rec
    req.db.execute('UPDATE blocks SET meta = ? WHERE id = ?', (json.dumps(meta, ensure_ascii=False), block_id))


def photo_json(req, photo_id, owner_id):
    if not photo_id:
        return None
    p = req.db.execute('SELECT id, file_key, file_name, thumb_key, kind, width, height FROM blocks '
                       'WHERE id = ? AND user_id = ? AND deleted_at IS NULL', (photo_id, owner_id)).fetchone()
    if not p or not (p['thumb_key'] or p['kind'] == 'image'):
        return None
    file_url = f"/f/{p['id']}/{urllib.parse.quote(p['file_name'] or 'photo')}" if p['file_key'] else None
    thumb = f"/t/{p['id']}?v={p['thumb_key'][:8]}" if p['thumb_key'] else file_url
    return {'id': p['id'], 'thumb': thumb, 'file': file_url if p['kind'] == 'image' else thumb,
            'width': p['width'], 'height': p['height']}


def card_json(req, row, meta, rec):
    mine = row['user_id'] == req.user['id']
    photo = photo_json(req, rec.get('photo'), row['user_id'])
    link = row['kind'] == 'link'
    return {
        'id': row['id'], 'kind': row['kind'], 'mine': mine,
        'title': rec.get('title') or row['title'] or 'Untitled recipe',
        'serves': rec.get('serves'), 'makes': rec.get('makes') or '',
        'prep': rec.get('prep'), 'cook': rec.get('cook'),
        'ingredients': rec.get('ingredients') or [], 'steps': rec.get('steps') or [],
        'notes': rec.get('notes') or '', 'chapter': rec.get('chapter') or recipes.OTHER_CHAPTER,
        'photo': photo,
        'cover': None if photo or not link or not row['thumb_key'] else f"/t/{row['id']}?v={row['thumb_key'][:8]}",
        'source': row['content'] if link else None,
        'site': (meta.get('siteName') or meta.get('domain')) if link else None,
        'updatedAt': ms(row['updated_at']),
    }


def chapter_order(modes, cards):
    """Dividers in the box: the owner's order first, then the usual one."""
    order = list((modes.get('cookbook') or {}).get('chapters') or [])
    used = {c['chapter'] for c in cards}
    for name in recipes.CHAPTERS:
        if name not in order:
            order.append(name)
    for c in cards:
        if c['chapter'] not in order:
            order.insert(len(order) - 1, c['chapter'])
    return [name for name in order if name in used]


def recipe_box(req, drawer, refresh_links=False):
    rows = drawer_files(req, drawer['id'])
    if refresh_links and drawer['user_id'] == req.user['id']:
        read_recipe_links(req, rows)
        rows = drawer_files(req, drawer['id'])
    cards = []
    for row in rows:
        meta = json.loads(row['meta'] or '{}')
        rec, changed = read_recipe(row, meta)
        if not rec:
            continue
        if changed and row['user_id'] == req.user['id']:
            save_recipe_meta(req, row['id'], meta, rec)
        cards.append(card_json(req, row, meta, rec))
    cards.sort(key=lambda c: c['title'].lower())
    return {'recipes': cards, 'chapters': chapter_order(drawer_modes(drawer), cards),
            'photos': [c['photo']['id'] for c in cards if c['photo']]}


def read_recipe_links(req, rows):
    """Saved recipe links from before Mutt read recipes: read each page once."""
    todo = []
    for row in rows:
        meta = json.loads(row['meta'] or '{}')
        if (row['kind'] == 'link' and row['user_id'] == req.user['id'] and 'recipe' not in meta
                and not meta.get('recipeTried') and recipes.is_recipe_link(row, meta, food=True)):
            todo.append((row, meta))
    if not todo:
        return

    def fetch(item):
        try:
            return links.inspect(item[0]['content'])[0].get('recipe')
        except Exception:
            return None
    with ThreadPoolExecutor(max_workers=6) as pool:
        found = list(pool.map(fetch, todo[:24]))
    for (row, meta), rec in zip(todo, found):
        meta['recipeTried'] = True
        if rec:
            meta['recipe'] = rec
        req.db.execute('UPDATE blocks SET meta = ? WHERE id = ?', (json.dumps(meta, ensure_ascii=False), row['id']))


def split_dish_lists(req, drawer):
    """A note listing meals ("curry, fish w/couscous, lasagne") gives each
    meal its own card: a new note per dish, beside the list. The list itself
    stays on the planet (out of sight in the box) and is only split once."""
    for row in drawer_files(req, drawer['id']):
        if row['kind'] != 'text' or row['user_id'] != req.user['id']:
            continue
        meta = json.loads(row['meta'] or '{}')
        if meta.get('dishesSplit'):
            continue
        dishes = recipes.dish_list(row['content'], row['title'])
        if not dishes:
            continue
        place = req.db.execute('SELECT position FROM connections WHERE drawer_id = ? AND block_id = ?',
                               (drawer['id'], row['id'])).fetchone()[0]
        for dish in dishes[:60]:
            block_id = insert_block(req, kind='text', title='', content=dish[:200])
            connect(req.db, block_id, drawer['id'], place)
        meta['dishesSplit'] = True
        req.db.execute('UPDATE blocks SET meta = ? WHERE id = ?', (json.dumps(meta, ensure_ascii=False), row['id']))


@route('POST', r'/api/drawers/(?P<drawer_id>[\w-]+)/cookify')
def cookify_drawer(req, drawer_id):
    """Turn cookbook mode on: every recipe note and recipe link on the planet
    is read into a card."""
    row = own_drawer(req, drawer_id)
    if row['parent_id']:
        raise HttpError(400, 'Moons can’t be cookbooks.')
    split_dish_lists(req, row)
    box = recipe_box(req, row, refresh_links=True)
    modes = clean_modes({'cookbook': {'on': True, 'dismissed': False}}, drawer_modes(row))
    req.db.execute('UPDATE drawers SET modes = ?, updated_at = ? WHERE id = ?', (json.dumps(modes), now(), drawer_id))
    row = own_drawer(req, drawer_id)
    count = req.db.execute('SELECT COUNT(*) FROM connections WHERE drawer_id = ?', (drawer_id,)).fetchone()[0]
    return json_response({'drawer': planet_json(req, row, count), 'box': box})


@route('GET', r'/api/drawers/(?P<drawer_id>[\w-]+)/recipes')
def drawer_recipes(req, drawer_id):
    """The recipe cards on a planet, by chapter, for whoever can see it."""
    return json_response(recipe_box(req, visible_drawer(req, drawer_id)))


@route('POST', r'/api/drawers/(?P<drawer_id>[\w-]+)/recipes')
def new_recipe(req, drawer_id):
    """A new, blank (or filled) card: a recipe note on the planet."""
    own_drawer(req, drawer_id)
    try:
        rec = {'title': '', 'serves': None, 'makes': '', 'prep': None, 'cook': None,
               'ingredients': [], 'steps': [], 'notes': '', **recipes.clean(req.json())}
    except ValueError:
        raise HttpError(400, 'That recipe could not be saved.')
    rec['title'] = rec['title'] or 'New recipe'
    if not rec.get('chapter'):
        rec['chapter'] = recipes.chapter_of(rec)
    else:
        rec['chapterSet'] = True
    if rec.get('photo') and not photo_json(req, rec['photo'], req.user['id']):
        raise HttpError(400, 'That photo could not be found.')
    content = recipes.to_text(rec)
    rec['sig'] = recipes.sig(content)
    block_id = insert_block(req, kind='text', title=rec['title'], content=content, meta={'recipe': rec})
    connect(req.db, block_id, drawer_id)
    row = own_block(req, block_id)
    return json_response({'recipe': card_json(req, row, json.loads(row['meta']), rec),
                          'block': block_json(row)}, status=201)


@route('PUT', r'/api/blocks/(?P<block_id>[\w-]+)/recipe')
def save_recipe(req, block_id):
    """Save a card. A note's text is written out again from it, so the note
    and the card stay the same thing."""
    row = own_block(req, block_id)
    if row['kind'] not in ('text', 'link'):
        raise HttpError(400, 'Only notes and links can be recipes.')
    try:
        given = recipes.clean(req.json())
    except ValueError:
        raise HttpError(400, 'That recipe could not be saved.')
    meta = json.loads(row['meta'] or '{}')
    rec, _ = read_recipe(row, meta, lenient=True)
    rec = {**(rec or {'title': row['title'] or '', 'ingredients': [], 'steps': [], 'notes': ''}), **given}
    if 'chapter' in given:
        rec['chapterSet'] = True
    elif not rec.get('chapterSet'):
        rec['chapter'] = recipes.chapter_of(rec)  # a chapter Mutt picked follows the new name
    if given.get('photo') and not photo_json(req, given['photo'], req.user['id']):
        raise HttpError(400, 'That photo could not be found.')
    if row['kind'] == 'text':
        content = recipes.to_text(rec)
        rec['sig'] = recipes.sig(content)
        keep_before(req, row, content)
        req.db.execute('UPDATE blocks SET content = ?, title = ?, updated_at = ? WHERE id = ?',
                       (content, (rec.get('title') or '')[:200], now(), block_id))
    else:
        req.db.execute('UPDATE blocks SET updated_at = ? WHERE id = ?', (now(), block_id))
    save_recipe_meta(req, block_id, meta, rec)
    row = own_block(req, block_id)
    return json_response({'recipe': card_json(req, row, meta, rec), 'block': block_json(row)})


@route('POST', r'/api/drawers/(?P<drawer_id>[\w-]+)/chapters')
def rename_chapter(req, drawer_id):
    """Rename a divider: every card behind it moves with it."""
    row = own_drawer(req, drawer_id)
    body = req.json()
    old = body.get('from')
    new = (body.get('to') or '').strip() if isinstance(body.get('to'), str) else ''
    if not isinstance(old, str) or not new or len(new) > recipes.MAX_CHAPTER:
        raise HttpError(400, 'Give the chapter a name.')
    with db.transaction(req.db):
        for f in drawer_files(req, drawer_id):
            if f['user_id'] != req.user['id']:
                continue
            meta = json.loads(f['meta'] or '{}')
            rec, _ = read_recipe(f, meta)
            if rec and rec.get('chapter') == old:
                rec['chapter'] = new
                rec['chapterSet'] = True
                save_recipe_meta(req, f['id'], meta, rec)
        modes = drawer_modes(row)
        order = list((modes.get('cookbook') or {}).get('chapters') or [])
        order += [c for c in recipes.CHAPTERS if c not in order]
        if old in order:
            order[order.index(old)] = new
        elif new not in order:
            order.insert(len(order) - 1, new)
        modes = clean_modes({'cookbook': {'chapters': order}}, modes)
        req.db.execute('UPDATE drawers SET modes = ? WHERE id = ?', (json.dumps(modes), drawer_id))
    return json_response(recipe_box(req, own_drawer(req, drawer_id)))


# ---------------------------------------------------------------- split into moons

def save_split(req, row, last):
    saved = drawer_modes(row)
    state = {**(saved.get('split') or {})}
    if last:
        state['last'] = last
    else:
        state.pop('last', None)
    saved['split'] = state
    req.db.execute('UPDATE drawers SET modes = ? WHERE id = ?', (json.dumps(saved), row['id']))


@route('POST', r'/api/drawers/(?P<drawer_id>[\w-]+)/split')
def split_drawer(req, drawer_id):
    """Give each clearly different thing on a planet a moon of its own and move
    its files there (mutt/split.py says which). The planet keeps what fits no
    group, the group it's named after, and other people's files. What moved is
    kept on the planet (modes.split.last) so Undo can put it all back."""
    row = own_drawer(req, drawer_id, owner_only=True)
    if keeper_of(req.db, row):
        raise HttpError(400, 'A planet kept together isn’t split.')
    if row['parent_id']:
        raise HttpError(400, 'A moon can’t have moons.')
    plan = split_moons.plan(req.db, row, modes_registry.Reading(req.db, row).files, MAX_MOONS)
    going = [g for g in plan['groups'] if not g['stays']]
    if not going:
        raise HttpError(400, 'There’s nothing here to split any more.')
    stamp = now()
    made, moved, moons = [], [], {}
    with db.transaction(req.db):
        visibility, people, modes = moon_start(req, row)
        for g in going:
            moon_id = g['moon']
            if not moon_id:
                moon_id = new_id()
                req.db.execute(
                    'INSERT INTO drawers (id, user_id, title, description, icon, created_at, updated_at, community, '
                    'visibility, parent_id, modes, own_sharing, look) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 0, ?)',
                    (moon_id, req.user['id'], g['name'], '', json.dumps(default_icon()), stamp, stamp, visibility,
                     row['id'], json.dumps(modes), fresh_look(req.db, req.user['id'], row['id'])))
                for user_id in people:
                    req.db.execute('INSERT INTO drawer_access (drawer_id, user_id) VALUES (?, ?)', (moon_id, user_id))
                made.append(moon_id)
            high = req.db.execute('SELECT MAX(position) FROM connections WHERE drawer_id = ?', (moon_id,)).fetchone()[0]
            at = (high + 1) if high is not None else 0
            for block_id in g['ids']:
                spot = req.db.execute('SELECT position, checked FROM connections WHERE drawer_id = ? AND block_id = ?',
                                      (row['id'], block_id)).fetchone()
                if not spot:
                    continue
                there = req.db.execute('SELECT 1 FROM connections WHERE drawer_id = ? AND block_id = ?',
                                       (moon_id, block_id)).fetchone()
                req.db.execute('DELETE FROM connections WHERE drawer_id = ? AND block_id = ?', (row['id'], block_id))
                if not there:
                    req.db.execute('INSERT INTO connections (block_id, drawer_id, position, connected_at, checked) '
                                   'VALUES (?, ?, ?, ?, ?)', (block_id, moon_id, at, stamp, spot['checked']))
                    at += 1
                moved.append([block_id, moon_id, spot['position'], spot['checked'], bool(there)])
                moons.setdefault(moon_id, []).append(block_id)
            req.db.execute('UPDATE drawers SET updated_at = ? WHERE id = ?', (stamp, moon_id))
        req.db.execute('UPDATE drawers SET updated_at = ? WHERE id = ?', (stamp, row['id']))
        save_split(req, row, {'at': stamp, 'made': made, 'moved': moved})
    row = own_drawer(req, drawer_id)
    count = req.db.execute('SELECT COUNT(*) FROM connections WHERE drawer_id = ?', (drawer_id,)).fetchone()[0]
    return json_response({'drawer': planet_json(req, row, count), 'made': made, 'moved': moons})


@route('POST', r'/api/drawers/(?P<drawer_id>[\w-]+)/split/undo')
def unsplit_drawer(req, drawer_id):
    """Put a split back: every file it moved returns to its old place on the
    planet, and the moons it made go, unless something new was put on one
    since (that moon stays, with only the new things)."""
    row = own_drawer(req, drawer_id)
    last = (drawer_modes(row).get('split') or {}).get('last')
    if not last:
        raise HttpError(400, 'There’s no split to undo.')
    stamp = now()
    back = []
    with db.transaction(req.db):
        for block_id, moon_id, position, checked, was_there in last.get('moved') or []:
            on_moon = req.db.execute('SELECT 1 FROM connections WHERE drawer_id = ? AND block_id = ?',
                                     (moon_id, block_id)).fetchone()
            alive = req.db.execute('SELECT 1 FROM blocks WHERE id = ? AND deleted_at IS NULL', (block_id,)).fetchone()
            if not alive or (not on_moon and not was_there):
                continue  # deleted, or moved on by hand since
            if on_moon and not was_there:
                req.db.execute('DELETE FROM connections WHERE drawer_id = ? AND block_id = ?', (moon_id, block_id))
            req.db.execute('INSERT OR IGNORE INTO connections (block_id, drawer_id, position, connected_at, checked) '
                           'VALUES (?, ?, ?, ?, ?)', (block_id, row['id'], position, stamp, checked))
            back.append(block_id)
        for moon_id in last.get('made') or []:
            left = req.db.execute('SELECT COUNT(*) FROM connections WHERE drawer_id = ?', (moon_id,)).fetchone()[0]
            if not left:
                req.db.execute('DELETE FROM drawers WHERE id = ? AND parent_id = ? AND user_id = ?',
                               (moon_id, row['id'], req.user['id']))
            else:
                req.db.execute('UPDATE drawers SET updated_at = ? WHERE id = ?', (stamp, moon_id))
        req.db.execute('UPDATE drawers SET updated_at = ? WHERE id = ?', (stamp, row['id']))
        save_split(req, row, None)
    row = own_drawer(req, drawer_id)
    blocks = blocks_in_drawer(req, drawer_id, community=bool(row['community']))
    return json_response({'drawer': planet_json(req, row, len(blocks)), 'blocks': blocks, 'back': back})


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
    if row['parent_id'] is None and keeper_of(req.db, row):
        raise HttpError(400, 'You keep this planet with someone. Leave it instead.')
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
            set_aside(req.db, orphan['id'])
        req.db.execute('DELETE FROM drawers WHERE parent_id = ?', (drawer_id,))
        req.db.execute('DELETE FROM drawers WHERE id = ?', (drawer_id,))
    return json_response({'ok': True, 'deletedBlocks': len(orphans)})


# ---------------------------------------------------------------- merging two planets
#
# One of your planets folded into another (right-click a planet on your galaxy,
# "Merge into…"). The planet named in the address is the one that stays; `from`
# goes. Its files move to the end of the one that stays, in their order and with
# their ticks; a file already on both just keeps its place there. Its moons
# become the other's moons (one that followed its planet's sharing follows the
# new one). Other people's files on a planet that took them stay only if the one
# that stays takes them too. What it was is kept (`planet_merges`, the last merge
# into each planet) so Undo can put it back as it was, with the same id.

def merge_room(conn, into_id, from_id):
    have = conn.execute('SELECT COUNT(*) FROM drawers WHERE parent_id = ?', (into_id,)).fetchone()[0]
    more = conn.execute('SELECT COUNT(*) FROM drawers WHERE parent_id = ?', (from_id,)).fetchone()[0]
    return have, more


@route('POST', r'/api/drawers/(?P<drawer_id>[\w-]+)/merge')
def merge_drawer(req, drawer_id):
    into = own_drawer(req, drawer_id, owner_only=True)
    gone = own_drawer(req, str(req.json().get('from') or ''), owner_only=True)
    if into['id'] == gone['id']:
        raise HttpError(400, 'A planet can’t be merged into itself.')
    if into['parent_id'] or gone['parent_id']:
        raise HttpError(400, 'Only planets can be merged, not moons.')
    if keeper_of(req.db, into) or keeper_of(req.db, gone):
        raise HttpError(400, 'A shared planet can’t be merged.')
    have, more = merge_room(req.db, into['id'], gone['id'])
    if have + more > MAX_MOONS:
        room = MAX_MOONS - have
        raise HttpError(400, (f'{into["title"]} already has {MAX_MOONS} moons.' if not room else
                              f'{into["title"]} has room for {room} more moon{"" if room == 1 else "s"}, '
                              f'and {gone["title"]} has {more}.'))
    takes_others = bool(into['community']) and into['visibility'] == 'public'
    stamp = now()
    with db.transaction(req.db):
        files = []
        high = req.db.execute('SELECT MAX(position) FROM connections WHERE drawer_id = ?', (into['id'],)).fetchone()[0]
        at = (high + 1) if high is not None else 0
        for c in req.db.execute(
                'SELECT c.block_id, c.position, c.connected_at, c.checked, c.placed, b.user_id FROM connections c '
                'JOIN blocks b ON b.id = c.block_id WHERE c.drawer_id = ? ORDER BY c.position, c.connected_at DESC',
                (gone['id'],)).fetchall():
            there = bool(req.db.execute('SELECT 1 FROM connections WHERE drawer_id = ? AND block_id = ?',
                                        (into['id'], c['block_id'])).fetchone())
            moves = not there and (c['user_id'] == req.user['id'] or takes_others)
            if moves:
                req.db.execute('INSERT INTO connections (block_id, drawer_id, position, connected_at, checked, placed) '
                               'VALUES (?, ?, ?, ?, ?, ?)',
                               (c['block_id'], into['id'], at, stamp, c['checked'], c['placed']))
                at += 1
            files.append([c['block_id'], c['position'], c['connected_at'], c['checked'], c['placed'], moves])
        people = [r[0] for r in req.db.execute('SELECT user_id FROM drawer_access WHERE drawer_id = ?', (into['id'],))]
        moons = []
        for m in req.db.execute('SELECT id, visibility, own_sharing FROM drawers WHERE parent_id = ?',
                                (gone['id'],)).fetchall():
            access = [r[0] for r in req.db.execute('SELECT user_id FROM drawer_access WHERE drawer_id = ?', (m['id'],))]
            moons.append({'id': m['id'], 'visibility': m['visibility'], 'access': access})
            req.db.execute('UPDATE drawers SET parent_id = ?, updated_at = ? WHERE id = ?', (into['id'], stamp, m['id']))
            if not m['own_sharing']:
                req.db.execute('UPDATE drawers SET visibility = ? WHERE id = ?', (into['visibility'], m['id']))
                req.db.execute('DELETE FROM drawer_access WHERE drawer_id = ?', (m['id'],))
                for user_id in (people if into['visibility'] == 'people' else []):
                    req.db.execute('INSERT INTO drawer_access (drawer_id, user_id) VALUES (?, ?)', (m['id'], user_id))
        record = {
            'drawer': {k: (v.hex() if isinstance(v, bytes) else v) for k, v in dict(gone).items()},
            'hashed': isinstance(gone['share_hash'], bytes),
            'access': [r[0] for r in req.db.execute('SELECT user_id FROM drawer_access WHERE drawer_id = ?', (gone['id'],))],
            'files': files, 'moons': moons, 'at': stamp,
        }
        req.db.execute('DELETE FROM drawers WHERE id = ?', (gone['id'],))
        req.db.execute('INSERT OR REPLACE INTO planet_merges (drawer_id, record, at) VALUES (?, ?, ?)',
                       (into['id'], json.dumps(record), stamp))
        req.db.execute('UPDATE drawers SET updated_at = ? WHERE id = ?', (stamp, into['id']))
    row = own_drawer(req, into['id'])
    count = req.db.execute('SELECT COUNT(*) FROM connections WHERE drawer_id = ?', (into['id'],)).fetchone()[0]
    return json_response({'drawer': planet_json(req, row, count), 'merged': gone['id'],
                          'moved': sum(1 for f in files if f[5]), 'moons': len(moons)})


@route('POST', r'/api/drawers/(?P<drawer_id>[\w-]+)/merge/undo')
def unmerge_drawer(req, drawer_id):
    """Put the last merge into this planet back: the other planet returns with
    the same id, name, look, sharing and place, its files where they were, its
    moons its own again. What moved and was taken off since stays off."""
    into = own_drawer(req, drawer_id, owner_only=True)
    found = req.db.execute('SELECT record FROM planet_merges WHERE drawer_id = ?', (into['id'],)).fetchone()
    if not found:
        raise HttpError(400, 'There’s no merge to undo.')
    record = json.loads(found['record'])
    old = dict(record['drawer'])
    if record.get('hashed') and old.get('share_hash'):
        old['share_hash'] = bytes.fromhex(old['share_hash'])
    if req.db.execute('SELECT 1 FROM drawers WHERE id = ?', (old['id'],)).fetchone():
        raise HttpError(400, 'That planet is already back.')
    columns = {r[1] for r in req.db.execute('PRAGMA table_info(drawers)')}
    old = {k: v for k, v in old.items() if k in columns}
    stamp = now()
    with db.transaction(req.db):
        req.db.execute(f'INSERT INTO drawers ({", ".join(old)}) VALUES ({", ".join("?" * len(old))})',
                       tuple(old.values()))
        for user_id in record.get('access') or []:
            req.db.execute('INSERT OR IGNORE INTO drawer_access (drawer_id, user_id) VALUES (?, ?)', (old['id'], user_id))
        for block_id, position, connected_at, checked, placed, moved in record.get('files') or []:
            if not req.db.execute('SELECT 1 FROM blocks WHERE id = ? AND deleted_at IS NULL', (block_id,)).fetchone():
                continue  # erased, or set aside since (its way back is Recently deleted)
            if moved and not req.db.execute('DELETE FROM connections WHERE drawer_id = ? AND block_id = ?',
                                            (into['id'], block_id)).rowcount:
                continue  # taken off since, by hand
            req.db.execute('INSERT OR IGNORE INTO connections (block_id, drawer_id, position, connected_at, checked, placed) '
                           'VALUES (?, ?, ?, ?, ?, ?)', (block_id, old['id'], position, connected_at, checked, placed))
        for m in record.get('moons') or []:
            moon = req.db.execute('SELECT own_sharing FROM drawers WHERE id = ? AND parent_id = ?',
                                  (m['id'], into['id'])).fetchone()
            if not moon:
                continue
            req.db.execute('UPDATE drawers SET parent_id = ?, updated_at = ? WHERE id = ?', (old['id'], stamp, m['id']))
            if not moon['own_sharing']:
                req.db.execute('UPDATE drawers SET visibility = ? WHERE id = ?', (m['visibility'], m['id']))
                req.db.execute('DELETE FROM drawer_access WHERE drawer_id = ?', (m['id'],))
                for user_id in m['access']:
                    req.db.execute('INSERT INTO drawer_access (drawer_id, user_id) VALUES (?, ?)', (m['id'], user_id))
        req.db.execute('DELETE FROM planet_merges WHERE drawer_id = ?', (into['id'],))
        req.db.execute('UPDATE drawers SET updated_at = ? WHERE id = ?', (stamp, into['id']))
    row = own_drawer(req, old['id'])
    count = req.db.execute('SELECT COUNT(*) FROM connections WHERE drawer_id = ?', (old['id'],)).fetchone()[0]
    return json_response({'drawer': planet_json(req, row, count), 'back': old['id']})


@route('PUT', r'/api/drawers/(?P<drawer_id>[\w-]+)/order')
def reorder_drawer(req, drawer_id):
    row = own_drawer(req, drawer_id)
    body = req.json()
    wanted = body.get('ids')
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
        if body.get('hand') is True and order != current and not showing_mode(row):
            note_hand_move(req.db, drawer_id)
    return json_response({'ok': True})


# ---------------------------------------------------------------- board (a planet arranged by hand)
#
# The board mode (mutt/modes.py read_board) is earned by moving a planet's
# files by hand. Once on, each thing sits where its owner put it: files and
# the board's own words in `board_items`, lines between them in `board_lines`.

BOARD_MOVES_KEPT = 31 * 86400      # a month of moves is plenty to read two weeks from
BOARD_MOST = 2000                  # things on one board
BOARD_REACH = 200000               # how far from the middle a thing may sit, in board units
BOARD_WORDS = 300                  # letters in one piece of the board's words
BOARD_STYLES = ('heading', 'label')


def showing_mode(row):
    """Whether the planet shows itself some other way than as plain files."""
    saved = json.loads(row['modes'] or '{}')
    return any((saved.get(m.key) or {}).get('on') for m in modes_registry.PLANET_MODES if m.shows)


def note_hand_move(conn, drawer_id):
    stamp = now()
    conn.execute('INSERT INTO hand_moves (drawer_id, at) VALUES (?, ?)', (drawer_id, stamp))
    conn.execute('DELETE FROM hand_moves WHERE drawer_id = ? AND at < ?', (drawer_id, stamp - BOARD_MOVES_KEPT))


def board_of(conn, drawer_id, files=None):
    """A planet's board: {'items': [...], 'lines': [[a, b], ...]}. Only files
    still on the planet (`files`, a set of ids) are given; the rest keep their
    row for when they come back."""
    items = []
    for r in conn.execute('SELECT * FROM board_items WHERE drawer_id = ? ORDER BY z, updated_at', (drawer_id,)):
        word = r['item_id'].startswith('w-')
        if not word and files is not None and r['item_id'] not in files:
            continue
        item = {'id': r['item_id'], 'x': r['x'], 'y': r['y'], 'w': r['w'], 'h': r['h'], 'z': r['z']}
        if word:
            item.update(words=r['words'] or '', style=r['style'] or 'heading')
        items.append(item)
    shown = {i['id'] for i in items}
    lines = [[r['a'], r['b']] for r in conn.execute(
        'SELECT a, b FROM board_lines WHERE drawer_id = ? ORDER BY created_at', (drawer_id,))
        if r['a'] in shown and r['b'] in shown]
    return {'items': items, 'lines': lines}


def board_files(conn, drawer_id):
    return {r[0] for r in conn.execute(
        'SELECT c.block_id FROM connections c JOIN blocks b ON b.id = c.block_id '
        'WHERE c.drawer_id = ? AND b.deleted_at IS NULL', (drawer_id,))}


@route('GET', r'/api/drawers/(?P<drawer_id>[\w-]+)/board')
def drawer_board(req, drawer_id):
    """Where everything sits on a planet's board, for anyone who can see the planet.
    With ?arrange=1, its owner, on a board where no file has a place yet, also
    gets `groups`: the files gathered by subject ([{name, ids}], two or more, the
    same reading as Split into moons), so a new board can be laid out in groups.
    With ?groups=1 the owner always gets them (the board's Arrange menu)."""
    row = visible_drawer(req, drawer_id)
    out = board_of(req.db, drawer_id, board_files(req.db, drawer_id))
    fresh = not any(not i['id'].startswith('w-') for i in out['items'])
    if row['user_id'] == req.user['id'] and (req.arg('groups') or (req.arg('arrange') and fresh)):
        found, _ = split_moons.groups(row, modes_registry.Reading(req.db, row).files)
        out['groups'] = [{'name': g['name'], 'ids': g['ids']} for g in found] if len(found) >= 2 else []
    return json_response(out)


def board_number(value, low, high):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value != value:
        raise HttpError(400, 'Could not save the board.')
    return max(low, min(high, float(value)))


@route('PUT', r'/api/drawers/(?P<drawer_id>[\w-]+)/board')
def save_board(req, drawer_id):
    """Save what moved on a board: `items` [{id, x, y, w, h, z, words?, style?}]
    (only those that changed), `gone` (ids of the board's words taken away),
    `join` and `part` ([a, b] lines to add or take away)."""
    own_drawer(req, drawer_id)
    body = req.json()
    items, gone = body.get('items') or [], body.get('gone') or []
    join, part = body.get('join') or [], body.get('part') or []
    if not all(isinstance(v, list) for v in (items, gone, join, part)):
        raise HttpError(400, 'Could not save the board.')
    files = board_files(req.db, drawer_id)
    stamp = now()
    with db.transaction(req.db):
        for item in items:
            if not isinstance(item, dict) or not isinstance(item.get('id'), str):
                raise HttpError(400, 'Could not save the board.')
            iid = item['id']
            word = iid.startswith('w-')
            if word and not re.fullmatch(r'w-[\w-]{4,40}', iid):
                raise HttpError(400, 'Could not save the board.')
            if not word and iid not in files:
                continue  # taken off the planet meanwhile
            x = board_number(item.get('x'), -BOARD_REACH, BOARD_REACH)
            y = board_number(item.get('y'), -BOARD_REACH, BOARD_REACH)
            w = board_number(item.get('w'), 24, 4000)
            h = None if item.get('h') is None else board_number(item.get('h'), 16, 4000)
            z = int(board_number(item.get('z', 0), -1e6, 1e6))
            words = style = None
            if word:
                words = item.get('words')
                style = item.get('style', 'heading')
                if not isinstance(words, str) or len(words) > BOARD_WORDS or style not in BOARD_STYLES:
                    raise HttpError(400, 'Could not save those words.')
            req.db.execute('INSERT OR REPLACE INTO board_items (drawer_id, item_id, x, y, w, h, z, words, style, updated_at) '
                           'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', (drawer_id, iid, x, y, w, h, z, words, style, stamp))
        for iid in gone:
            if isinstance(iid, str) and iid.startswith('w-'):
                req.db.execute('DELETE FROM board_items WHERE drawer_id = ? AND item_id = ?', (drawer_id, iid))
                req.db.execute('DELETE FROM board_lines WHERE drawer_id = ? AND (a = ? OR b = ?)', (drawer_id, iid, iid))
        on_board = {r[0] for r in req.db.execute('SELECT item_id FROM board_items WHERE drawer_id = ?', (drawer_id,))}
        for pair in join + part:
            if not (isinstance(pair, list) and len(pair) == 2 and all(isinstance(v, str) for v in pair) and pair[0] != pair[1]):
                raise HttpError(400, 'Could not save that line.')
        for a, b in part:
            a, b = sorted((a, b))
            req.db.execute('DELETE FROM board_lines WHERE drawer_id = ? AND a = ? AND b = ?', (drawer_id, a, b))
        for a, b in join:
            a, b = sorted((a, b))
            if a in on_board and b in on_board:
                req.db.execute('INSERT OR IGNORE INTO board_lines (drawer_id, a, b, created_at) VALUES (?, ?, ?, ?)',
                               (drawer_id, a, b, stamp))
        if len(on_board) > BOARD_MOST:
            raise HttpError(400, 'That board is full.')
        req.db.execute('UPDATE drawers SET updated_at = ? WHERE id = ?', (stamp, drawer_id))
    return json_response(board_of(req.db, drawer_id, files))


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
    drawer_id, title, other = sorting.pick(req.db, req.user['id'], block, text)
    created = drawer_id is None
    if created:
        drawer_id = new_id()
        stamp = now()
        req.db.execute(
            'INSERT INTO drawers (id, user_id, title, description, icon, created_at, updated_at, community, visibility, modes, look) '
            "VALUES (?, ?, ?, '', ?, ?, ?, 0, 'public', '{\"shareTip\": true}', ?)",
            (drawer_id, req.user['id'], title, json.dumps(icon or default_icon()), stamp, stamp,
             fresh_look(req.db, req.user['id'])))
    connect(req.db, block_id, drawer_id, placed='auto')
    row = own_drawer(req, drawer_id)
    count = req.db.execute('SELECT COUNT(*) FROM connections WHERE drawer_id = ?', (drawer_id,)).fetchone()[0]
    answer = {'planet': planet_json(req, row, count, drawer_previews(req, drawer_id, limit=12)), 'created': created}
    if other:  # a close call: the toast offers the other planet too ("Sent to Recipes · Rome trip instead")
        answer['or'] = {'id': other, 'title': own_drawer(req, other)['title']}
    return answer


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
            data = bytearray(data)
            privacy.forget_place_bytes(data)
            with open(os.path.join(db.user_files_dir(req.user['id']), key), 'wb') as f:
                f.write(data)
            block_id = insert_block(req, kind='image', title=title or name, file_key=key, file_name=name,
                                    mime=mime, ext=ext, size=len(data),
                                    meta={'source': stripped, 'domain': info.get('domain'), 'unplaced': 1}, **shared)
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


def clean_file_name(value):
    return re.sub(r'[\\/\x00-\x1f\x7f]', '', value or '').strip()[:180] or 'Untitled'


@route('POST', r'/api/upload')
def upload(req):
    drawer_id = target_drawer(req, req.arg('drawer'))
    name = clean_file_name(req.arg('name'))
    sort = req.arg('autosort') == '1' and 'now'
    block_id, sorted_into = store_upload(req, name, drawer_id, req.arg('share') == '1', sort, icon_arg(req.arg('icon')))
    return json_response({'block': reload_block(req, block_id), 'sortedInto': sorted_into}, status=201)


def store_upload(req, name, drawer_id=None, share=False, sort=None, icon=None):
    """Keeps the request's body as a new file of `name`: read for sorting and search,
    its place forgotten, then put on `drawer_id`, or sorted (`sort` 'now'; 'when-seen'
    leaves a picture a star until the browser has read it, see.js `catchUp`)."""
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
    if size and kind in privacy.KINDS:
        privacy.forget_place(path)  # where it was taken stays in meta.media, for its owner only
        meta['unplaced'] = 1
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
    shared = {'shared_at': now()} if share else {}
    if sort == 'when-seen' and not drawer_id and kind == 'image':
        meta['sortWhenSeen'] = 1
    block_id = insert_block(req, kind=kind, title=title[:200], file_key=key, file_name=name,
                            mime=mime, ext=ext, size=size, meta=meta, **shared)
    if epub and epub['cover']:
        save_epub_cover(req, block_id, path, epub['cover'])
    sorted_into = None
    if drawer_id:
        connect(req.db, block_id, drawer_id)
    elif sort and not meta.get('sortWhenSeen'):
        sorted_into = autosort(req, block_id, icon, text)
    return block_id, sorted_into


@route('POST', r'/api/send', auth=False)
def send_to_mutt(req):
    """The "Send to Mutt" shortcut in the Share menu: the file's bytes as the body, its name
    in `X-Mutt-Name` (`X-Mutt-Ext` added when the name has none), the key in `Authorization`.
    The key can add files and nothing else; the cookie is never read here. A file lands as
    if dropped in the void. Always answers `said`, a line the shortcut shows."""
    def said(status, line, **more):
        return json_response({'said': line, **more}, status=status)
    owner = auth.send_key_user(req.db, req.header('Authorization') or req.header('X-Mutt-Key'))
    if not owner:
        return said(401, 'Mutt didn’t know that key. Make a new one in Mutt: your account, Share menu.')
    req.user = owner

    def header_text(header):
        value = req.header(header) or ''
        try:
            value = value.encode('latin-1').decode('utf-8')  # the Mac and iPhone send names as UTF-8
        except (UnicodeEncodeError, UnicodeDecodeError):
            pass
        return urllib.parse.unquote(value) if '%' in value else value
    name = clean_file_name(header_text('X-Mutt-Name') or req.arg('name'))
    ext = re.sub(r'[^\w]', '', header_text('X-Mutt-Ext') or req.arg('ext') or '')[:12].lower()
    if ext and not kinds.extension(name):
        name = f'{name}.{ext}'[:180]
    try:
        block_id, sorted_into = store_upload(req, name, sort='when-seen')
    except HttpError as err:
        return said(err.status, err.message)
    row = own_block(req, block_id)
    if sorted_into:
        line = f'{name} is on {sorted_into["planet"]["title"]}.'
    elif row['kind'] == 'image':
        line = f'{name} is in Mutt. It finds its planet next time you open Mutt.'
    else:
        line = f'{name} is in Mutt.'
    return said(201, line, block=block_id)


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


@route('PUT', r'/api/blocks/(?P<block_id>[\w-]+)/file')
def replace_file(req, block_id):
    """A PDF marked up in the file view, written back over the old one (the
    owner chose that the changes go into the file itself). Its address
    changes with every save, so nothing shows a stale copy."""
    row = own_block(req, block_id)
    if row['kind'] != 'pdf' or not row['file_key']:
        raise HttpError(400, 'Only a PDF can be marked up.')
    key = secrets.token_hex(12) + f".{row['ext'] or 'pdf'}"
    path = os.path.join(db.user_files_dir(req.user['id']), key)
    size = stream_to_file(req, path, MAX_UPLOAD)
    with open(path, 'rb') as f:
        head = f.read(1024)
    if b'%PDF-' not in head:
        os.remove(path)
        raise HttpError(400, 'That isn\u2019t a PDF.')
    meta = json.loads(row['meta'] or '{}')
    meta['rev'] = int(meta.get('rev') or 0) + 1
    text = sorting.read_text(path, 'pdf', False)
    if text:
        meta['gist'] = sorting.gist(text)
    req.db.execute('UPDATE blocks SET file_key = ?, size = ?, meta = ?, updated_at = ? WHERE id = ?',
                   (key, size, json.dumps(meta, ensure_ascii=False), now(), block_id))
    remove_block_files(req.user['id'], row['file_key'])  # someone's saved copy keeps its own link
    return json_response({'block': reload_block(req, block_id)})


def convertible(row):
    return bool(row['file_key']) and (row['kind'] == 'pdf' or convert.can_convert(row['ext']))


@route('GET', r'/api/blocks/(?P<block_id>[\w-]+)/document')
def document_preview(req, block_id):
    """A Word, OpenDocument or RTF file's pages as HTML, to read in the file view."""
    row, _ = readable_block(req, block_id)
    if not row['file_key'] or (row['ext'] or '').lower() not in convert.CONVERTIBLE - convert.PLAIN:
        raise HttpError(400, 'This file has no pages to show.')
    path = os.path.join(db.user_files_dir(row['user_id']), row['file_key'])
    try:
        blocks, _ = convert.read_blocks(path, row['ext'])
    except convert.Unreadable as err:
        raise HttpError(400, str(err))
    words = convert.to_markdown(blocks)
    return json_response({'html': documents.clean_html(convert.to_html(blocks)),
                          'words': documents.word_count(words), 'pictures': sum(b['t'] == 'img' for b in blocks)})


@route('POST', r'/api/blocks/(?P<block_id>[\w-]+)/document')
def make_document(req, block_id):
    """A Mutt document made from a stored file, put just after it on the planet
    it was opened from (or its first planet). The file itself is kept. A PDF
    is read in the browser and arrives as `html` and `text`."""
    row = own_block(req, block_id)
    if not convertible(row):
        raise HttpError(400, 'This file can\u2019t be made into a document.')
    body = req.json()
    ext = (row['ext'] or '').lower()
    path = os.path.join(db.user_files_dir(req.user['id']), row['file_key'])
    blocks, pictures, html_text = [], {}, None
    if row['kind'] == 'pdf':
        text = text_field(body, 'text', 200_000, 'Text', strip=False)
        if not text or not text.strip() or not isinstance(body.get('html'), str):
            raise HttpError(400, 'There were no words in this PDF to make a document from.')
        html_text = body['html']
    elif ext in convert.PLAIN:
        text = convert.read_plain(path)
    else:
        try:
            blocks, pictures = convert.read_blocks(path, ext)
        except convert.Unreadable as err:
            raise HttpError(400, str(err))
        text = convert.to_markdown(blocks)
    if not text.strip():
        raise HttpError(400, 'There were no words in this file to make a document from.')
    if len(text) > 200_000:
        raise HttpError(400, 'This file is too long to be one document.')

    drawer_id = body.get('drawer')
    if drawer_id:
        drawer_id = target_drawer(req, drawer_id)
    else:
        first = req.db.execute('SELECT drawer_id FROM connections WHERE block_id = ? ORDER BY connected_at LIMIT 1',
                               (block_id,)).fetchone()
        drawer_id = first['drawer_id'] if first else None
    title = (row['title'] or convert.first_heading(blocks) or 'Untitled')[:200]
    new = insert_block(req, kind='text', title=title, content=text.strip('\n'),
                       meta={'madeFrom': {'id': block_id, 'ext': ext or row['kind']}})
    position = None
    if drawer_id:
        position = place_in(req.db, drawer_id, after=block_id)
        connect(req.db, new, drawer_id, position)
        position = req.db.execute('SELECT position FROM connections WHERE block_id = ? AND drawer_id = ?',
                                  (new, drawer_id)).fetchone()['position']

    if blocks:
        saved = {}

        def picture_src(name):
            if name not in saved:
                found = pictures.get(name)
                if not found or len(saved) >= convert.MAX_PICTURES:
                    return None
                image_id = new_id()
                req.db.execute('INSERT INTO doc_images (id, block_id, mime, data, created_at) VALUES (?, ?, ?, ?, ?)',
                               (image_id, new, found[0], found[1], now()))
                saved[name] = f'/api/docs/{new}/img/{image_id}'
            return saved[name]
        html_text = convert.to_html(blocks, picture_src)
    if html_text is not None:
        try:
            clean = documents.clean_html(html_text)
        except ValueError:
            raise HttpError(400, 'That document is too large to save.')
        stamp = now()
        req.db.execute('INSERT INTO docs (block_id, html, settings, synced_at, updated_at) VALUES (?, ?, ?, ?, ?)',
                       (new, clean, json.dumps(documents.DEFAULTS), stamp, stamp))
    return json_response({'block': reload_block(req, new), 'drawer': drawer_id, 'position': position}, status=201)


# ---------------------------------------------------------------- the photo editor

# A picture is edited in the browser (photoedit.js) and the result replaces the
# file, while the original is kept beside it (meta.original) so the owner can
# always go back. The editor reopens the original with its settings (meta.edit),
# so nothing is lost by editing again. Formats the browser can't write (HEIC,
# TIFF, BMP…) come back as JPEG.
EDITABLE = {'jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'avif', 'tif', 'tiff', 'bmp'}
EDIT_KEYS = {'v', 'crop', 'turn', 'flipX', 'flipY', 'straighten', 'light', 'colour', 'detail', 'marks', 'size'}
MAX_EDIT_JSON = 512 * 1024
ORIGINAL_FIELDS = ('file_key', 'file_name', 'mime', 'ext', 'size', 'width', 'height', 'thumb_key')


def editable_picture(req, block_id):
    row = own_block(req, block_id)
    if row['kind'] != 'image' or ((row['ext'] or '').lower() not in EDITABLE and not row_original(row)):
        raise HttpError(400, 'Only photos and pictures can be edited.')
    return row


def row_original(row):
    original = json.loads(row['meta'] or '{}').get('original')
    return original if isinstance(original, dict) and original.get('file_key') else None


def clean_edit(value):
    if not isinstance(value, dict):
        raise HttpError(400, 'Those edits could not be read.')
    value = {k: v for k, v in value.items() if k in EDIT_KEYS}
    if len(json.dumps(value)) > MAX_EDIT_JSON:
        raise HttpError(413, 'There is too much drawn on this picture to save.')
    return value


@route('POST', r'/api/blocks/(?P<block_id>[\w-]+)/picture')
def save_edited_picture(req, block_id):
    """The edited picture takes the file's place; the first original is kept."""
    row = editable_picture(req, block_id)
    data = req.read_bytes(MAX_UPLOAD)
    ext, mime = kinds.thumb_type(data)
    if ext not in ('jpg', 'png', 'webp'):
        raise HttpError(400, 'An edited picture must be a JPEG, PNG or WebP.')
    width, height = int_arg(req.arg('w'), 1, 100000), int_arg(req.arg('h'), 1, 100000)
    meta = json.loads(row['meta'] or '{}')
    original = row_original(row)
    folder = db.user_files_dir(req.user['id'])
    key = secrets.token_hex(12) + f'.{ext}'
    with open(os.path.join(folder, key), 'wb') as f:
        f.write(data)
    if original:
        # Editing again: the last edit (and its preview) give way; the original stays.
        stale = [row['file_key'] if row['file_key'] != original['file_key'] else None,
                 row['thumb_key'] if row['thumb_key'] != original.get('thumb_key') else None]
    else:
        meta['original'] = {k: row[k] for k in ORIGINAL_FIELDS}
        stale = []
    meta.pop('look', None)  # its colours are measured again
    meta.pop('edit', None)  # its settings follow (PUT .../edit)
    base = os.path.splitext(meta['original']['file_name'] or 'Picture')[0]
    req.db.execute('UPDATE blocks SET file_key = ?, file_name = ?, mime = ?, ext = ?, size = ?, width = ?, height = ?, '
                   'thumb_key = NULL, meta = ?, updated_at = ? WHERE id = ?',
                   (key, f'{base}.{ext}', mime, ext, len(data), int(width) if width else row['width'],
                    int(height) if height else row['height'], json.dumps(meta, ensure_ascii=False), now(), block_id))
    remove_block_files(req.user['id'], *stale)
    return json_response({'block': reload_block(req, block_id)})


@route('POST', r'/api/blocks/(?P<block_id>[\w-]+)/original')
def restore_original(req, block_id):
    """Back to the picture as it was uploaded: the edit and its preview are erased."""
    row = own_block(req, block_id)
    original = row_original(row)
    if not original:
        raise HttpError(400, 'This picture hasn’t been edited.')
    meta = json.loads(row['meta'] or '{}')
    meta.pop('original', None)
    meta.pop('edit', None)
    meta.pop('look', None)
    stale = [row['file_key'] if row['file_key'] != original['file_key'] else None,
             row['thumb_key'] if row['thumb_key'] != original.get('thumb_key') else None]
    req.db.execute('UPDATE blocks SET file_key = ?, file_name = ?, mime = ?, ext = ?, size = ?, width = ?, height = ?, '
                   'thumb_key = ?, meta = ?, updated_at = ? WHERE id = ?',
                   (*(original.get(k) for k in ORIGINAL_FIELDS), json.dumps(meta, ensure_ascii=False), now(), block_id))
    remove_block_files(req.user['id'], *stale)
    return json_response({'block': reload_block(req, block_id)})


@route('PUT', r'/api/blocks/(?P<block_id>[\w-]+)/edit')
def save_edit_settings(req, block_id):
    """How the picture was edited, so the editor opens the original with them."""
    row = own_block(req, block_id)
    if not row_original(row):
        raise HttpError(400, 'This picture hasn’t been edited.')
    meta = json.loads(row['meta'] or '{}')
    meta['edit'] = clean_edit(req.json().get('edit'))
    req.db.execute('UPDATE blocks SET meta = ? WHERE id = ?', (json.dumps(meta, ensure_ascii=False), block_id))
    return json_response({'ok': True})


@route('GET', r'/api/blocks/(?P<block_id>[\w-]+)/original')
def serve_original(req, block_id):
    """The picture as it was before it was edited, for the editor (its owner only)."""
    row = own_block(req, block_id)
    original = row_original(row)
    if not original:
        raise HttpError(404, 'This picture hasn’t been edited.')
    path = os.path.join(db.user_files_dir(row['user_id']), original['file_key'])
    content_type, _, _ = kinds.serving(row['kind'], original.get('mime') or '', original.get('ext') or '')
    return file_response(req, path, content_type, filename=original.get('file_name'),
                         headers=[('Content-Security-Policy', FILE_CSP)])


@route('GET', r'/api/convert/(?P<name>core\.js|core\.wasm)')
def convert_core(req, name):
    """The sound and video converter's engine (transcode.py), served by Mutt itself."""
    if not transcode.enabled():
        raise HttpError(404, 'Converting sound and video is switched off here.')
    if not transcode.ready():
        transcode.fetch()
        raise HttpError(503, 'The converter is still being fetched.')
    return file_response(req, transcode.path_of(name), transcode.content_type(name),
                         cache='public, max-age=31536000, immutable')


@route('POST', r'/api/blocks/(?P<block_id>[\w-]+)/share')
def share_block(req, block_id):
    own_block(req, block_id)
    shared = bool(req.json().get('shared'))
    req.db.execute('UPDATE blocks SET shared_at = ? WHERE id = ?', (now() if shared else None, block_id))
    return json_response({'block': reload_block(req, block_id)})


# What a file's owner keeps to themselves and a copy never carries: where and
# when a photo was taken and with what (the copy's owner would see it as
# their own), how a picture was edited and where its original is kept.
PRIVATE_MEDIA = ('gps', 'location', 'taken', 'camera')


def copy_block(conn, row, to_user_id, from_name, extra=None):
    """A copy of someone's file for `to_user_id`, as saving makes one: it
    remembers whom it came from (`savedFrom`) and who first made it (`madeBy`,
    carried through copies of copies). `extra` goes into its meta too
    (`beamedBy` for a beamed file). The stored bytes are shared, not copied."""
    source = json.loads(row['meta'] or '{}')
    meta = {k: v for k, v in source.items() if k not in ('original', 'edit', 'unplaced', 'beamedBy')}
    if isinstance(meta.get('media'), dict):
        meta['media'] = {k: v for k, v in meta['media'].items() if k not in PRIVATE_MEDIA}
    meta['savedFrom'] = {'id': row['id'], 'username': from_name}
    # Who first made it travels with every copy, however many times it's saved on.
    made = source.get('madeBy') if isinstance(source.get('madeBy'), dict) else None
    if not made:
        first = first_of(saved_copies_of(conn), row['id'])
        maker = conn.execute('SELECT b.id, u.username FROM blocks b JOIN users u ON u.id = b.user_id '
                             'WHERE b.id = ?', (first,)).fetchone()
        made = ({'id': maker['id'], 'username': maker['username']} if maker
                else {'id': first, 'username': (source.get('savedFrom') or {}).get('username') or from_name})
    meta['madeBy'] = {'id': made.get('id'), 'username': made.get('username')}
    meta.update(extra or {})
    block_id = new_id()
    stamp = now()
    fields = dict(kind=row['kind'], title=row['title'], description=row['description'], content=row['content'],
                  file_key=link_file(row['user_id'], to_user_id, row['file_key']), file_name=row['file_name'],
                  mime=row['mime'], ext=row['ext'], size=row['size'],
                  thumb_key=link_file(row['user_id'], to_user_id, row['thumb_key']),
                  width=row['width'], height=row['height'], duration=row['duration'],
                  meta=json.dumps(meta, ensure_ascii=False))
    columns = ['id', 'user_id', 'created_at', 'updated_at', *fields]
    conn.execute(f'INSERT INTO blocks ({", ".join(columns)}) VALUES ({", ".join("?" * len(columns))})',
                 [block_id, to_user_id, stamp, stamp, *fields.values()])
    copy_form(conn, row, block_id, to_user_id, from_name, meta, stamp)
    return block_id


def copy_form(conn, row, block_id, to_user_id, from_name, meta, stamp):
    """A copy keeps the form it had: a document its pages (the editor's HTML,
    its pictures under the copy's own address) while they are the note's
    latest words, a recipe card its dish photo (copied too, `dishOf`)."""
    doc = conn.execute('SELECT * FROM docs WHERE block_id = ?', (row['id'],)).fetchone()
    if doc and doc['synced_at'] >= row['updated_at'] - 0.001:
        html = doc['html']
        for img in conn.execute('SELECT * FROM doc_images WHERE block_id = ?', (row['id'],)).fetchall():
            new_img = new_id()
            conn.execute('INSERT INTO doc_images (id, block_id, mime, data, created_at, unplaced) VALUES (?, ?, ?, ?, ?, ?)',
                         (new_img, block_id, img['mime'], img['data'], stamp, img['unplaced']))
            html = html.replace(f'/api/docs/{row["id"]}/img/{img["id"]}', f'/api/docs/{block_id}/img/{new_img}')
        conn.execute('INSERT INTO docs (block_id, html, settings, synced_at, updated_at) VALUES (?, ?, ?, ?, ?)',
                     (block_id, html, doc['settings'], stamp, stamp))
    rec = meta.get('recipe') if isinstance(meta.get('recipe'), dict) else None
    if rec and rec.get('photo'):
        photo = conn.execute('SELECT * FROM blocks WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
                             (rec['photo'], row['user_id'])).fetchone()
        dish = copy_block(conn, photo, to_user_id, from_name, {'dishOf': block_id}) if photo and photo['id'] != row['id'] else None
        conn.execute('UPDATE blocks SET meta = ? WHERE id = ?',
                     (json.dumps({**meta, 'recipe': {**rec, 'photo': dish}}, ensure_ascii=False), block_id))


@route('POST', r'/api/blocks/(?P<block_id>[\w-]+)/save')
def save_block(req, block_id):
    row, mine = readable_block(req, block_id, beamed=False)
    if mine:
        raise HttpError(400, 'That one is already yours.')
    drawer_id = target_drawer(req, req.json().get('drawer'))
    existing = req.db.execute(
        "SELECT id FROM blocks WHERE user_id = ? AND deleted_at IS NULL AND json_extract(meta, '$.savedFrom.id') = ?",
        (req.user['id'], block_id)).fetchone()
    if existing:
        copy_id = existing['id']
    else:
        copy_id = copy_block(req.db, row, req.user['id'], row['owner_name'])
        draw_near(req, row['user_id'], NEAR_SAVE)
    if drawer_id:
        connect(req.db, copy_id, drawer_id)
    return json_response({'block': reload_block(req, copy_id), 'already': bool(existing)}, status=201)


@route('POST', r'/api/blocks/(?P<block_id>[\w-]+)/autosort')
def sort_block(req, block_id):
    """A loose star dropped back into the void finds itself a planet. Uploads
    that waited for the browser to read the picture are sorted this way too."""
    row = own_block(req, block_id)
    meta = json.loads(row['meta'] or '{}')
    if meta.pop('sortWhenSeen', None):  # sent from the Share menu, waiting for its picture to be read
        req.db.execute('UPDATE blocks SET meta = ? WHERE id = ?', (json.dumps(meta, ensure_ascii=False), block_id))
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
    block['ownerName'] = None if mine else req.db.execute(
        'SELECT display_name FROM users WHERE id = ?', (row['user_id'],)).fetchone()[0]
    block['story'] = file_story(req, row)
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
        keep_before(req, row, updates['content'])
        follow_words(req.db, block_id, updates['content'])
    for key, high in (('width', 100000), ('height', 100000), ('duration', 10 ** 7)):
        if key in body:
            value = int_arg(body[key], 0, high)
            if value is not None:
                updates[key] = value
    if 'look' in body or 'see' in body or (row['kind'] == 'audio' and ('voice' in body or 'heard' in body)):
        meta = json.loads(row['meta'] or '{}')
        if 'look' in body:
            meta['look'] = clean_look(body['look'])
        if 'see' in body:
            meta['see'] = clean_see(body['see'])
        # A voice note made by holding the void: its sound's shape, and the words read from it on the device.
        if row['kind'] == 'audio' and 'voice' in body:
            voice = hear.clean_voice(body['voice'])
            if voice:
                meta['voice'] = voice
        if row['kind'] == 'audio' and 'heard' in body:
            heard = hear.clean_heard(body['heard'])
            if heard is None:
                meta.pop('heard', None)
            else:
                meta['heard'] = heard
        req.db.execute('UPDATE blocks SET meta = ? WHERE id = ?', (json.dumps(meta, ensure_ascii=False), block_id))
    if updates:
        updates['updated_at'] = now()
        assignments = ', '.join(f'{k} = ?' for k in updates)
        req.db.execute(f'UPDATE blocks SET {assignments} WHERE id = ?', (*updates.values(), block_id))
    return json_response({'block': reload_block(req, block_id)})


@route('DELETE', r'/api/blocks/(?P<block_id>[\w-]+)')
def delete_block(req, block_id):
    """Delete a file. It waits in Recently deleted for a week (`?forever=1`,
    or one already there, goes for good now)."""
    row = own_block(req, block_id, deleted=True)
    if row['deleted_at'] or req.arg('forever') == '1':
        erase_block(req.db, row)
        return json_response({'ok': True, 'positions': {}})
    with db.transaction(req.db):
        positions = set_aside(req.db, block_id)
    return json_response({'ok': True, 'positions': positions})


# ---------------------------------------------------------------- recently deleted

KEEP_DELETED = 7 * 24 * 3600   # a week


def set_aside(conn, block_id):
    """Take a file off every planet and into Recently deleted, remembering
    where it sat so it can go back. Returns {planet: position}."""
    spots = [dict(r) for r in conn.execute(
        'SELECT drawer_id, position, checked FROM connections WHERE block_id = ?', (block_id,))]
    conn.execute('DELETE FROM connections WHERE block_id = ?', (block_id,))
    for s in spots:
        conn.execute('UPDATE drawers SET updated_at = ? WHERE id = ?', (now(), s['drawer_id']))
    conn.execute('UPDATE blocks SET deleted_at = ?, deleted_from = ? WHERE id = ?', (now(), json.dumps(
        [{'drawer': s['drawer_id'], 'position': s['position'], 'checked': s['checked']} for s in spots]), block_id))
    return {s['drawer_id']: s['position'] for s in spots}


def erase_block(conn, row):
    """Gone for good: the row (and everything hung on it) and its files on disk."""
    conn.execute('DELETE FROM blocks WHERE id = ?', (row['id'],))
    original = row_original(row) if 'meta' in row.keys() else None
    remove_block_files(row['user_id'], row['file_key'], row['thumb_key'],
                       *((original['file_key'], original.get('thumb_key')) if original else ()))


def purge_deleted(conn, user_id=None):
    """Erase what has waited in Recently deleted for more than a week."""
    where, params = 'deleted_at IS NOT NULL AND deleted_at < ?', [now() - KEEP_DELETED]
    if user_id is not None:
        where += ' AND user_id = ?'
        params.append(user_id)
    rows = conn.execute(f'SELECT id, user_id, file_key, thumb_key, meta FROM blocks WHERE {where}', params).fetchall()
    for r in rows:
        erase_block(conn, r)
    return len(rows)


def deleted_json(row):
    out = block_json(row)
    out['deletedAt'] = ms(row['deleted_at'])
    out['goneAt'] = ms(row['deleted_at'] + KEEP_DELETED)
    return out


def start_purging():
    """Once an hour, erase what has waited in Recently deleted for a week, for everyone."""
    def loop():
        while True:
            try:
                conn = db.connect()
                try:
                    purge_deleted(conn)
                finally:
                    conn.close()
            except Exception:
                traceback.print_exc()
            time.sleep(3600)
    threading.Thread(target=loop, name='purge-deleted', daemon=True).start()


@route('GET', r'/api/deleted')
def list_deleted(req):
    """Your recently deleted files, newest first."""
    purge_deleted(req.db, req.user['id'])
    rows = req.db.execute(
        f'SELECT {BLOCK_COLUMNS} FROM blocks b WHERE b.user_id = ? AND b.deleted_at IS NOT NULL '
        'ORDER BY b.deleted_at DESC LIMIT 500', (req.user['id'],)).fetchall()
    return json_response({'blocks': [deleted_json(r) for r in rows], 'keepDays': KEEP_DELETED // 86400})


@route('POST', r'/api/blocks/(?P<block_id>[\w-]+)/restore')
def restore_block(req, block_id):
    """Put a deleted file back where it was: on every planet it sat on that
    still exists and still takes it, or as a star if none does."""
    row = own_block(req, block_id, deleted=True)
    if not row['deleted_at']:
        return json_response({'block': block_json(row), 'connections': block_connections(req, block_id),
                              'drawers': [], 'positions': {}})
    back, spots = [], {}
    with db.transaction(req.db):
        for spot in json.loads(row['deleted_from'] or '[]'):
            drawer = req.db.execute('SELECT * FROM drawers WHERE id = ?', (str(spot.get('drawer')),)).fetchone()
            if not drawer or not (keeps(req.db, drawer, req.user['id']) or (drawer['community'] and drawer['visibility'] == 'public')):
                continue
            req.db.execute('INSERT OR IGNORE INTO connections (block_id, drawer_id, position, connected_at, checked) '
                           'VALUES (?, ?, ?, ?, ?)', (block_id, drawer['id'], spot.get('position'), now(), spot.get('checked')))
            req.db.execute('UPDATE drawers SET updated_at = ? WHERE id = ?', (now(), drawer['id']))
            back.append(drawer['id'])
            spots[drawer['id']] = spot.get('position')
        req.db.execute('UPDATE blocks SET deleted_at = NULL, deleted_from = NULL WHERE id = ?', (block_id,))
    return json_response({'block': reload_block(req, block_id), 'connections': block_connections(req, block_id),
                          'drawers': back, 'positions': spots})


@route('DELETE', r'/api/deleted')
def empty_deleted(req):
    """Erase everything in Recently deleted now."""
    rows = req.db.execute('SELECT id, user_id, file_key, thumb_key, meta FROM blocks WHERE user_id = ? AND deleted_at IS NOT NULL',
                          (req.user['id'],)).fetchall()
    for r in rows:
        erase_block(req.db, r)
    return json_response({'ok': True, 'erased': len(rows)})


@route('POST', r'/api/blocks/(?P<block_id>[\w-]+)/connections')
def add_connection(req, block_id):
    own_block(req, block_id)
    body = req.json()
    drawer_id = writable_drawer(req, str(body.get('drawer') or ''))['id']
    position = body.get('position')
    position = float(position) if isinstance(position, (int, float)) else None
    connect(req.db, block_id, drawer_id, position)
    return json_response({'block': reload_block(req, block_id), 'connections': block_connections(req, block_id)})


def learn_from_move(req, block_id, wrong_id):
    """Autosort put this file on the wrong planet and its owner took it off:
    the planet they just put it on by hand (if any) learns, and so does the wrong one."""
    right = req.db.execute(
        "SELECT c.drawer_id FROM connections c JOIN drawers d ON d.id = c.drawer_id WHERE c.block_id = ? "
        "AND c.placed = 'hand' AND d.user_id = ? AND d.parent_id IS NULL AND c.connected_at >= ? "
        'ORDER BY c.connected_at DESC LIMIT 1', (block_id, req.user['id'], now() - 900)).fetchone()
    try:
        sorting.learn(req.db, req.user['id'], block_id, wrong_id, right['drawer_id'] if right else None)
    except Exception:  # learning must never stop a move
        traceback.print_exc()


@route('DELETE', r'/api/blocks/(?P<block_id>[\w-]+)/connections/(?P<drawer_id>[\w-]+)')
def remove_connection(req, block_id, drawer_id):
    drawer = writable_drawer(req, drawer_id)
    block = req.db.execute('SELECT user_id FROM blocks WHERE id = ?', (block_id,)).fetchone()
    mine = block and block['user_id'] == req.user['id']
    # The keepers of a planet open to others may take anyone's file off it, but never each other's.
    keepers = {drawer['user_id'], keeper_of(req.db, drawer)}
    moderating = block and drawer['community'] and req.user['id'] in keepers and block['user_id'] not in keepers
    if not (mine or moderating):
        raise HttpError(404, 'That file does not exist.')
    found = req.db.execute('SELECT position, placed FROM connections WHERE block_id = ? AND drawer_id = ?',
                           (block_id, drawer_id)).fetchone()
    req.db.execute('DELETE FROM connections WHERE block_id = ? AND drawer_id = ?', (block_id, drawer_id))
    if mine and found and found['placed'] == 'auto' and keeps(req.db, drawer, req.user['id']):
        learn_from_move(req, block_id, drawer_id)
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
    """Files and planets by words and/or kind, extension, date, colour and traits: your own, or with
    `of=<username>` the files on that person's planets you may open. Each file says which of the
    galaxy's planets it is on (`on`, a moon counted as its planet), for the search on the galaxy."""
    q = (req.arg('q') or '').strip()[:100]
    uid = req.user['id']
    of = auth.normalize_username(req.arg('of'))
    owner = find_user(req, of) if of else None
    if owner and owner['id'] == uid:
        owner = None
    if owner:
        # Someone else's galaxy: only files on planets (and moons) you can open, found by what anyone
        # who opens them sees. A file's details (where a photo was taken, its camera) are never searched.
        open_ids = [r['id'] for r in req.db.execute('SELECT * FROM drawers WHERE user_id = ?', (owner['id'],))
                    if drawer_visible(req, r)]
        scope = "b.id IN (SELECT block_id FROM connections WHERE drawer_id IN (SELECT value FROM json_each(?)))"
        where, params = [scope, 'b.deleted_at IS NULL'], [json.dumps(open_ids)]
    else:
        scope = 'b.user_id = ?'
        where, params = [scope, 'b.deleted_at IS NULL'], [uid]
    pattern = None
    if q:
        pattern = '%' + q.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_') + '%'
        # A picture's reading is numbers, not words: it's matched by what it shows below.
        words = ("b.title LIKE ? ESCAPE '\\' OR b.description LIKE ? ESCAPE '\\' OR b.content LIKE ? ESCAPE '\\' "
                 "OR b.file_name LIKE ? ESCAPE '\\'")
        params += [pattern] * 4
        if not owner:
            words += " OR json_remove(b.meta, '$.look', '$.see') LIKE ? ESCAPE '\\'"
            params.append(pattern)
        else:  # a voice note's words are as open as its sound
            words += " OR json_extract(b.meta, '$.heard.text') LIKE ? ESCAPE '\\'"
            params.append(pattern)
        names = sight.asked(q)
        if names:  # "dogs", "a cat on the beach": pictures that show it count too
            seen = [r['id'] for r in req.db.execute(
                f"SELECT b.id, b.kind, json_extract(b.meta, '$.see') AS see FROM blocks b "
                f"WHERE {scope} AND b.deleted_at IS NULL AND json_extract(b.meta, '$.see.v') = ?",
                (params[0], sight.VERSION))
                if sight.shows(json.loads(r['see']), names, r['kind'])]
            if seen:
                words += " OR b.id IN (SELECT value FROM json_each(?))"
                params.append(json.dumps(seen))
        where.append(f'({words})')
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
    rows = req.db.execute(
        f"SELECT {BLOCK_COLUMNS}, u.username AS owner_name FROM blocks b JOIN users u ON u.id = b.user_id "
        f"WHERE {' AND '.join(where)} ORDER BY {order} LIMIT ? OFFSET ?",
        (*params, SEARCH_PAGE + 1, offset)).fetchall()
    blocks = [block_json(r, mine=r['user_id'] == uid, owner=None if r['user_id'] == uid else r['owner_name'])
              for r in rows[:SEARCH_PAGE]]
    planets_on(req, blocks)
    drawers = []
    if pattern and not offset:
        found = req.db.execute(
            "SELECT d.*, (SELECT COUNT(*) FROM connections c WHERE c.drawer_id = d.id) AS n FROM drawers d "
            "WHERE d.user_id = ? AND (d.title LIKE ? ESCAPE '\\' OR d.description LIKE ? ESCAPE '\\') "
            "ORDER BY d.updated_at DESC LIMIT 40", ((owner or req.user)['id'], pattern, pattern)).fetchall()
        drawers = [d for d in found if not owner or drawer_visible(req, d)]
    return json_response({
        'drawers': [drawer_json(d, d['n'], drawer_previews(req, d['id'])) for d in drawers],
        'blocks': mark_saved(req, blocks) if owner else blocks,
        'more': len(rows) > SEARCH_PAGE,
    })


def planets_on(req, blocks):
    """The planets each found file is on, as far as this person may open them: each file's `on`,
    a list of planet ids (a moon counted as its planet), empty for a star."""
    ids = [b['id'] for b in blocks]
    on = {}
    seen = {}
    for start in range(0, len(ids), 500):
        part = ids[start:start + 500]
        rows = req.db.execute(
            'SELECT c.block_id, d.* FROM connections c JOIN drawers d ON d.id = c.drawer_id '
            f"WHERE c.block_id IN ({','.join('?' * len(part))}) ORDER BY c.connected_at", part).fetchall()
        for r in rows:
            if r['id'] not in seen:
                seen[r['id']] = drawer_visible(req, r)
            top = r['parent_id'] or r['id']
            if seen[r['id']] and top not in on.setdefault(r['block_id'], []):
                on[r['block_id']].append(top)
    for b in blocks:
        b['on'] = on.get(b['id'], [])
    return blocks


@route('GET', r'/api/see/todo')
def see_todo(req):
    """Your files with a picture that the picture reader hasn't read yet."""
    rows = req.db.execute(
        f"SELECT {BLOCK_COLUMNS} FROM blocks b WHERE b.user_id = ? AND b.deleted_at IS NULL "
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


@route('GET', r'/api/hear/todo')
def hear_todo(req):
    """Your voice notes whose words haven't been read yet (the page closed first, say)."""
    if not hear.enabled():
        return json_response({'blocks': []})
    rows = req.db.execute(
        f"SELECT {BLOCK_COLUMNS} FROM blocks b WHERE b.user_id = ? AND b.deleted_at IS NULL AND b.kind = 'audio' "
        "AND json_type(b.meta, '$.voice') IS NOT NULL AND json_type(b.meta, '$.heard') IS NULL "
        "ORDER BY b.created_at DESC LIMIT 20", (req.user['id'],)).fetchall()
    return json_response({'blocks': [block_json(b) for b in rows]})


@route('GET', r'/api/hear/(?P<name>encoder|decoder|vocab)')
def hear_model(req, name):
    """The voice reader's model (hear.py), served by Mutt itself once it has fetched it."""
    if not hear.enabled():
        raise HttpError(404, 'Reading voice notes is turned off here.')
    if not hear.ready():
        hear.fetch()
        raise HttpError(503, 'The voice reader is still being fetched.')
    cache = 'public, max-age=31536000, immutable'
    if name == 'vocab':
        body = hear.vocab()
        return Response(200, [('Content-Type', 'application/json; charset=utf-8'), ('Content-Length', str(len(body))),
                              ('Cache-Control', cache)], body)
    return file_response(req, hear.path_of(name), 'application/octet-stream', cache=cache)


@route('GET', r'/api/looks/todo')
def looks_todo(req):
    """Your files with a picture whose colours haven't been measured (the current way) yet."""
    rows = req.db.execute(
        f"SELECT {BLOCK_COLUMNS} FROM blocks b WHERE b.user_id = ? AND b.deleted_at IS NULL "
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


@route('GET', r'/api/drawers/(?P<drawer_id>[\w-]+)/quotes')
def drawer_quotes(req, drawer_id):
    """The quotes on a planet, for its commonplace book: each one's words,
    who said them and where from (mutt/quotes.py), read from the notes as
    they are now."""
    drawer = visible_drawer(req, drawer_id)
    rows = req.db.execute('SELECT b.* FROM connections c JOIN blocks b ON b.id = c.block_id WHERE c.drawer_id = ? '
                          'AND b.deleted_at IS NULL ORDER BY c.position, c.connected_at DESC', (drawer_id,)).fetchall()
    return json_response({'quotes': quotes.wall(rows, sorting.form, drawer['title'] or '')})


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


@route('GET', r'/f/(?P<block_id>[\w-]+)(?:/[^/]*){0,2}')
def serve_file(req, block_id):
    row, _ = readable_block(req, block_id, deleted=True)
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
    row, _ = readable_block(req, block_id, deleted=True)
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


def add_version(req, block_id, title, html_text, text, name='', at=None):
    words = documents.word_count(text)
    req.db.execute('INSERT INTO doc_versions (id, block_id, title, html, text, name, words, created_at) '
                   'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                   (new_id(), block_id, title or '', html_text, text, name, words, now() if at is None else at))
    old = req.db.execute("SELECT id FROM doc_versions WHERE block_id = ? AND name = '' ORDER BY created_at DESC "
                         'LIMIT -1 OFFSET ?', (block_id, DOC_VERSIONS_KEPT)).fetchall()
    for r in old:
        req.db.execute('DELETE FROM doc_versions WHERE id = ?', (r['id'],))


def keep_before(req, row, new_text, name=''):
    """A note's words are about to change: keep them as they were, in the same
    history a document keeps, dated when they were written. Changes close
    together count as one: the old words are kept only if they stood for ten
    minutes, or nothing has been kept yet (a `name` keeps them regardless)."""
    old = row['content'] or ''
    if row['kind'] != 'text' or old == new_text:
        return
    last = req.db.execute('SELECT text FROM doc_versions WHERE block_id = ? ORDER BY created_at DESC LIMIT 1',
                          (row['id'],)).fetchone()
    if last and last['text'] == old:
        return
    if last and not name and now() - row['updated_at'] < DOC_VERSION_EVERY:
        return
    doc = req.db.execute('SELECT html, synced_at FROM docs WHERE block_id = ?', (row['id'],)).fetchone()
    html_text = doc['html'] if doc and doc['html'] and doc['synced_at'] >= row['updated_at'] - 0.001 else None
    add_version(req, row['id'], row['title'], html_text, old, name=name, at=row['updated_at'])


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


@route('POST', r'/api/docs/(?P<block_id>[\w-]+)/versions/(?P<version_id>[\w-]+)/restore')
def restore_version(req, block_id, version_id):
    """Put an earlier copy of a note (or document) back. How it is now is kept
    first, as "Before restoring", so this can be undone the same way."""
    row = own_block(req, block_id)
    if row['kind'] != 'text':
        raise HttpError(400, 'Only text files have a history.')
    v = req.db.execute('SELECT * FROM doc_versions WHERE id = ? AND block_id = ?', (version_id, block_id)).fetchone()
    if not v:
        raise HttpError(404, 'That version is gone.')
    text = (v['text'] or '').strip('\n')
    if not text.strip():
        raise HttpError(400, 'That version has no words to put back.')
    keep_before(req, row, text, name='Before restoring')
    stamp = now()
    req.db.execute('UPDATE blocks SET content = ?, updated_at = ? WHERE id = ?', (text, stamp, block_id))
    if v['html']:
        req.db.execute('UPDATE docs SET html = ?, synced_at = ?, updated_at = ? WHERE block_id = ?',
                       (v['html'], stamp, stamp, block_id))
    return json_response({'block': reload_block(req, block_id)})


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
    data = bytearray(data)
    privacy.forget_place_bytes(data)  # where a photo was taken never goes into a document
    req.db.execute('INSERT INTO doc_images (id, block_id, mime, data, created_at, unplaced) VALUES (?, ?, ?, ?, ?, 1)',
                   (image_id, block_id, mime, bytes(data), now()))
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
        out.append({'id': r['id'], 'words': documents.word_count(r['content']), 'poem': layout == 'poem', 'kind': layout,
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


# ---------------------------------------------------------------- comments on files

COMMENT_LIMIT = 2000


def file_comments(req, block_id, owner_id):
    rows = req.db.execute('SELECT c.*, u.username, u.display_name FROM file_comments c JOIN users u ON u.id = c.user_id '
                          'WHERE c.block_id = ? ORDER BY c.created_at', (block_id,)).fetchall()
    me = req.user['id']
    return [{'id': r['id'], 'body': r['body'], 'by': r['username'], 'byName': r['display_name'], 'createdAt': ms(r['created_at']),
             'mine': r['user_id'] == me, 'byOwner': r['user_id'] == owner_id,
             'canRemove': me in (r['user_id'], owner_id)} for r in rows]


def comments_seen(req, block_id):
    req.db.execute('UPDATE file_comments SET seen = 1 WHERE block_id = ? AND seen = 0', (block_id,))


@route('GET', r'/api/blocks/(?P<block_id>[\w-]+)/comments')
def get_file_comments(req, block_id):
    """What people have said about a file, oldest first. Anyone who can see the file can read them.
    Its owner reading them has seen them."""
    row, mine = readable_block(req, block_id, beamed=False)
    if mine:
        comments_seen(req, block_id)
    return json_response({'comments': file_comments(req, block_id, row['user_id'])})


@route('GET', r'/api/comments/new')
def new_comments(req):
    """Comments other people left on your files that you haven't seen yet, one
    entry per file, newest first: told about on your galaxy, under the clock.
    With ?past=1, the last three files people commented on, seen or not
    (pressing the clock brings them back)."""
    past = req.arg('past') == '1'
    unseen = '' if past else 'AND c.seen = 0 '
    rows = req.db.execute(
        'SELECT c.block_id, COUNT(*) AS n, MAX(c.created_at) AS latest FROM file_comments c '
        'JOIN blocks b ON b.id = c.block_id '
        f'WHERE b.user_id = ? AND b.deleted_at IS NULL {unseen}AND c.user_id != b.user_id '
        'GROUP BY c.block_id ORDER BY latest DESC LIMIT ?', (req.user['id'], 3 if past else 12)).fetchall()
    files = []
    for r in rows:
        block = req.db.execute(f'SELECT {BLOCK_COLUMNS} FROM blocks b WHERE b.id = ?', (r['block_id'],)).fetchone()
        last = req.db.execute(
            'SELECT c.body, c.created_at, u.username, u.display_name FROM file_comments c JOIN users u ON u.id = c.user_id '
            f'JOIN blocks b ON b.id = c.block_id WHERE c.block_id = ? {unseen}AND c.user_id != b.user_id '
            'ORDER BY c.created_at DESC', (r['block_id'],)).fetchall()
        people = list(dict.fromkeys(x['username'] for x in last))
        # The planet to open it on: the first it was put on (a star opens on the galaxy).
        planet = req.db.execute(
            'SELECT d.id, d.title FROM connections c JOIN drawers d ON d.id = c.drawer_id '
            'WHERE c.block_id = ? ORDER BY d.parent_id IS NOT NULL, c.connected_at LIMIT 1', (r['block_id'],)).fetchone()
        files.append({
            'block': block_json(block),
            'count': r['n'],
            'people': people,
            'names': {x['username']: x['display_name'] for x in last if x['display_name']},   # the names they gave
            'latest': {'by': last[0]['username'], 'body': last[0]['body'][:140], 'createdAt': ms(last[0]['created_at'])},
            'planet': {'id': planet['id'], 'title': planet['title']} if planet else None,
        })
    if past:
        return json_response({'files': files})
    # Files beamed to you that you haven't been told of yet, one note per sender (a sender
    # you never crossed paths with waits quietly: no note).
    beams = {}
    for r in req.db.execute(
            f'SELECT {BLOCK_COLUMNS}, bm.id AS beam_id, bm.words, bm.sent_at, u.username AS from_name, '
            'u.display_name AS from_display FROM beams bm JOIN blocks b ON b.id = bm.block_id JOIN users u ON u.id = bm.from_id '
            'WHERE bm.to_id = ? AND bm.answer IS NULL AND bm.noted = 0 AND bm.quiet = 0 AND b.deleted_at IS NULL '
            'ORDER BY bm.sent_at DESC', (req.user['id'],)).fetchall():
        note = beams.get(r['from_name'])
        if note:
            note['count'] += 1
            note['ids'].append(r['beam_id'])
            continue
        block = block_json(r, mine=False, owner=r['from_name'])
        beams[r['from_name']] = {'beam': r['beam_id'], 'ids': [r['beam_id']], 'count': 1, 'block': block,
                                 'from': {'username': r['from_name'], 'name': r['from_display']},
                                 'words': r['words'][:140], 'sentAt': ms(r['sent_at'])}
    return json_response({'files': files, 'beams': list(beams.values())[:6]})


@route('POST', r'/api/comments/seen')
def mark_comments_seen(req):
    """The owner has seen what was said on one of their files (or waved the note away)."""
    block_id = str(req.json().get('block') or '')
    own_block(req, block_id)
    comments_seen(req, block_id)
    return json_response({'ok': True})


@route('POST', r'/api/blocks/(?P<block_id>[\w-]+)/comments')
def add_file_comment(req, block_id):
    """Anyone who can see a file can leave a comment on it (its owner too, to answer)."""
    row, _ = readable_block(req, block_id, beamed=False)
    text = text_field(req.json(), 'body', COMMENT_LIMIT, 'Comment')
    if not text:
        raise HttpError(400, 'Write a comment first.')
    mine = row['user_id'] == req.user['id']
    if mine:
        comments_seen(req, block_id)  # answering them means they were read
    req.db.execute('INSERT INTO file_comments (id, block_id, user_id, body, created_at, seen) VALUES (?, ?, ?, ?, ?, ?)',
                   (new_id(), block_id, req.user['id'], text, now(), 1 if mine else 0))
    return json_response({'comments': file_comments(req, block_id, row['user_id'])}, status=201)


@route('DELETE', r'/api/blocks/(?P<block_id>[\w-]+)/comments/(?P<comment_id>[\w-]+)')
def delete_file_comment(req, block_id, comment_id):
    """The file's owner can remove any comment on it; whoever wrote one can take theirs back."""
    row, _ = readable_block(req, block_id)
    c = req.db.execute('SELECT user_id FROM file_comments WHERE id = ? AND block_id = ?', (comment_id, block_id)).fetchone()
    if not c:
        raise HttpError(404, 'That comment is gone.')
    if req.user['id'] not in (c['user_id'], row['user_id']):
        raise HttpError(403, 'Only the file’s owner or who wrote it can remove a comment.')
    req.db.execute('DELETE FROM file_comments WHERE id = ?', (comment_id,))
    return json_response({'comments': file_comments(req, block_id, row['user_id'])})
