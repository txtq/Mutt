"""Usernames, 4-digit PINs, sessions and brute-force protection.

A 4-digit PIN only has 10,000 possibilities, so every guess is expensive
(scrypt + server-side pepper) and repeated misses lock the account with an
exponential back-off, on top of a per-IP limit.
"""
import collections
import hashlib
import hmac
import re
import secrets
import threading
import time

from . import db

SESSION_COOKIE = 'mutt_session'
SESSION_TTL = 60 * 60 * 24 * 30
USERNAME_RE = re.compile(r'^[a-z0-9][a-z0-9_.-]{0,22}[a-z0-9]$')
PIN_RE = re.compile(r'^[0-9]{4}$')
RESERVED = {
    'admin', 'administrator', 'all', 'api', 'assets', 'bundles', 'drawers', 'everything',
    'help', 'login', 'logout', 'me', 'mutt', 'null', 'root', 'search', 'settings',
    'signup', 'support', 'system', 'undefined',
}
FREE_ATTEMPTS = 5

_pepper = None
_dummy_salt = secrets.token_bytes(16)


def _key():
    global _pepper
    if _pepper is None:
        _pepper = db.secret_key()
    return _pepper


def hash_pin(pin, salt):
    peppered = hmac.new(_key(), pin.encode(), hashlib.sha256).digest()
    return hashlib.scrypt(peppered, salt=salt, n=2 ** 14, r=8, p=1, dklen=32)


def new_pin_hash(pin):
    salt = secrets.token_bytes(16)
    return hash_pin(pin, salt), salt


def check_pin(pin, salt, expected):
    return hmac.compare_digest(hash_pin(pin, salt), expected)


def burn_time(pin):
    """Do the same work as a real check so unknown usernames aren't faster."""
    hash_pin(pin, _dummy_salt)


def normalize_username(value):
    return (value or '').strip().lower().lstrip('@')


def username_problem(name):
    if len(name) < 2:
        return 'Usernames need at least 2 characters.'
    if len(name) > 24:
        return 'Usernames can be up to 24 characters.'
    if not USERNAME_RE.match(name):
        return 'Use letters, numbers, dots, dashes or underscores.'
    if name in RESERVED:
        return 'That username is reserved.'
    return None


def lock_seconds(failed):
    if failed < FREE_ATTEMPTS:
        return 0
    return min(3600, 30 * 2 ** (failed - FREE_ATTEMPTS))


class RateLimiter:
    """Sliding-window counter kept in memory."""

    def __init__(self, limit, window):
        self.limit = limit
        self.window = window
        self.hits = collections.defaultdict(collections.deque)
        self.lock = threading.Lock()

    def _trim(self, key, now):
        q = self.hits[key]
        while q and q[0] <= now - self.window:
            q.popleft()
        return q

    def retry_after(self, key):
        now = time.time()
        with self.lock:
            q = self._trim(key, now)
            if len(q) >= self.limit:
                return max(1, int(q[0] + self.window - now))
            return 0

    def hit(self, key):
        now = time.time()
        with self.lock:
            self._trim(key, now).append(now)
            if len(self.hits) > 10000:
                for stale in [k for k, q in self.hits.items() if not q or q[-1] <= now - self.window]:
                    del self.hits[stale]


login_failures_by_ip = RateLimiter(limit=30, window=15 * 60)
signups_by_ip = RateLimiter(limit=10, window=60 * 60)


def _token_hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


def create_session(conn, user_id):
    token = secrets.token_urlsafe(32)
    now = time.time()
    conn.execute(
        'INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
        (_token_hash(token), user_id, now, now + SESSION_TTL),
    )
    return token


def session_user(conn, token):
    """Returns (user_row, refreshed) for a valid session token, else (None, False)."""
    if not token or len(token) > 100:
        return None, False
    now = time.time()
    row = conn.execute(
        'SELECT s.expires_at, u.* FROM sessions s JOIN users u ON u.id = s.user_id '
        'WHERE s.token_hash = ? AND s.expires_at > ?',
        (_token_hash(token), now),
    ).fetchone()
    if not row:
        return None, False
    refreshed = False
    if row['expires_at'] - now < SESSION_TTL / 2:
        conn.execute('UPDATE sessions SET expires_at = ? WHERE token_hash = ?',
                     (now + SESSION_TTL, _token_hash(token)))
        refreshed = True
    return row, refreshed


def end_session(conn, token):
    if token:
        conn.execute('DELETE FROM sessions WHERE token_hash = ?', (_token_hash(token),))


def end_other_sessions(conn, user_id, keep_token):
    conn.execute('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?',
                 (user_id, _token_hash(keep_token or '')))


def prune_sessions(conn):
    conn.execute('DELETE FROM sessions WHERE expires_at < ?', (time.time(),))


def cookie_header(req, token, max_age=SESSION_TTL):
    parts = [f'{SESSION_COOKIE}={token}', 'Path=/', 'HttpOnly', 'SameSite=Lax', f'Max-Age={max_age}']
    if req.is_secure:
        parts.append('Secure')
    return ('Set-Cookie', '; '.join(parts))


def clear_cookie_header(req):
    return cookie_header(req, '', max_age=0)
