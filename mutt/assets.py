"""The site's own files under /assets: versioned so browsers keep them, and gzipped.

Every asset URL the page asks for carries `?v=<version>`, a fingerprint of all
the files in public/assets. The page links its stylesheets and scripts with it,
and scripts' imports of each other are given it as they're served. A request
with the current version may be kept for a year; any change to any file makes
a new version, so browsers fetch everything afresh after a deploy.
"""
import gzip
import hashlib
import mimetypes
import os
import re
import threading
import time

from . import db

ROOT = os.path.join(db.PUBLIC_DIR, 'assets')
CACHE_FOREVER = 'public, max-age=31536000, immutable'
# Text worth compressing; pictures and fonts are compressed already.
COMPRESSIBLE = ('text/', 'application/json', 'application/javascript', 'image/svg+xml')
MIN_GZIP = 1024

# `import … from './x.js'`, `export … from '../y.js'` and `import './z.js'`.
IMPORT = re.compile(r'''((?:\bfrom|\bimport)\s*)(['"])(\.{1,2}/[^'"?]+\.js)\2''')
# The page's own links to /assets/… in index.html.
PAGE_LINK = re.compile(r'''(["'])/assets/([^"'?]+)\1''')

_lock = threading.Lock()
_state = {'checked': 0.0, 'version': None, 'files': {}, 'preload': None}


def _scan():
    """A fingerprint of every file's name, size and change time (cheap: no reading)."""
    h = hashlib.sha1()
    for folder, dirs, names in os.walk(ROOT):
        dirs.sort()
        for name in sorted(names):
            path = os.path.join(folder, name)
            st = os.stat(path)
            h.update(f'{os.path.relpath(path, ROOT)}:{st.st_size}:{st.st_mtime_ns}\n'.encode())
    return h.hexdigest()[:12]


def version():
    """The current version, looked at again at most once a second (so editing works without a restart)."""
    now = time.monotonic()
    with _lock:
        if _state['version'] is None or now - _state['checked'] > 1.0:
            current = _scan()
            if current != _state['version']:
                _state['version'] = current
                _state['files'] = {}
                _state['preload'] = None
            _state['checked'] = now
        return _state['version']


def accepts_gzip(req):
    return 'gzip' in (req.header('Accept-Encoding') or '').lower()


def compressible(content_type):
    return content_type.startswith(COMPRESSIBLE)


def _load(relative, v):
    """The file as served: imports versioned for scripts, plus a gzipped copy. Kept in memory."""
    files = _state['files']
    entry = files.get(relative)
    if entry:
        return entry
    path = os.path.join(ROOT, relative)
    with open(path, 'rb') as f:
        body = f.read()
    content_type = mimetypes.guess_type(path)[0] or 'application/octet-stream'
    if content_type == 'text/javascript':
        body = IMPORT.sub(lambda m: f'{m.group(1)}{m.group(2)}{m.group(3)}?v={v}{m.group(2)}', body.decode('utf-8')).encode('utf-8')
    if content_type.startswith('text/'):
        content_type += '; charset=utf-8'
    entry = {
        'type': content_type,
        'body': body,
        'gz': gzip.compress(body, 6, mtime=0) if compressible(content_type) and len(body) >= MIN_GZIP else None,
        'etag': f'"{v}-{hashlib.sha1(body).hexdigest()[:12]}',
    }
    with _lock:
        if _state['version'] == v:
            files[relative] = entry
    return entry


def find(relative):
    """The real path of an asset, or None when there's no such file."""
    path = os.path.realpath(os.path.join(ROOT, relative))
    if not path.startswith(os.path.realpath(ROOT) + os.sep) or not os.path.isfile(path):
        return None
    return os.path.relpath(path, os.path.realpath(ROOT))


def serve(req, relative):
    """(status, headers, body) for one asset."""
    v = version()
    entry = _load(relative, v)
    cache = CACHE_FOREVER if req.arg('v') == v else 'no-cache'
    gz = entry['gz'] is not None and accepts_gzip(req)
    etag = entry['etag'] + ('-gz"' if gz else '"')
    headers = [
        ('Content-Type', entry['type']),
        ('Cache-Control', cache),
        ('ETag', etag),
    ]
    if entry['gz'] is not None:
        headers.append(('Vary', 'Accept-Encoding'))
    if req.header('If-None-Match') == etag:
        return 304, headers, b''
    body = entry['gz'] if gz else entry['body']
    if gz:
        headers.append(('Content-Encoding', 'gzip'))
    headers.append(('Content-Length', str(len(body))))
    return 200, headers, b'' if req.method == 'HEAD' else body


def _modules(entry):
    """Every script `entry` imports, directly or not, in the order they're found."""
    found = []
    queue = [entry]
    while queue:
        relative = queue.pop(0)
        if relative in found:
            continue
        found.append(relative)
        try:
            with open(os.path.join(ROOT, relative), encoding='utf-8') as f:
                source = f.read()
        except OSError:
            continue
        folder = os.path.dirname(relative)
        for m in IMPORT.finditer(source):
            queue.append(os.path.normpath(os.path.join(folder, m.group(3))))
    return found


def page(html):
    """index.html with the current version on its links to /assets, and every
    script the page needs announced up front, so the browser fetches them all at
    once rather than discovering them one import at a time."""
    v = version()
    html = PAGE_LINK.sub(lambda m: f'{m.group(1)}/assets/{m.group(2)}?v={v}{m.group(1)}', html)
    preload = _state['preload']
    if preload is None:
        preload = ''.join(f'  <link rel="modulepreload" href="/assets/{m}?v={v}">\n' for m in _modules('js/main.js')[1:])
        with _lock:
            if _state['version'] == v:
                _state['preload'] = preload
    return html.replace('</head>', preload + '</head>', 1)
