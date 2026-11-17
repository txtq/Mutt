"""SQLite storage and on-disk locations for Mutt."""
import os
import secrets
import sqlite3
from contextlib import contextmanager

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IN_CONTAINER = os.environ.get('MUTT_IN_CONTAINER') == '1'  # set by the Dockerfile


def _mount_points():
    try:
        with open('/proc/self/mounts') as f:
            return {line.split()[1].replace('\\040', ' ') for line in f if len(line.split()) > 1}
    except OSError:
        return set()


def on_mounted_disk(path):
    """True when `path` lives on a separately mounted disk, i.e. a host's volume."""
    mounts = _mount_points()
    path = os.path.abspath(path)
    while path != os.path.dirname(path):
        if path in mounts or os.path.ismount(path):
            return True
        path = os.path.dirname(path)
    return False


def _data_dir():
    chosen = os.environ.get('MUTT_DATA_DIR')
    if chosen:
        return chosen
    # Hosts like Northflank or Fly just mount a volume; /data is the conventional spot.
    if IN_CONTAINER and on_mounted_disk('/data'):
        return '/data'
    return os.path.join(ROOT, 'data')


DATA_DIR = os.path.abspath(_data_dir())
# A container starts fresh on every deploy, so its data only survives on a mounted volume.
PERSISTENT = not IN_CONTAINER or on_mounted_disk(DATA_DIR)
FILES_DIR = os.path.join(DATA_DIR, 'files')
DB_PATH = os.path.join(DATA_DIR, 'mutt.db')
PUBLIC_DIR = os.path.join(ROOT, 'public')

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  pin_hash      BLOB NOT NULL,
  pin_salt      BLOB NOT NULL,
  failed        INTEGER NOT NULL DEFAULT 0,
  locked_until  REAL NOT NULL DEFAULT 0,
  created_at    REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  REAL NOT NULL,
  expires_at  REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS drawers (
  id           TEXT PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  icon         TEXT NOT NULL,
  created_at   REAL NOT NULL,
  updated_at   REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS blocks (
  id           TEXT PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL,
  title        TEXT NOT NULL DEFAULT '',
  description  TEXT NOT NULL DEFAULT '',
  content      TEXT NOT NULL DEFAULT '',
  file_key     TEXT,
  file_name    TEXT,
  mime         TEXT,
  ext          TEXT,
  size         INTEGER,
  thumb_key    TEXT,
  width        INTEGER,
  height       INTEGER,
  duration     REAL,
  meta         TEXT NOT NULL DEFAULT '{}',
  created_at   REAL NOT NULL,
  updated_at   REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS connections (
  block_id      TEXT NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
  drawer_id     TEXT NOT NULL REFERENCES drawers(id) ON DELETE CASCADE,
  position      REAL NOT NULL,
  connected_at  REAL NOT NULL,
  PRIMARY KEY (block_id, drawer_id)
);

CREATE TABLE IF NOT EXISTS unlocks (
  session_hash  TEXT NOT NULL,
  owner_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at    REAL NOT NULL,
  PRIMARY KEY (session_hash, owner_id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_drawers_user ON drawers(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_blocks_user ON blocks(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_blocks_kind ON blocks(user_id, kind);
CREATE INDEX IF NOT EXISTS idx_connections_drawer ON connections(drawer_id, position);
"""


def connect():
    conn = sqlite3.connect(DB_PATH, timeout=15, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys = ON')
    conn.execute('PRAGMA busy_timeout = 15000')
    return conn


def init():
    os.makedirs(FILES_DIR, exist_ok=True)
    conn = connect()
    try:
        conn.execute('PRAGMA journal_mode = WAL')
        conn.executescript(SCHEMA)
        migrate(conn)
    finally:
        conn.close()


def migrate(conn):
    """Bring databases made by older versions up to date."""
    user_columns = {row[1] for row in conn.execute('PRAGMA table_info(users)')}
    if 'prefs' not in user_columns:
        conn.execute("ALTER TABLE users ADD COLUMN prefs TEXT NOT NULL DEFAULT '{}'")
    block_columns = {row[1] for row in conn.execute('PRAGMA table_info(blocks)')}
    if 'shared_at' not in block_columns:
        conn.execute('ALTER TABLE blocks ADD COLUMN shared_at REAL')  # set when shared with the community
    conn.execute('CREATE INDEX IF NOT EXISTS idx_blocks_shared ON blocks(shared_at)')
    if 'deleted_at' not in block_columns:
        # Recently deleted: a deleted file is kept a week (and can be put back) before it goes for good.
        conn.execute('ALTER TABLE blocks ADD COLUMN deleted_at REAL')
        # Where it sat when it was deleted, as JSON: [{drawer, position, checked}].
        conn.execute('ALTER TABLE blocks ADD COLUMN deleted_from TEXT')
    drawer_columns = {row[1] for row in conn.execute('PRAGMA table_info(drawers)')}
    if 'community' not in drawer_columns:
        conn.execute('ALTER TABLE drawers ADD COLUMN community INTEGER NOT NULL DEFAULT 0')  # anyone can add
    if 'visibility' not in drawer_columns:
        # Who can look inside a drawer (a planet): private, pin (anyone with your code), people, public.
        conn.execute("ALTER TABLE drawers ADD COLUMN visibility TEXT NOT NULL DEFAULT 'pin'")
    if 'look' not in drawer_columns:
        conn.execute('ALTER TABLE drawers ADD COLUMN look TEXT')  # what kind of world it is; empty = picked for it
    if 'modes' not in drawer_columns:
        # Features a planet has switched on (list mode and its options), as JSON.
        conn.execute("ALTER TABLE drawers ADD COLUMN modes TEXT NOT NULL DEFAULT '{}'")
    if 'share_hash' not in drawer_columns:
        # The planet's own code for "Code" sharing, set by its owner (never their sign-in code).
        conn.execute('ALTER TABLE drawers ADD COLUMN share_hash BLOB')
    # Who has opened which planet with its code, and until when. (The older
    # `unlocks` table opened a whole galaxy with its owner's sign-in code; it's
    # no longer read.)
    conn.execute('CREATE TABLE IF NOT EXISTS drawer_unlocks ('
                 'session_hash TEXT NOT NULL, '
                 'drawer_id TEXT NOT NULL REFERENCES drawers(id) ON DELETE CASCADE, '
                 'expires_at REAL NOT NULL, PRIMARY KEY (session_hash, drawer_id))')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_drawer_unlocks_drawer ON drawer_unlocks(drawer_id)')
    # Wrong planet codes, by owner and (hashed) source. Kept apart from
    # login_failures so guessing a planet's code can't lock its owner out.
    conn.execute('CREATE TABLE IF NOT EXISTS share_failures ('
                 'user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, '
                 'source TEXT NOT NULL, at REAL NOT NULL)')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_share_failures_user ON share_failures(user_id, at)')
    connection_columns = {row[1] for row in conn.execute('PRAGMA table_info(connections)')}
    if 'checked' not in connection_columns:
        conn.execute('ALTER TABLE connections ADD COLUMN checked REAL')  # ticked off on a list planet
    if 'placed' not in connection_columns:
        # Who put a file on a planet: 'hand' (its owner) or 'auto' (autosort); empty = from before this was kept.
        # Autosort remembers files placed by hand more strongly, and learns from autosort's that get moved.
        conn.execute('ALTER TABLE connections ADD COLUMN placed TEXT')
    if 'x' not in drawer_columns:
        # Where its owner put it in their galaxy, from the void's centre; empty = not placed yet.
        conn.execute('ALTER TABLE drawers ADD COLUMN x REAL')
        conn.execute('ALTER TABLE drawers ADD COLUMN y REAL')
    if 'parent_id' not in drawer_columns:
        # A moon belongs to a planet; empty = a planet. Moons go with their planet.
        conn.execute('ALTER TABLE drawers ADD COLUMN parent_id TEXT REFERENCES drawers(id) ON DELETE CASCADE')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_drawers_parent ON drawers(parent_id)')
    # Moon rock stopped being a kind of planet (2026-11): those planets are Pearl now.
    conn.execute("UPDATE drawers SET look = 'pearl' WHERE look = 'rock' AND parent_id IS NULL")
    if 'own_sharing' not in drawer_columns:
        # A moon follows its planet's sharing until its owner sets the moon's own.
        # Moons made before this keep whatever they have if it already differs.
        conn.execute('ALTER TABLE drawers ADD COLUMN own_sharing INTEGER NOT NULL DEFAULT 0')
        conn.execute('UPDATE drawers SET own_sharing = 1 WHERE parent_id IS NOT NULL AND visibility != '
                     '(SELECT p.visibility FROM drawers p WHERE p.id = drawers.parent_id)')
    conn.execute('CREATE TABLE IF NOT EXISTS drawer_access ('
                 'drawer_id TEXT NOT NULL REFERENCES drawers(id) ON DELETE CASCADE, '
                 'user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, '
                 'PRIMARY KEY (drawer_id, user_id))')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_access_user ON drawer_access(user_id)')
    # Wrong codes, by account and (hashed) source; replaces users.failed/locked_until,
    # which only the classic site still uses.
    conn.execute('CREATE TABLE IF NOT EXISTS login_failures ('
                 'user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, '
                 'source TEXT NOT NULL, at REAL NOT NULL)')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_failures_user ON login_failures(user_id, at)')
    # Books: where each reader is in a book, their highlights and bookmarks,
    # and a PDF's text once it's been turned into reading format.
    conn.execute('CREATE TABLE IF NOT EXISTS book_progress ('
                 'user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, '
                 'block_id TEXT NOT NULL REFERENCES blocks(id) ON DELETE CASCADE, '
                 'loc TEXT NOT NULL, percent REAL NOT NULL DEFAULT 0, updated_at REAL NOT NULL, '
                 'PRIMARY KEY (user_id, block_id))')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_book_progress_block ON book_progress(block_id)')
    conn.execute('CREATE TABLE IF NOT EXISTS book_marks ('
                 'id TEXT PRIMARY KEY, '
                 'user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, '
                 'block_id TEXT NOT NULL REFERENCES blocks(id) ON DELETE CASCADE, '
                 'kind TEXT NOT NULL, loc TEXT NOT NULL, text TEXT NOT NULL DEFAULT \'\', '
                 'color TEXT, note TEXT NOT NULL DEFAULT \'\', percent REAL NOT NULL DEFAULT 0, '
                 'created_at REAL NOT NULL)')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_book_marks ON book_marks(user_id, block_id)')
    conn.execute('CREATE TABLE IF NOT EXISTS book_texts ('
                 'block_id TEXT PRIMARY KEY REFERENCES blocks(id) ON DELETE CASCADE, '
                 'data BLOB NOT NULL, made_at REAL NOT NULL)')
    # Documents: a note's fuller version from the document editor (HTML and
    # page setup), its saved versions, its pictures, and comments in its margin.
    conn.execute('CREATE TABLE IF NOT EXISTS docs ('
                 'block_id TEXT PRIMARY KEY REFERENCES blocks(id) ON DELETE CASCADE, '
                 'html TEXT NOT NULL, settings TEXT NOT NULL DEFAULT \'{}\', '
                 'synced_at REAL NOT NULL, updated_at REAL NOT NULL)')
    conn.execute('CREATE TABLE IF NOT EXISTS doc_versions ('
                 'id TEXT PRIMARY KEY, '
                 'block_id TEXT NOT NULL REFERENCES blocks(id) ON DELETE CASCADE, '
                 'title TEXT NOT NULL DEFAULT \'\', html TEXT, text TEXT NOT NULL DEFAULT \'\', '
                 'name TEXT NOT NULL DEFAULT \'\', words INTEGER NOT NULL DEFAULT 0, created_at REAL NOT NULL)')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_doc_versions ON doc_versions(block_id, created_at)')
    conn.execute('CREATE TABLE IF NOT EXISTS doc_images ('
                 'id TEXT PRIMARY KEY, '
                 'block_id TEXT NOT NULL REFERENCES blocks(id) ON DELETE CASCADE, '
                 'mime TEXT NOT NULL, data BLOB NOT NULL, created_at REAL NOT NULL)')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_doc_images ON doc_images(block_id)')
    if 'unplaced' not in {row[1] for row in conn.execute('PRAGMA table_info(doc_images)')}:
        # 1 once where it was taken has been blanked (privacy.py); older pictures are swept at start.
        conn.execute('ALTER TABLE doc_images ADD COLUMN unplaced INTEGER NOT NULL DEFAULT 0')
    if 'short_code' not in user_columns:
        # 1 when the account last signed in with a 4-digit code: it is asked to pick a 6-digit one.
        conn.execute('ALTER TABLE users ADD COLUMN short_code INTEGER NOT NULL DEFAULT 0')
    # "Others can add files" only ever goes with Public. A planet that somehow
    # has it under another setting loses it, and other people's files leave
    # with it, as when its owner turns it off.
    loose = [r[0] for r in conn.execute("SELECT id FROM drawers WHERE community = 1 AND visibility != 'public'")]
    for drawer_id in loose:
        conn.execute('DELETE FROM connections WHERE drawer_id = ? AND block_id IN (SELECT b.id FROM blocks b '
                     'JOIN drawers d ON d.id = ? WHERE b.user_id != d.user_id)', (drawer_id, drawer_id))
        conn.execute('UPDATE drawers SET community = 0 WHERE id = ?', (drawer_id,))
    conn.execute('CREATE TABLE IF NOT EXISTS doc_comments ('
                 'id TEXT PRIMARY KEY, '
                 'block_id TEXT NOT NULL REFERENCES blocks(id) ON DELETE CASCADE, '
                 'user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, '
                 'parent_id TEXT REFERENCES doc_comments(id) ON DELETE CASCADE, '
                 'quote TEXT NOT NULL DEFAULT \'\', prefix TEXT NOT NULL DEFAULT \'\', suffix TEXT NOT NULL DEFAULT \'\', '
                 'body TEXT NOT NULL, resolved INTEGER NOT NULL DEFAULT 0, '
                 'created_at REAL NOT NULL, updated_at REAL NOT NULL)')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_doc_comments ON doc_comments(block_id)')
    # Comments on any file, by anyone who can see it. Its owner can remove any of them.
    conn.execute('CREATE TABLE IF NOT EXISTS file_comments ('
                 'id TEXT PRIMARY KEY, '
                 'block_id TEXT NOT NULL REFERENCES blocks(id) ON DELETE CASCADE, '
                 'user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, '
                 'body TEXT NOT NULL, created_at REAL NOT NULL)')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_file_comments ON file_comments(block_id, created_at)')
    if 'seen' not in {row[1] for row in conn.execute('PRAGMA table_info(file_comments)')}:
        # Whether the file's owner has seen it: what they're told about on their
        # galaxy. An owner's own comments, and any they've answered, count as seen.
        conn.execute('ALTER TABLE file_comments ADD COLUMN seen INTEGER NOT NULL DEFAULT 0')
        conn.execute('UPDATE file_comments SET seen = 1 WHERE user_id = (SELECT user_id FROM blocks WHERE id = block_id) '
                     'OR EXISTS (SELECT 1 FROM file_comments o JOIN blocks b ON b.id = o.block_id '
                     'WHERE o.block_id = file_comments.block_id AND o.user_id = b.user_id '
                     'AND o.created_at >= file_comments.created_at)')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_file_comments_unseen ON file_comments(seen, block_id)')
    # Getting back in without giving anyone your identity: a name you choose
    # (any words, shown instead of @username where a person is shown), a
    # recovery key (only its hash), requests for a reset sent from the sign-in
    # page to whoever runs Mutt, and the one-time links they send back.
    if 'display_name' not in user_columns:
        conn.execute('ALTER TABLE users ADD COLUMN display_name TEXT')
    if 'recovery_hash' not in user_columns:
        conn.execute('ALTER TABLE users ADD COLUMN recovery_hash BLOB')
        conn.execute('ALTER TABLE users ADD COLUMN recovery_salt BLOB')
        conn.execute('ALTER TABLE users ADD COLUMN recovery_at REAL')
    # Share menu keys (2026-11-16): each lets the "Send to Mutt" shortcut on one
    # device add files, and nothing else. Only their hashes are kept.
    conn.execute('CREATE TABLE IF NOT EXISTS send_keys ('
                 'key_hash TEXT PRIMARY KEY, '
                 'user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, '
                 'made_at REAL NOT NULL, used_at REAL)')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_send_keys_user ON send_keys(user_id)')
    conn.execute('CREATE TABLE IF NOT EXISTS reset_requests ('
                 'id TEXT PRIMARY KEY, '
                 'user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, '
                 "note TEXT NOT NULL DEFAULT '', source TEXT NOT NULL, "
                 "state TEXT NOT NULL DEFAULT 'waiting', created_at REAL NOT NULL, answered_at REAL)")
    conn.execute('CREATE INDEX IF NOT EXISTS idx_reset_requests ON reset_requests(state, created_at)')
    conn.execute('CREATE TABLE IF NOT EXISTS reset_links ('
                 'token_hash TEXT PRIMARY KEY, '
                 'user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, '
                 'created_at REAL NOT NULL, expires_at REAL NOT NULL, used_at REAL)')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_reset_links_user ON reset_links(user_id)')
    # Browsers that have signed in to an account; they skip its account-wide lock.
    conn.execute('CREATE TABLE IF NOT EXISTS devices ('
                 'device_hash TEXT NOT NULL, '
                 'user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, '
                 'seen_at REAL NOT NULL, PRIMARY KEY (device_hash, user_id))')
    # How close someone's galaxy sits to yours in the universe: raised when you
    # visit it or save one of its files, fading as time passes (api.draw_near).
    conn.execute('CREATE TABLE IF NOT EXISTS nearness ('
                 'user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, '
                 'other_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, '
                 'score REAL NOT NULL, at REAL NOT NULL, visited_at REAL NOT NULL DEFAULT 0, '
                 'PRIMARY KEY (user_id, other_id))')
    # What autosort has learned matters on each planet, from where its owner
    # moved files it got wrong (sorting.learn): {line: factor}, e.g. {"moment": 1.6}.
    conn.execute('CREATE TABLE IF NOT EXISTS planet_attention ('
                 'drawer_id TEXT PRIMARY KEY REFERENCES drawers(id) ON DELETE CASCADE, '
                 "weights TEXT NOT NULL DEFAULT '{}', lessons INTEGER NOT NULL DEFAULT 0, updated_at REAL NOT NULL)")
    # Constellations: a few of your stars (files on no planet) joined in your
    # sky, with a name. Never connections: the files stay stars until the
    # constellation becomes a planet. A star is in one constellation at most.
    # A deleted star keeps its row (it comes back if restored); `dismissed`
    # is the offer to become a planet, waved away.
    conn.execute('CREATE TABLE IF NOT EXISTS constellations ('
                 'id TEXT PRIMARY KEY, '
                 'user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, '
                 "title TEXT NOT NULL DEFAULT 'Constellation', dismissed INTEGER NOT NULL DEFAULT 0, "
                 'created_at REAL NOT NULL, updated_at REAL NOT NULL)')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_constellations_user ON constellations(user_id)')
    conn.execute('CREATE TABLE IF NOT EXISTS constellation_stars ('
                 'block_id TEXT PRIMARY KEY REFERENCES blocks(id) ON DELETE CASCADE, '
                 'constellation_id TEXT NOT NULL REFERENCES constellations(id) ON DELETE CASCADE, '
                 'position INTEGER NOT NULL, added_at REAL NOT NULL)')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_constellation_stars ON constellation_stars(constellation_id, position)')
    # A star put on a planet, by any route, leaves its constellation.
    conn.execute('CREATE TRIGGER IF NOT EXISTS constellation_star_leaves AFTER INSERT ON connections BEGIN '
                 'DELETE FROM constellation_stars WHERE block_id = NEW.block_id; END')
    # Board (a planet mode earned by arranging): each time the owner moves a
    # file by hand on a planet shown as plain files, one row (kept a month;
    # mutt/modes.py read_board counts them).
    conn.execute('CREATE TABLE IF NOT EXISTS hand_moves ('
                 'drawer_id TEXT NOT NULL REFERENCES drawers(id) ON DELETE CASCADE, at REAL NOT NULL)')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_hand_moves ON hand_moves(drawer_id, at)')
    # Where each thing sits on a planet's board, in board units: a file (its
    # block id; h empty for a picture, whose height follows its shape) or the
    # board's own words (an id starting "w-", with `words` and `style`:
    # heading or label). A file's row stays when it leaves the planet, so it
    # comes back to its place. `z` is the order they lie in, highest on top.
    conn.execute('CREATE TABLE IF NOT EXISTS board_items ('
                 'drawer_id TEXT NOT NULL REFERENCES drawers(id) ON DELETE CASCADE, '
                 'item_id TEXT NOT NULL, x REAL NOT NULL, y REAL NOT NULL, w REAL NOT NULL, h REAL, '
                 'z INTEGER NOT NULL DEFAULT 0, words TEXT, style TEXT, updated_at REAL NOT NULL, '
                 'PRIMARY KEY (drawer_id, item_id))')
    # Lines between two things on a board (files or words), a before b.
    conn.execute('CREATE TABLE IF NOT EXISTS board_lines ('
                 'drawer_id TEXT NOT NULL REFERENCES drawers(id) ON DELETE CASCADE, '
                 'a TEXT NOT NULL, b TEXT NOT NULL, created_at REAL NOT NULL, PRIMARY KEY (drawer_id, a, b))')
    # A planet kept together: its owner (drawers.user_id) and one other keeper,
    # who can do all its owner can except delete it. `x`/`y` are where it sits
    # in the keeper's own galaxy (the owner's place is drawers.x/y).
    conn.execute('CREATE TABLE IF NOT EXISTS drawer_keepers ('
                 'drawer_id TEXT PRIMARY KEY REFERENCES drawers(id) ON DELETE CASCADE, '
                 'user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, '
                 'since REAL NOT NULL, x REAL, y REAL)')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_drawer_keepers_user ON drawer_keepers(user_id)')
    # Asking someone to keep a planet together: one ask per planet at a time.
    # `waved` = they said Not now (the ask can be made again a week after `asked_at`).
    conn.execute('CREATE TABLE IF NOT EXISTS keep_asks ('
                 'drawer_id TEXT PRIMARY KEY REFERENCES drawers(id) ON DELETE CASCADE, '
                 'from_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, '
                 'to_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, '
                 'asked_at REAL NOT NULL, waved INTEGER NOT NULL DEFAULT 0)')
    # What one keeper should hear about once: the other left, or changed who can see it.
    conn.execute('CREATE TABLE IF NOT EXISTS keep_news ('
                 'id TEXT PRIMARY KEY, '
                 'user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, '
                 'drawer_id TEXT REFERENCES drawers(id) ON DELETE CASCADE, '
                 'what TEXT NOT NULL, by_name TEXT, title TEXT, at REAL NOT NULL)')
    # Beaming a file to someone. The file stays the sender's until the
    # receiver answers: kept (a copy is made, `copy_id`) or let go. `quiet`:
    # from someone they had never crossed paths with. `noted`: the note under
    # the clock was waved away (the star still waits).
    conn.execute('CREATE TABLE IF NOT EXISTS beams ('
                 'id TEXT PRIMARY KEY, '
                 'block_id TEXT NOT NULL REFERENCES blocks(id) ON DELETE CASCADE, '
                 'from_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, '
                 'to_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, '
                 "words TEXT NOT NULL DEFAULT '', sent_at REAL NOT NULL, quiet INTEGER NOT NULL DEFAULT 0, "
                 'noted INTEGER NOT NULL DEFAULT 0, answer TEXT, answered_at REAL, copy_id TEXT)')
    if 'form' not in {row[1] for row in conn.execute('PRAGMA table_info(beams)')}:
        # the form it was beamed in, so it arrives looking as it was sent: 'recipe' (a cookbook's card),
        # 'document' (a desk's page), or empty for a plain file
        conn.execute('ALTER TABLE beams ADD COLUMN form TEXT')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_beams_to ON beams(to_id, answer)')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_beams_from ON beams(from_id, sent_at)')
    # People someone has stopped beams (and asks to keep a planet together) from.
    conn.execute('CREATE TABLE IF NOT EXISTS beam_stops ('
                 'user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, '
                 'other_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, '
                 'at REAL NOT NULL, PRIMARY KEY (user_id, other_id))')
    # Comets: a note of yours made a reminder (DESIGN.md "Comets", the "comets" section of api.py).
    # One per note. `at` is when it goes off and `ahead` the heads-up before it (UTC seconds), worked
    # out from its day and time in the owner's zone when it was made (`tz`, minutes east). `made_at` is
    # where its journey across the sky starts (moved on by a snooze). `sent_*` say what has gone out,
    # `closed` the heads-up note waved away (the `at` it was for), `done_at` when it was dealt with.
    conn.execute('CREATE TABLE IF NOT EXISTS reminders ('
                 'block_id TEXT PRIMARY KEY REFERENCES blocks(id) ON DELETE CASCADE, '
                 'user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, '
                 'day TEXT NOT NULL, time TEXT, said TEXT, yearly INTEGER NOT NULL DEFAULT 0, tz INTEGER NOT NULL DEFAULT 0, '
                 'at REAL NOT NULL, ahead REAL NOT NULL, made_at REAL NOT NULL, '
                 'sent_ahead INTEGER NOT NULL DEFAULT 0, sent_at INTEGER NOT NULL DEFAULT 0, closed REAL, done_at REAL)')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_reminders_user ON reminders(user_id)')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_reminders_at ON reminders(at)')
    # Devices that asked to be told when a comet is due (Web Push, mutt/webpush.py).
    conn.execute('CREATE TABLE IF NOT EXISTS push_subs ('
                 'endpoint TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, '
                 'contact TEXT NOT NULL, made_at REAL NOT NULL)')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subs(user_id)')


@contextmanager
def transaction(conn):
    conn.execute('BEGIN IMMEDIATE')
    try:
        yield conn
    except BaseException:
        conn.execute('ROLLBACK')
        raise
    conn.execute('COMMIT')


def secret_key():
    """Server-side pepper for PIN hashes. Kept outside the database."""
    env = os.environ.get('MUTT_SECRET')
    if env:
        return env.encode()
    path = os.path.join(DATA_DIR, 'secret.key')
    try:
        with open(path, 'rb') as f:
            return f.read()
    except FileNotFoundError:
        os.makedirs(DATA_DIR, exist_ok=True)
        key = secrets.token_hex(32).encode()
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'wb') as f:
            f.write(key)
        return key


def user_files_dir(user_id):
    path = os.path.join(FILES_DIR, str(int(user_id)))
    os.makedirs(path, exist_ok=True)
    return path
