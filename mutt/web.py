"""Tiny WSGI toolkit: requests, responses, routing and file streaming."""
import http
import json
import os
import re
import urllib.parse

_ON_RAILWAY = bool(os.environ.get('RAILWAY_ENVIRONMENT_ID') or os.environ.get('RAILWAY_ENVIRONMENT_NAME'))
# Behind a hosting proxy (Railway always is), trust its forwarded IP and HTTPS headers.
TRUST_PROXY = os.environ.get('MUTT_TRUST_PROXY', '1' if _ON_RAILWAY else '').lower() in ('1', 'true', 'yes', 'on')
CHUNK = 256 * 1024


class HttpError(Exception):
    def __init__(self, status, message='', **extra):
        super().__init__(message)
        self.status = status
        self.message = message
        self.extra = extra


class Response:
    def __init__(self, status=200, headers=None, body=b''):
        self.status = status
        self.headers = list(headers or [])
        self.body = [body] if isinstance(body, bytes) else body


def status_line(code):
    try:
        return f'{code} {http.HTTPStatus(code).phrase}'
    except ValueError:
        return f'{code} Unknown'


def json_response(data, status=200, headers=()):
    body = json.dumps(data, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
    return Response(status, [
        ('Content-Type', 'application/json; charset=utf-8'),
        ('Content-Length', str(len(body))),
        ('Cache-Control', 'no-store'),
        *headers,
    ], body)


class Request:
    MAX_JSON = 4 * 1024 * 1024

    def __init__(self, environ):
        self.environ = environ
        self.method = environ['REQUEST_METHOD'].upper()
        raw = environ.get('PATH_INFO') or '/'
        try:
            self.path = raw.encode('latin-1').decode('utf-8')
        except UnicodeError:
            self.path = raw
        self.query = urllib.parse.parse_qs(environ.get('QUERY_STRING', ''), keep_blank_values=True)
        self.user = None
        self.session_token = None
        self.db = None
        self.extra_headers = []

    def arg(self, name, default=None):
        values = self.query.get(name)
        return values[0] if values else default

    def header(self, name):
        key = name.upper().replace('-', '_')
        if key in ('CONTENT_TYPE', 'CONTENT_LENGTH'):
            return self.environ.get(key)
        return self.environ.get('HTTP_' + key)

    @property
    def content_length(self):
        try:
            return int(self.environ.get('CONTENT_LENGTH') or 0)
        except ValueError:
            return 0

    @property
    def body_stream(self):
        return self.environ['wsgi.input']

    def json(self):
        length = self.content_length
        if length > self.MAX_JSON:
            raise HttpError(413, 'That request is too large.')
        raw = self.body_stream.read(length) if length else b''
        if not raw:
            return {}
        try:
            data = json.loads(raw)
        except ValueError:
            raise HttpError(400, 'Could not read that request.')
        if not isinstance(data, dict):
            raise HttpError(400, 'Could not read that request.')
        return data

    def read_bytes(self, limit):
        length = self.content_length
        if length > limit:
            raise HttpError(413, 'That file is too large.')
        return self.body_stream.read(length) if length else b''

    def cookie(self, name):
        raw = self.environ.get('HTTP_COOKIE', '')
        for part in raw.split(';'):
            key, _, value = part.strip().partition('=')
            if key == name:
                return value
        return None

    @property
    def is_secure(self):
        if TRUST_PROXY and (self.header('X-Forwarded-Proto') or '').lower() == 'https':
            return True
        return self.environ.get('wsgi.url_scheme') == 'https'

    @property
    def host(self):
        if TRUST_PROXY and self.header('X-Forwarded-Host'):
            return self.header('X-Forwarded-Host').split(',')[0].strip()
        return self.header('Host') or ''

    @property
    def client_ip(self):
        if TRUST_PROXY:
            forwarded = self.header('X-Forwarded-For')
            if forwarded:
                return forwarded.split(',')[0].strip()
        return self.environ.get('REMOTE_ADDR', '')


_routes = []


def route(method, pattern, auth=True):
    regex = re.compile('^' + pattern + '$')

    def register(fn):
        _routes.append((method, regex, fn, auth))
        return fn
    return register


def match(method, path):
    allowed = False
    for route_method, regex, fn, auth in _routes:
        found = regex.match(path)
        if not found:
            continue
        if route_method == method or (route_method == 'GET' and method == 'HEAD'):
            return fn, found.groupdict(), auth
        allowed = True
    if allowed:
        raise HttpError(405, 'Method not allowed.')
    return None


def content_disposition(kind, filename):
    fallback = re.sub(r'[^A-Za-z0-9._ -]', '_', filename)[:150] or 'file'
    quoted = urllib.parse.quote(filename, safe='')
    return f'{kind}; filename="{fallback}"; filename*=UTF-8\'\'{quoted}'


def _iter_file(path, start, length):
    with open(path, 'rb') as f:
        f.seek(start)
        remaining = length
        while remaining > 0:
            chunk = f.read(min(CHUNK, remaining))
            if not chunk:
                break
            remaining -= len(chunk)
            yield chunk


_RANGE = re.compile(r'^bytes=(\d*)-(\d*)$')


def file_response(req, path, content_type, *, filename=None, disposition='inline',
                  headers=(), cache='private, max-age=31536000, immutable'):
    try:
        st = os.stat(path)
    except FileNotFoundError:
        raise HttpError(404, 'File not found.')
    size = st.st_size
    etag = '"%x-%x"' % (int(st.st_mtime), size)
    out = [
        ('Content-Type', content_type),
        ('Accept-Ranges', 'bytes'),
        ('ETag', etag),
        ('Cache-Control', cache),
        *headers,
    ]
    if filename:
        out.append(('Content-Disposition', content_disposition(disposition, filename)))
    if req.header('If-None-Match') == etag:
        return Response(304, out, b'')

    start, end, status = 0, size - 1, 200
    requested = (req.header('Range') or '').strip()
    found = _RANGE.match(requested) if requested and size else None
    if found and (found.group(1) or found.group(2)):
        first, last = found.groups()
        if first == '':
            start = max(0, size - int(last))
        else:
            start = int(first)
            end = min(int(last), size - 1) if last else size - 1
        if start > end or start >= size:
            return Response(416, [('Content-Range', f'bytes */{size}')], b'')
        status = 206
        out.append(('Content-Range', f'bytes {start}-{end}/{size}'))
    length = max(0, end - start + 1)
    out.append(('Content-Length', str(length)))
    body = [] if req.method == 'HEAD' else _iter_file(path, start, length)
    return Response(status, out, body)


def stream_to_file(req, path, limit):
    """Write the raw request body to `path`; returns the number of bytes written."""
    length = req.content_length
    if length <= 0:
        raise HttpError(411, 'The upload was empty.')
    if length > limit:
        raise HttpError(413, f'Files can be up to {limit // (1024 * 1024)} MB.')
    tmp = path + '.part'
    remaining = length
    try:
        with open(tmp, 'wb') as f:
            while remaining > 0:
                chunk = req.body_stream.read(min(1024 * 1024, remaining))
                if not chunk:
                    break
                f.write(chunk)
                remaining -= len(chunk)
        if remaining:
            raise HttpError(400, 'The upload was interrupted.')
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)
    return length
