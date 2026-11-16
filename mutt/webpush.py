"""Telling someone's device that a reminder is due, with Mutt closed (Web Push).

Mutt sends an empty push: no words leave the server, so nothing has to be
encrypted. The device's service worker (`public/sw.js`) wakes, asks Mutt which
comets are due (`GET /api/comets/due`) and shows them. A push only needs
to be signed: a short token (VAPID, RFC 8292) signed with Mutt's own key on the
P-256 curve. Python has no such curve built in, so the few lines of it are here.

The key is made once and kept in DATA_DIR/push-key.json. `MUTT_PUSH=0` turns
sending off. Pushes go only to the browsers' own push services (`HOSTS`), never
to an address someone made up.
"""
import base64
import hashlib
import json
import os
import secrets
import time
import urllib.error
import urllib.parse
import urllib.request

from . import db

ON = os.environ.get('MUTT_PUSH', '1') != '0'
KEY_PATH = os.path.join(db.DATA_DIR, 'push-key.json')
# The push services of Safari (Mac and iPhone), Chrome, Firefox and Edge.
HOSTS = ('push.apple.com', 'fcm.googleapis.com', 'push.services.mozilla.com', 'notify.windows.com')

# ---------------------------------------------------------------- the P-256 curve

P = 0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff
A = P - 3
B = 0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b
N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551
G = (0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296,
     0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5)


def _add(p1, p2):
    if p1 is None:
        return p2
    if p2 is None:
        return p1
    (x1, y1), (x2, y2) = p1, p2
    if x1 == x2 and (y1 + y2) % P == 0:
        return None
    if p1 == p2:
        m = (3 * x1 * x1 + A) * pow(2 * y1, -1, P) % P
    else:
        m = (y2 - y1) * pow(x2 - x1, -1, P) % P
    x3 = (m * m - x1 - x2) % P
    return x3, (m * (x1 - x3) - y1) % P


def _times(k, point=G):
    out = None
    while k:
        if k & 1:
            out = _add(out, point)
        point = _add(point, point)
        k >>= 1
    return out


def on_curve(point):
    x, y = point
    return (y * y - (x * x * x + A * x + B)) % P == 0


def sign(d, message):
    """ECDSA with SHA-256: the 64 bytes r ‖ s, as a JSON web token wants them."""
    e = int.from_bytes(hashlib.sha256(message).digest(), 'big')
    while True:
        k = secrets.randbelow(N - 1) + 1
        r = _times(k)[0] % N
        s = pow(k, -1, N) * (e + r * d) % N
        if r and s:
            return r.to_bytes(32, 'big') + s.to_bytes(32, 'big')


def verify(point, message, sig):
    e = int.from_bytes(hashlib.sha256(message).digest(), 'big')
    r, s = int.from_bytes(sig[:32], 'big'), int.from_bytes(sig[32:], 'big')
    if not (0 < r < N and 0 < s < N):
        return False
    w = pow(s, -1, N)
    got = _add(_times(e * w % N), _times(r * w % N, point))
    return bool(got) and got[0] % N == r


# ---------------------------------------------------------------- Mutt's key

def b64(raw):
    return base64.urlsafe_b64encode(raw).rstrip(b'=').decode()


_key = None


def key():
    """(private number, public point), made once."""
    global _key
    if _key:
        return _key
    try:
        with open(KEY_PATH) as f:
            d = int(json.load(f)['d'], 16)
    except (OSError, ValueError, KeyError):
        d = secrets.randbelow(N - 1) + 1
        os.makedirs(os.path.dirname(KEY_PATH), exist_ok=True)
        tmp = KEY_PATH + '.tmp'
        with open(os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), 'w') as f:
            json.dump({'d': f'{d:064x}'}, f)
        os.replace(tmp, KEY_PATH)
    _key = (d, _times(d))
    return _key


def public_key():
    """The key a browser subscribes with: the point, uncompressed, in base64url."""
    x, y = key()[1]
    return b64(b'\x04' + x.to_bytes(32, 'big') + y.to_bytes(32, 'big'))


def allowed(endpoint):
    """Only a browser's own push service, over https."""
    try:
        parts = urllib.parse.urlsplit(endpoint)
    except ValueError:
        return False
    host = (parts.hostname or '').lower()
    return parts.scheme == 'https' and any(host == h or host.endswith('.' + h) for h in HOSTS)


def token(endpoint, contact):
    parts = urllib.parse.urlsplit(endpoint)
    head = b64(json.dumps({'typ': 'JWT', 'alg': 'ES256'}).encode())
    body = b64(json.dumps({'aud': f'{parts.scheme}://{parts.netloc}', 'exp': int(time.time()) + 12 * 3600,
                           'sub': contact}).encode())
    signed = f'{head}.{body}'.encode()
    return f'{head}.{body}.{b64(sign(key()[0], signed))}'


def send(endpoint, contact, urgent=True):
    """Wake one device. Returns 'ok', 'gone' (the subscription has ended: forget it) or 'failed'."""
    if not ON or not allowed(endpoint):
        return 'failed'
    req = urllib.request.Request(endpoint, data=b'', method='POST', headers={
        'Authorization': f'vapid t={token(endpoint, contact)}, k={public_key()}',
        'TTL': str(6 * 3600),
        'Urgency': 'high' if urgent else 'normal',
        'Content-Length': '0',
    })
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return 'ok' if resp.status < 300 else 'failed'
    except urllib.error.HTTPError as e:
        return 'gone' if e.code in (404, 410) else 'failed'
    except (urllib.error.URLError, OSError):
        return 'failed'
