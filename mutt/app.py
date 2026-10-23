"""The WSGI application: dispatch, sessions, static files, security headers."""
import mimetypes
import os
import traceback
import urllib.parse
from email.utils import formatdate, parsedate_to_datetime

from . import api  # noqa: F401  (registers routes)
from . import auth, db
from .web import HttpError, Request, Response, file_response, json_response, match, status_line

APP_CSP = '; '.join([
    "default-src 'self'",
    "script-src 'self' https://cdnjs.cloudflare.com",
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
    relative = req.path[len('/assets/'):]
    root = os.path.join(db.PUBLIC_DIR, 'assets')
    path = os.path.realpath(os.path.join(root, relative))
    if not path.startswith(os.path.realpath(root) + os.sep) or not os.path.isfile(path):
        raise HttpError(404, 'Not found.')
    content_type = mimetypes.guess_type(path)[0] or 'application/octet-stream'
    if content_type.startswith('text/'):
        content_type += '; charset=utf-8'
    modified = os.stat(path).st_mtime
    since = req.header('If-Modified-Since')
    if since:
        try:
            if int(modified) <= parsedate_to_datetime(since).timestamp():
                return Response(304, [('Cache-Control', 'no-cache')], b'')
        except (TypeError, ValueError):
            pass
    return file_response(req, path, content_type, cache='no-cache',
                         headers=[('Last-Modified', formatdate(modified, usegmt=True))])


def index(req):
    with open(os.path.join(db.PUBLIC_DIR, 'index.html'), 'rb') as f:
        body = f.read()
    return Response(200, [
        ('Content-Type', 'text/html; charset=utf-8'),
        ('Content-Length', str(len(body))),
        ('Cache-Control', 'no-cache'),
        ('Content-Security-Policy', APP_CSP),
        ('X-Frame-Options', 'DENY'),
    ], body)


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
    headers = resp.headers + req.extra_headers + [
        ('X-Content-Type-Options', 'nosniff'),
        ('Referrer-Policy', 'same-origin'),
    ]
    if not any(name == 'X-Frame-Options' for name, _ in headers):
        headers.append(('X-Frame-Options', 'SAMEORIGIN'))
    start_response(status_line(resp.status), headers)
    return resp.body
