"""Usernames, 4-digit PINs, sessions and brute-force protection.

A 4-digit PIN only has 10,000 possibilities, so every guess is expensive
(scrypt + server-side pepper) and misses are limited at three levels:

- per account *and* source (IP, or IPv6 /64): 5 free misses, then an
  exponential back-off. Someone guessing from one place hits this first.
- per account from everywhere: 40 misses in a day closes it to new devices
  until they age out, so many sources can't guess through it either.
  Browsers that have signed in to the account before carry a device cookie
  and skip this one, so the owner isn't locked out by someone else's guessing.
- per source across all accounts (in memory).
"""
import collections
import hashlib
import hmac
import ipaddress
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
FAILURE_WINDOW = 24 * 60 * 60
ACCOUNT_LIMIT = 40  # one source can make at most ~35 misses a day, so it never reaches this alone
DEVICE_COOKIE = 'mutt_device'
DEVICE_TTL = 400 * 24 * 60 * 60  # the longest browsers keep a cookie

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


def session_key(token):
    """Stable, non-secret id for a session (what unlocks are tied to)."""
    return _token_hash(token or '')


def source_key(ip):
    """Who is guessing, as a peppered hash: the IP, or its /64 for IPv6
    (one connection usually owns a whole /64)."""
    try:
        addr = ipaddress.ip_address(ip)
        if addr.version == 6 and not addr.ipv4_mapped:
            ip = str(ipaddress.ip_network(f'{ip}/64', strict=False).network_address)
        elif addr.version == 6:
            ip = str(addr.ipv4_mapped)
    except ValueError:
        pass
    return hmac.new(_key(), (ip or '').encode(), hashlib.sha256).hexdigest()[:32]


# Checks of one account's code run one at a time, so a burst of parallel
# guesses can't all slip past the counts before any is recorded.
_account_locks = [threading.Lock() for _ in range(64)]


def try_pin(conn, user, pin, ip, device=None):
    """Check a PIN against an account with the shared lockout rules.

    Returns None on success, else (status, message, extra) for an HttpError.
    Used for signing in and for unlocking someone's drawers, so guessing a
    code through either door counts toward the same limits. `device` is the
    browser's device cookie when signing in to this account.
    """
    source = source_key(ip)
    with _account_locks[user['id'] % len(_account_locks)]:
        now = time.time()
        cutoff = now - FAILURE_WINDOW
        failed, last = conn.execute(
            'SELECT COUNT(*), MAX(at) FROM login_failures WHERE user_id = ? AND source = ? AND at > ?',
            (user['id'], source, cutoff)).fetchone()
        wait = last + lock_seconds(failed) - now if failed else 0
        if wait <= 0 and not known_device(conn, user['id'], device):
            recent = conn.execute(
                'SELECT at FROM login_failures WHERE user_id = ? AND at > ? ORDER BY at DESC LIMIT ?',
                (user['id'], cutoff, ACCOUNT_LIMIT)).fetchall()
            if len(recent) >= ACCOUNT_LIMIT:
                wait = recent[-1][0] + FAILURE_WINDOW - now
        if wait > 0:
            wait = int(wait) + 1
            return 429, f'Too many wrong codes. Try again in {format_wait(wait)}.', {'retryAfter': wait}
        if not check_pin(pin, user['pin_salt'], user['pin_hash']):
            conn.execute('INSERT INTO login_failures (user_id, source, at) VALUES (?, ?, ?)',
                         (user['id'], source, now))
            login_failures_by_ip.hit(ip)
            failed += 1
            lock = lock_seconds(failed)
            if lock:
                return 429, f'Too many wrong codes. Try again in {format_wait(lock)}.', {'retryAfter': lock}
            left = FREE_ATTEMPTS - failed
            return 401, "That code isn't right.", {'attemptsLeft': left if left <= 2 else None}
        conn.execute('DELETE FROM login_failures WHERE user_id = ? AND source = ?', (user['id'], source))
    return None


def known_device(conn, user_id, token):
    if not token or len(token) > 100:
        return False
    return bool(conn.execute('SELECT 1 FROM devices WHERE device_hash = ? AND user_id = ?',
                             (_token_hash(token), user_id)).fetchone())


def remember_device(req, conn, user_id):
    """Mark this browser as one that has signed in to the account.
    Returns the Set-Cookie header to send (the cookie is refreshed each time)."""
    token = req.cookie(DEVICE_COOKIE)
    if not token or not re.fullmatch(r'[\w-]{20,100}', token):
        token = secrets.token_urlsafe(32)
    conn.execute('INSERT OR REPLACE INTO devices (device_hash, user_id, seen_at) VALUES (?, ?, ?)',
                 (_token_hash(token), user_id, time.time()))
    return cookie_header(req, token, max_age=DEVICE_TTL, name=DEVICE_COOKIE)


def format_wait(seconds):
    if seconds < 90:
        return f'{seconds} seconds'
    if seconds < 5400:
        return f'{round(seconds / 60)} minutes'
    return f'{round(seconds / 3600)} hours'


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
    conn.execute('DELETE FROM unlocks WHERE expires_at < ?', (time.time(),))
    conn.execute('DELETE FROM login_failures WHERE at < ?', (time.time() - FAILURE_WINDOW,))
    conn.execute('DELETE FROM devices WHERE seen_at < ?', (time.time() - DEVICE_TTL,))


def cookie_header(req, token, max_age=SESSION_TTL, name=SESSION_COOKIE):
    parts = [f'{name}={token}', 'Path=/', 'HttpOnly', 'SameSite=Lax', f'Max-Age={max_age}']
    if req.is_secure:
        parts.append('Secure')
    return ('Set-Cookie', '; '.join(parts))


def clear_cookie_header(req):
    return cookie_header(req, '', max_age=0)
