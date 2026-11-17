"""Live: every open page hears what changed elsewhere, as it happens.

Each open page (a "tab") keeps one stream open, `GET /api/live?tab=<id>`
(Server-Sent Events), and says what it is looking at with
`POST /api/live/watch` {tab, planet | galaxy}. After any change that went
through, `after()` (called by `app.dispatch`) works out what it touched and
sends short notices. A notice carries only what to look at again, never
anything of a file or a planet: the page asks the server as usual, with its
own rights, so nothing reaches anyone who couldn't already see it.

    {t: 'planet', id, whole}   a planet's files changed (whole: the planet itself)
    {t: 'galaxy', user}        a galaxy's planets or stars changed
    {t: 'universe'}            someone's galaxy changed (the universe is redrawn if open)
    {t: 'beams' | 'comments' | 'keep' | 'comets'}   for one person: something waits for them

The page that made a change is never told of it (it sent `X-Mutt-Tab`).
One process holds everything in memory: a restart drops every stream and
each page reconnects, says again what it watches and looks again.
"""
import json
import queue
import re
import threading
import time
import traceback

PING = 20          # seconds between keep-alive comments, so proxies keep the stream open
FORGET = 15 * 60   # a tab with no stream for this long is forgotten
PER_USER = 12      # streams one person may hold open at once (the oldest gives way)
MOST = 400         # streams in all
TAB_RE = re.compile(r'^[\w-]{8,64}$')

_lock = threading.Lock()
_tabs = {}         # tab id -> Tab


class Tab:
    __slots__ = ('id', 'user_id', 'planet', 'galaxy', 'queue', 'opened', 'seen')

    def __init__(self, tab_id, user_id):
        self.id = tab_id
        self.user_id = user_id
        self.planet = None   # the planet (or moon) it shows
        self.galaxy = None   # whose galaxy it shows (a user id); a galaxy page also hears the universe
        self.queue = None    # set while its stream is open
        self.opened = 0
        self.seen = time.time()


def _tab(tab_id, user_id):
    """This person's tab, made if new. Someone else's id is never handed over."""
    t = _tabs.get(tab_id)
    if t and t.user_id != user_id:
        return None
    if not t:
        t = _tabs[tab_id] = Tab(tab_id, user_id)
    t.seen = time.time()
    return t


def _tidy():
    cut = time.time() - FORGET
    for k in [k for k, t in _tabs.items() if t.queue is None and t.seen < cut]:
        del _tabs[k]


def _send(t, msg):
    if t.queue is not None:
        try:
            t.queue.put_nowait(msg)
        except queue.Full:
            pass


# ---------------------------------------------------------------- the stream

def stream(user_id, tab_id):
    """The body of `GET /api/live`: a generator the server writes out as it goes."""
    q = queue.Queue(maxsize=200)
    with _lock:
        _tidy()
        t = _tab(tab_id, user_id)
        if not t:
            return None
        old = t.queue
        t.queue, t.opened = q, time.time()
        if old is not None:
            old.put_nowait(None)   # the same tab, reconnected: the old stream ends
        mine = sorted((x for x in _tabs.values() if x.user_id == user_id and x.queue is not None), key=lambda x: x.opened)
        for x in mine[:-PER_USER]:
            x.queue.put_nowait(None)
            x.queue = None
        open_now = sorted((x for x in _tabs.values() if x.queue is not None), key=lambda x: x.opened)
        for x in open_now[:-MOST]:
            x.queue.put_nowait(None)
            x.queue = None

    def body():
        try:
            yield b'retry: 3000\n\n'
            while True:
                try:
                    msg = q.get(timeout=PING)
                except queue.Empty:
                    yield b': ping\n\n'
                    continue
                if msg is None:
                    return
                yield b'data: ' + json.dumps(msg, separators=(',', ':')).encode() + b'\n\n'
        finally:
            with _lock:
                if t.queue is q:
                    t.queue = None
                t.seen = time.time()
    return body()


def watch(user_id, tab_id, planet=None, galaxy=None):
    """What this tab now shows (checked by the caller: the planet is one this person may see)."""
    with _lock:
        t = _tab(tab_id, user_id)
        if t:
            t.planet, t.galaxy = planet, galaxy
        return t is not None


def open_count():
    with _lock:
        return sum(1 for t in _tabs.values() if t.queue is not None)


# ---------------------------------------------------------------- telling

def tell(skip, *, planets=(), whole=(), galaxies=(), people=()):
    """planets / whole: planet ids whose files (or whole selves) changed; galaxies: user ids;
    people: (user id, what) pairs. `skip` is the tab that made the change."""
    planets, whole, galaxies = set(planets), set(whole), set(galaxies)
    planets -= whole
    if not (planets or whole or galaxies or people):
        return
    with _lock:
        for t in _tabs.values():
            if t.queue is None or t.id == skip:
                continue
            if t.planet and t.planet in whole:
                _send(t, {'t': 'planet', 'id': t.planet, 'whole': True})
            elif t.planet and t.planet in planets:
                _send(t, {'t': 'planet', 'id': t.planet})
            if t.galaxy is not None:
                if t.galaxy in galaxies:
                    _send(t, {'t': 'galaxy'})
                elif galaxies:
                    _send(t, {'t': 'universe'})
            for uid, what in people:
                if t.user_id == uid:
                    _send(t, {'t': what})


def tell_person(user_id, what):
    """For one person, from outside a request (a comet coming due)."""
    tell(None, people=[(user_id, what)])


# ---------------------------------------------------------------- what a change touched

# Changes that touch nothing anyone else is looking at.
QUIET = re.compile(r'^/api/(auth/|admin/|me/(prefs|pin|recovery-key)$|push$|moment$|comments/seen$|books/|live/'
                   r'|galaxy/[^/]+/unlock$|beam-stops|docs/[^/]+/(img|comments|versions$))')
# Routes whose answer holds a new file (its id is read from the answer).
MAKES = re.compile(r'^/api/(blocks|upload|docs|blocks/[^/]+/(save|document)|beams/[^/]+)$')


def _planets_of_block(conn, block_id):
    return {r[0] for r in conn.execute('SELECT drawer_id FROM connections WHERE block_id = ?', (block_id,))}


def _block_owner(conn, block_id):
    row = conn.execute('SELECT user_id FROM blocks WHERE id = ?', (block_id,)).fetchone()
    return row[0] if row else None


def _planet(conn, drawer_id):
    """(owner, its planet if a moon, the other keeper) of a planet, or None."""
    row = conn.execute('SELECT user_id, parent_id FROM drawers WHERE id = ?', (drawer_id,)).fetchone()
    if not row:
        return None
    k = conn.execute('SELECT user_id FROM drawer_keepers WHERE drawer_id = ?', (row[1] or drawer_id,)).fetchone()
    return row[0], row[1], (k[0] if k else None)


def before(req, params):
    """What a change could take away, read before it runs (a deleted file's planets, a planet's keepers)."""
    if QUIET.match(req.path):
        return None
    conn = req.db
    seen = {}
    try:
        if params.get('block_id'):
            seen['planets'] = _planets_of_block(conn, params['block_id'])
            seen['owner'] = _block_owner(conn, params['block_id'])
        if params.get('drawer_id'):
            seen['planet'] = _planet(conn, params['drawer_id'])
            ask = conn.execute('SELECT from_id, to_id FROM keep_asks WHERE drawer_id = ?', (params['drawer_id'],)).fetchone()
            seen['ask'] = tuple(ask) if ask else ()
        if params.get('beam_id'):
            row = conn.execute('SELECT from_id, to_id, block_id FROM beams WHERE id = ?', (params['beam_id'],)).fetchone()
            seen['beam'] = tuple(row) if row else None
    except Exception:
        traceback.print_exc()
    return seen


def _made(resp):
    """The id of a file a change made, from its answer."""
    try:
        data = json.loads(resp.body[0])
    except Exception:
        return None
    if not isinstance(data, dict):
        return None
    block = data.get('block')
    return str(block['id']) if isinstance(block, dict) and block.get('id') else None


def after(req, params, seen, resp):
    """Tell everyone looking at what this change touched."""
    if seen is None or not req.user:
        return
    try:
        _after(req, params, seen, resp)
    except Exception:
        traceback.print_exc()


def _after(req, params, seen, resp):
    conn, path, me = req.db, req.path, req.user['id']
    planets, whole, galaxies, people = set(), set(), set(), set()

    def planet_changed(d, all_of_it=False):
        info = _planet(conn, d)
        (whole if all_of_it else planets).add(d)
        if info:
            owner, parent, keeper = info
            galaxies.update(x for x in (owner, keeper) if x)
            if parent and all_of_it:
                whole.add(parent)     # a moon's name and look show on its planet's page

    def file_changed(block_id, was=()):
        now_on = _planets_of_block(conn, block_id)
        for d in set(was) | now_on:
            planet_changed(d)
        owner = _block_owner(conn, block_id) or seen.get('owner')
        if owner:
            galaxies.add(owner)       # its stars, its planets' faces

    block_id = params.get('block_id')
    drawer_id = params.get('drawer_id')

    if block_id:
        file_changed(block_id, seen.get('planets') or ())
        owner = seen.get('owner')
        if '/comments' in path and owner and owner != me:
            people.add((owner, 'comments'))
        if '/comet' in path:
            galaxies.add(me)
            people.add((me, 'comets'))   # your other devices
        if path.endswith('/beam'):
            row = conn.execute('SELECT to_id FROM beams WHERE block_id = ? AND from_id = ? ORDER BY rowid DESC LIMIT 1',
                               (block_id, me)).fetchone()
            if row:
                people.add((row[0], 'beams'))
                galaxies.add(row[0])

    if drawer_id:
        info = seen.get('planet') or _planet(conn, drawer_id)
        files_only = path.endswith(('/order', '/check', '/board'))
        planet_changed(drawer_id, not files_only)
        if info:
            owner, parent, keeper = info
            galaxies.update(x for x in (owner, keeper) if x)
            if parent and not files_only:
                whole.add(parent)
        if '/keep' in path or path.endswith('/leave') or path.startswith('/api/keep/'):
            ask = conn.execute('SELECT from_id, to_id FROM keep_asks WHERE drawer_id = ?', (drawer_id,)).fetchone()
            for uid in set(ask or ()) | set(seen.get('ask') or ()) | set((info or ())[::2]):
                if uid and uid != me:
                    people.add((uid, 'keep'))
                    galaxies.add(uid)

    beam = seen.get('beam')
    if beam:
        sender, to, b = beam
        people.update({(sender, 'beams'), (to, 'beams')})
        galaxies.update({sender, to})

    if MAKES.match(path):
        made = _made(resp)
        if made:
            file_changed(made)
        galaxies.add(me)

    if path == '/api/drawers' or path.startswith(('/api/galaxy/layout', '/api/constellations', '/api/me/')):
        galaxies.add(me)
        try:
            data = json.loads(resp.body[0])
            parent = (data.get('drawer') or data).get('parentId')
            if parent:
                whole.add(parent)
        except Exception:
            pass
    if path == '/api/deleted':
        galaxies.add(me)

    tell(req.header('X-Mutt-Tab'), planets=planets, whole=whole, galaxies=galaxies, people=people)

