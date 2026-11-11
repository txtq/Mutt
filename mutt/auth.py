"""Usernames, sign-in codes (6 digits, or 4 for older accounts), sessions and brute-force protection.

A 4-digit PIN only has 10,000 possibilities, so every guess is expensive
(scrypt + server-side pepper) and misses are limited at three levels:

- per account *and* source (IP, or IPv6 /64): 5 free misses, then an
  exponential back-off. Someone guessing from one place hits this first.
- per account from everywhere: 40 misses in a day closes it to new devices
  until they age out, so many sources can't guess through it either.
  Browsers that have signed in to the account before carry a device cookie
  and skip this one, so the owner isn't locked out by someone else's guessing.
- per source across all accounts (in memory).

A planet shared with "Code" has its own code, set by its owner and never
their sign-in code. Wrong planet codes follow the same rules, counted
separately (share_failures), so they can't lock the owner out.
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
# Sign-in codes: new ones are 6 digits; 4-digit codes made before that keep working.
PIN_RE = re.compile(r'^[0-9]{4}(?:[0-9]{2})?$')
NEW_PIN_RE = re.compile(r'^[0-9]{6}$')
# A planet's own code (for Code sharing) stays 4 digits.
CODE_RE = re.compile(r'^[0-9]{4}$')
# Codes people pick most often that the rules below don't already catch.
COMMON_PINS = {
    '123321', '654456', '112233', '332211', '111222', '222111', '102030', '147258', '258369', '369258',
    '159357', '357159', '147852', '258456', '852456', '456852', '789456', '456789', '987654', '159753',
    '753951', '951753', '135790', '246810', '696969', '420420', '520520', '131313', '007007', '010203',
}
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
    `device` is the browser's device cookie when signing in to this account.
    """
    ok = lambda: check_pin(pin, user['pin_salt'], user['pin_hash'])
    failure, _ = _guarded(conn, 'login_failures', user['id'], ip, ok, device)
    return failure


def share_salt(owner_id):
    """Every planet of one owner hashes its code with the same salt, so one
    guess is one hash however many planets they have. The pepper is what
    keeps these 4 digits from being looked up."""
    return hashlib.sha256(f'mutt-planet-code:{int(owner_id)}'.encode()).digest()[:16]


def share_hash(owner_id, code):
    return hash_pin(code, share_salt(owner_id))


def try_share_code(conn, owner, code, ip):
    """Check a planet code against all of `owner`'s Code planets, with the
    same kind of limits as signing in but counted apart, so guessing a
    planet's code can't lock its owner out of their account.

    Returns (failure, ids): failure as in `try_pin`, ids the planets it opens.
    """
    def opens():
        digest = share_hash(owner['id'], code)
        rows = conn.execute("SELECT id, share_hash FROM drawers WHERE user_id = ? AND visibility = 'pin' "
                            'AND share_hash IS NOT NULL', (owner['id'],)).fetchall()
        return [r['id'] for r in rows if hmac.compare_digest(bytes(r['share_hash']), digest)]
    return _guarded(conn, 'share_failures', owner['id'], ip, opens)


def _guarded(conn, table, user_id, ip, check, device=None):
    """Run `check` (truthy when the code is right) under the lockout rules,
    counting misses in `table` (login_failures or share_failures)."""
    source = source_key(ip)
    with _account_locks[user_id % len(_account_locks)]:
        now = time.time()
        cutoff = now - FAILURE_WINDOW
        failed, last = conn.execute(
            f'SELECT COUNT(*), MAX(at) FROM {table} WHERE user_id = ? AND source = ? AND at > ?',
            (user_id, source, cutoff)).fetchone()
        wait = last + lock_seconds(failed) - now if failed else 0
        if wait <= 0 and not known_device(conn, user_id, device):
            recent = conn.execute(
                f'SELECT at FROM {table} WHERE user_id = ? AND at > ? ORDER BY at DESC LIMIT ?',
                (user_id, cutoff, ACCOUNT_LIMIT)).fetchall()
            if len(recent) >= ACCOUNT_LIMIT:
                wait = recent[-1][0] + FAILURE_WINDOW - now
        if wait > 0:
            wait = int(wait) + 1
            return (429, f'Too many wrong codes. Try again in {format_wait(wait)}.', {'retryAfter': wait}), None
        result = check()
        if not result:
            conn.execute(f'INSERT INTO {table} (user_id, source, at) VALUES (?, ?, ?)', (user_id, source, now))
            login_failures_by_ip.hit(ip)
            failed += 1
            lock = lock_seconds(failed)
            if lock:
                return (429, f'Too many wrong codes. Try again in {format_wait(lock)}.', {'retryAfter': lock}), None
            left = FREE_ATTEMPTS - failed
            return (401, "That code isn't right.", {'attemptsLeft': left if left <= 2 else None}), None
        conn.execute(f'DELETE FROM {table} WHERE user_id = ? AND source = ?', (user_id, source))
    return None, result


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
    conn.execute('DELETE FROM drawer_unlocks WHERE expires_at < ?', (time.time(),))
    conn.execute('DELETE FROM share_failures WHERE at < ?', (time.time() - FAILURE_WINDOW,))
    conn.execute('DELETE FROM login_failures WHERE at < ?', (time.time() - FAILURE_WINDOW,))
    conn.execute('DELETE FROM devices WHERE seen_at < ?', (time.time() - DEVICE_TTL,))


def cookie_header(req, token, max_age=SESSION_TTL, name=SESSION_COOKIE):
    parts = [f'{name}={token}', 'Path=/', 'HttpOnly', 'SameSite=Lax', f'Max-Age={max_age}']
    if req.is_secure:
        parts.append('Secure')
    return ('Set-Cookie', '; '.join(parts))


def clear_cookie_header(req):
    return cookie_header(req, '', max_age=0)


def pin_problem(pin):
    """Why a new sign-in code is too easy to guess, or None if it's fine."""
    if not NEW_PIN_RE.match(pin):
        return 'Your code needs to be 6 digits.'
    if len(set(pin)) == 1:
        return 'One digit over and over is too easy to guess. Mix them up.'
    steps = {(int(b) - int(a)) % 10 for a, b in zip(pin, pin[1:])}
    if steps in ({1}, {9}):
        return 'A run of digits in order is too easy to guess.'
    for size in (2, 3):  # 121212, 123123
        if pin == pin[:size] * (6 // size):
            return 'A repeating pattern is too easy to guess.'
    if pin in COMMON_PINS or pin == pin[::-1] and len(set(pin)) <= 2:
        return 'That code is one lots of people pick. Try another.'
    for year in (pin[:4], pin[2:]):  # 1990xx, xx1990: a birth year with a month or day
        if 1940 <= int(year) <= 2039:
            return 'Codes with a year in them are easy to guess. Try another.'
    return None
