"""Sorting uploads into kinds — the basis for bundles."""
import mimetypes
import os
import re

KINDS = ['image', 'video', 'audio', 'pdf', 'text', 'link', 'doc', 'code', 'archive', 'other']

_EXTENSIONS = {
    'image': 'jpg jpeg jfif png gif webp avif bmp svg ico apng heic heif tif tiff',
    'video': 'mp4 m4v mov webm ogv mkv avi wmv mpg mpeg 3gp',
    'audio': 'mp3 wav m4a aac ogg oga opus flac aif aiff wma mid midi',
    'pdf': 'pdf',
    'doc': 'doc docx odt rtf pages txt md markdown xls xlsx ods csv tsv numbers ppt pptx odp key epub tex',
    'code': ('js mjs cjs ts tsx jsx py rb go rs java kt swift c h cc cpp hpp cs php html htm css scss '
             'sass less json yaml yml toml xml sh bash zsh sql lua r ipynb vue svelte'),
    'archive': 'zip rar 7z tar gz tgz bz2 xz dmg iso',
}
KIND_OF_EXT = {ext: kind for kind, exts in _EXTENSIONS.items() for ext in exts.split()}

# Files whose first few KB make a useful preview.
TEXTY = set('txt md markdown csv tsv tex'.split()) | (set(_EXTENSIONS['code'].split()) - {'ipynb'})

WEB_IMAGES = {
    'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'image/bmp',
    'image/x-icon', 'image/vnd.microsoft.icon', 'image/apng',
}
_MIME_RE = re.compile(r'^[a-z0-9][a-z0-9.+-]*/[a-z0-9][a-z0-9.+-]*$')


def extension(filename):
    ext = os.path.splitext(filename)[1].lower().lstrip('.')
    return ext if re.fullmatch(r'[a-z0-9]{1,10}', ext) else ''


def clean_mime(mime, filename):
    mime = (mime or '').split(';')[0].strip().lower()
    if not mime or mime == 'application/octet-stream' or not _MIME_RE.match(mime):
        guessed = mimetypes.guess_type(filename)[0]
        mime = guessed or 'application/octet-stream'
    return mime


def detect(mime, ext):
    if ext in KIND_OF_EXT:
        return KIND_OF_EXT[ext]
    if mime == 'application/pdf':
        return 'pdf'
    for kind in ('image', 'video', 'audio'):
        if mime.startswith(kind + '/'):
            return kind
    if mime.startswith('text/'):
        return 'doc'
    return 'other'


def serving(kind, mime, ext):
    """(content_type, inline, sandbox) for serving a stored file back."""
    if ext == 'svg' or mime == 'image/svg+xml':
        return 'image/svg+xml', True, True
    if kind == 'image' and mime in WEB_IMAGES:
        return mime, True, True
    if kind in ('video', 'audio') and mime.startswith(kind + '/'):
        return mime, True, True
    if kind == 'pdf':
        return 'application/pdf', True, False
    if ext in TEXTY or mime.startswith('text/'):
        return 'text/plain; charset=utf-8', True, True
    return mime or 'application/octet-stream', False, True


def thumb_type(data):
    """Recognise the image formats we accept as thumbnails by their magic bytes."""
    if data[:3] == b'\xff\xd8\xff':
        return 'jpg', 'image/jpeg'
    if data[:8] == b'\x89PNG\r\n\x1a\n':
        return 'png', 'image/png'
    if data[:4] == b'RIFF' and data[8:12] == b'WEBP':
        return 'webp', 'image/webp'
    if data[:6] in (b'GIF87a', b'GIF89a'):
        return 'gif', 'image/gif'
    if data[4:12] in (b'ftypavif', b'ftypavis'):
        return 'avif', 'image/avif'
    return None, None


THUMB_TYPES = {'jpg': 'image/jpeg', 'png': 'image/png', 'webp': 'image/webp', 'gif': 'image/gif', 'avif': 'image/avif'}
