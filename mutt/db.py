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
    chosen = os.environ.get('MUTT_DATA_DIR') or os.environ.get('RAILWAY_VOLUME_MOUNT_PATH')
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
