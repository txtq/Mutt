"""Turning a pasted URL into a link block (title, description, preview image).

Fetching happens server-side, so every hop is checked against private and
local addresses to keep the server from being used to reach its own network.
"""
import html
import ipaddress
import json
import os
import re
import socket
import ssl
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser

URL_RE = re.compile(r'^https?://[^\s<>"]+$', re.IGNORECASE)
UA = ('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 '
      '(KHTML, like Gecko) Version/17.0 Safari/605.1.15 Mutt/1.0')
ALLOWED_PORTS = {80, 443, 8080, 8443}
MAX_HTML = 1_500_000
MAX_PREVIEW_IMAGE = 6 * 1024 * 1024
MAX_IMAGE_FILE = 25 * 1024 * 1024
IMAGE_TYPES = {'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif'}


class Blocked(Exception):
    pass


def is_url(text):
    return len(text) <= 2048 and bool(URL_RE.match(text))


def domain(url):
    host = urllib.parse.urlsplit(url).hostname or ''
    return host[4:] if host.startswith('www.') else host


def _guard(url):
    parts = urllib.parse.urlsplit(url)
    if parts.scheme not in ('http', 'https') or not parts.hostname:
        raise Blocked('scheme')
    try:
        port = parts.port or (443 if parts.scheme == 'https' else 80)
    except ValueError:
        raise Blocked('port')
    if port not in ALLOWED_PORTS:
        raise Blocked('port')
    try:
        infos = socket.getaddrinfo(parts.hostname, port, type=socket.SOCK_STREAM)
    except (socket.gaierror, UnicodeError):
        raise Blocked('dns')
    for info in infos:
        address = ipaddress.ip_address(info[4][0].split('%')[0])
        if not address.is_global or address.is_multicast:
            raise Blocked('private address')


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _tls_context():
    """python.org builds on macOS ship without CA certificates; fall back to the system bundle."""
    context = ssl.create_default_context()
    if context.cert_store_stats().get('x509_ca'):
        return context
    try:
        import certifi
        context.load_verify_locations(certifi.where())
        return context
    except Exception:
        pass
    for path in ('/etc/ssl/cert.pem', '/etc/ssl/certs/ca-certificates.crt', '/etc/pki/tls/certs/ca-bundle.crt',
                 '/opt/homebrew/etc/ca-certificates/cert.pem', '/usr/local/etc/ca-certificates/cert.pem'):
        if os.path.exists(path):
            context.load_verify_locations(path)
            break
    return context


_opener = urllib.request.build_opener(_NoRedirect(), urllib.request.HTTPSHandler(context=_tls_context()))


def _open(url, accept, timeout=6):
    for _ in range(5):
        _guard(url)
        request = urllib.request.Request(url, headers={
            'User-Agent': UA, 'Accept': accept, 'Accept-Language': 'en-US,en;q=0.8',
        })
        try:
            return _opener.open(request, timeout=timeout)
        except urllib.error.HTTPError as err:
            location = err.headers.get('Location')
            err.close()
            if err.code in (301, 302, 303, 307, 308) and location:
                url = urllib.parse.urljoin(url, location)
                continue
            raise
    raise Blocked('too many redirects')


class _MetaParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.meta = {}
        self.title = ''
        self._in_title = False

    def handle_starttag(self, tag, attrs):
        attrs = {k.lower(): (v or '') for k, v in attrs}
        if tag == 'meta':
            key = (attrs.get('property') or attrs.get('name') or '').strip().lower()
            if key and 'content' in attrs and key not in self.meta:
                self.meta[key] = attrs['content'].strip()
        elif tag == 'title' and not self.title:
            self._in_title = True

    def handle_endtag(self, tag):
        if tag == 'title':
            self._in_title = False

    def handle_data(self, data):
        if self._in_title and len(self.title) < 400:
            self.title += data


def _charset(headers, data):
    charset = headers.get_content_charset()
    if not charset:
        found = re.search(rb'<meta[^>]+charset=["\']?([\w-]+)', data[:4096], re.IGNORECASE)
        charset = found.group(1).decode('ascii', 'ignore') if found else 'utf-8'
    return charset


def embed_url(url):
    parts = urllib.parse.urlsplit(url)
    host = (parts.hostname or '').lower()
    for prefix in ('www.', 'm.', 'music.'):
        if host.startswith(prefix):
            host = host[len(prefix):]
    video = ''
    if host == 'youtube.com':
        if parts.path == '/watch':
            video = urllib.parse.parse_qs(parts.query).get('v', [''])[0]
        else:
            found = re.match(r'^/(?:shorts|embed|live)/([\w-]+)', parts.path)
            video = found.group(1) if found else ''
    elif host == 'youtu.be':
        video = parts.path.lstrip('/').split('/')[0]
    if video and re.fullmatch(r'[\w-]{6,20}', video):
        return f'https://www.youtube-nocookie.com/embed/{video}'
    if host == 'vimeo.com':
        found = re.match(r'^/(\d+)', parts.path)
        if found:
            return f'https://player.vimeo.com/video/{found.group(1)}'
    return None


def _clip(value, limit):
    value = re.sub(r'\s+', ' ', html.unescape(value or '')).strip()
    return value[:limit]


def _fetch_image(url, limit):
    try:
        with _open(url, 'image/avif,image/webp,image/*;q=0.9') as resp:
            ext = IMAGE_TYPES.get(resp.headers.get_content_type())
            if not ext:
                return None
            data = resp.read(limit + 1)
            if len(data) > limit or not data:
                return None
            return data, ext
    except Exception:
        return None


def _oembed(url, embed):
    """YouTube and Vimeo hide their titles from servers; their oEmbed endpoints don't."""
    if 'youtube' in embed:
        endpoint = 'https://www.youtube.com/oembed?format=json&url='
    else:
        endpoint = 'https://vimeo.com/api/oembed.json?url='
    try:
        with _open(endpoint + urllib.parse.quote(url, safe=''), 'application/json') as resp:
            data = json.loads(resp.read(200_000))
    except Exception:
        return None
    info = {'title': _clip(data.get('title'), 200), 'siteName': _clip(data.get('provider_name'), 80)}
    if data.get('author_name'):
        info['description'] = _clip(data['author_name'], 200)
    preview = _fetch_image(data['thumbnail_url'], MAX_PREVIEW_IMAGE) if data.get('thumbnail_url') else None
    return info, preview


def inspect(url):
    """Returns (info, preview_image, direct_image).

    info is metadata for a link block. If the URL itself is an image,
    direct_image is (bytes, ext, mime) so it can become an image block.
    """
    info = {'url': url, 'domain': domain(url)}
    embed = embed_url(url)
    if embed:
        info['embed'] = embed
        found = _oembed(url, embed)
        if found:
            info.update({k: v for k, v in found[0].items() if v})
            return info, found[1], None
    try:
        resp = _open(url, 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5')
    except Exception:
        return info, None, None
    with resp:
        final = resp.geturl()
        ctype = resp.headers.get_content_type()
        if ctype in IMAGE_TYPES:
            data = resp.read(MAX_IMAGE_FILE + 1)
            if 0 < len(data) <= MAX_IMAGE_FILE:
                return info, None, (data, IMAGE_TYPES[ctype], ctype)
            return info, None, None
        if 'html' not in ctype:
            return info, None, None
        data = resp.read(MAX_HTML)
    parser = _MetaParser()
    try:
        parser.feed(data.decode(_charset(resp.headers, data), 'replace'))
    except Exception:
        pass
    meta = parser.meta
    title = meta.get('og:title') or meta.get('twitter:title') or parser.title
    description = meta.get('og:description') or meta.get('description') or meta.get('twitter:description')
    if title:
        info['title'] = _clip(title, 200)
    if description:
        info['description'] = _clip(description, 600)
    if meta.get('og:site_name'):
        info['siteName'] = _clip(meta['og:site_name'], 80)
    image_url = (meta.get('og:image') or meta.get('og:image:url') or meta.get('og:image:secure_url')
                 or meta.get('twitter:image') or meta.get('twitter:image:src'))
    preview = None
    if image_url:
        preview = _fetch_image(urllib.parse.urljoin(final, html.unescape(image_url)), MAX_PREVIEW_IMAGE)
    return info, preview, None
