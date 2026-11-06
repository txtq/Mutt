"""The WSGI application: dispatch, sessions, static files, security headers."""
import gzip
import mimetypes
import os
import traceback
import urllib.parse

from . import api  # noqa: F401  (registers routes)
from . import assets, auth, db
from .web import HttpError, Request, Response, json_response, match, status_line

APP_CSP = '; '.join([
    "default-src 'self'",
    "script-src 'self' https://cdnjs.cloudflare.com 'wasm-unsafe-eval'",  # the picture reader runs WebAssembly
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' blob: data:",
    "media-src 'self' blob:",
    "connect-src 'self' https://cdnjs.cloudflare.com",
    "worker-src 'self' blob:",
    "frame-src 'self' https://www.youtube-nocookie.com https://player.vimeo.com",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
])

mimetypes.add_type('text/javascript', '.js')
mimetypes.add_type('text/javascript', '.mjs')
mimetypes.add_type('text/css', '.css')

API_PREFIXES = ('/api/', '/f/', '/t/')


def check_origin(req):
    if req.header('X-Mutt') != '1':
        raise HttpError(403, 'Requests need to come from Mutt itself.')
    origin = req.header('Origin')
    if origin and origin != 'null' and urllib.parse.urlsplit(origin).netloc != req.host:
        raise HttpError(403, 'Requests need to come from Mutt itself.')


def static(req):
    relative = assets.find(req.path[len('/assets/'):])
    if not relative:
        raise HttpError(404, 'Not found.')
    status, headers, body = assets.serve(req, relative)
    return Response(status, headers, body)


def index(req):
    with open(os.path.join(db.PUBLIC_DIR, 'index.html'), encoding='utf-8') as f:
        body = assets.page(f.read()).encode('utf-8')
    return Response(200, [
        ('Content-Type', 'text/html; charset=utf-8'),
        ('Content-Length', str(len(body))),
        ('Cache-Control', 'no-cache'),
        ('Content-Security-Policy', APP_CSP),
        ('X-Frame-Options', 'DENY'),
    ], body)


def compress(req, resp):
    """Gzips a finished text response (the API's JSON, the page) when the browser can take it."""
    # Streamed files (uploads, downloads) are left alone.
    if not isinstance(resp.body, list) or len(resp.body) != 1 or len(resp.body[0]) < assets.MIN_GZIP or not assets.accepts_gzip(req):
        return
    names = {name.lower(): value for name, value in resp.headers}
    if 'content-encoding' in names or not assets.compressible(names.get('content-type', '')):
        return
    body = gzip.compress(resp.body[0], 6)
    resp.headers = [(n, v) for n, v in resp.headers if n.lower() != 'content-length'] + [
        ('Content-Encoding', 'gzip'),
        ('Content-Length', str(len(body))),
        ('Vary', 'Accept-Encoding'),
    ]
    resp.body = [body]


def dispatch(req):
    if req.path.startswith(API_PREFIXES):
        found = match(req.method, req.path)
        if not found:
            raise HttpError(404, 'Not found.')
        handler, params, needs_user = found
        if req.method not in ('GET', 'HEAD'):
            check_origin(req)
        req.db = db.connect()
        req.session_token = req.cookie(auth.SESSION_COOKIE)
        req.user, refreshed = auth.session_user(req.db, req.session_token)
        if refreshed:
            req.extra_headers.append(auth.cookie_header(req, req.session_token))
        if needs_user and not req.user:
            raise HttpError(401, 'Please sign in.')
        return handler(req, **params)
    if req.method not in ('GET', 'HEAD'):
        raise HttpError(405, 'Method not allowed.')
    if req.path.startswith('/assets/'):
        return static(req)
    if req.path in ('/favicon.ico', '/robots.txt'):
        return Response(404, [('Content-Length', '0')], b'')
    return index(req)


def application(environ, start_response):
    req = Request(environ)
    try:
        resp = dispatch(req)
    except HttpError as err:
        extra = {k: v for k, v in err.extra.items() if v is not None}
        resp = json_response({'error': err.message, **extra}, err.status)
    except Exception:
        traceback.print_exc()
        resp = json_response({'error': 'Something went wrong on our side.'}, 500)
    finally:
        if req.db is not None:
            req.db.close()
    if req.method != 'HEAD':
        compress(req, resp)
    headers = resp.headers + req.extra_headers + [
        ('X-Content-Type-Options', 'nosniff'),
        ('Referrer-Policy', 'same-origin'),
    ]
    if not any(name == 'X-Frame-Options' for name, _ in headers):
        headers.append(('X-Frame-Options', 'SAMEORIGIN'))
    start_response(status_line(resp.status), headers)
    return resp.body
