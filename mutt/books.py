"""Books: telling which files are books, reading an EPUB's insides for the
reader, and whether a planet is being used as a bookshelf.

The reader itself runs in the browser. The server opens EPUBs (they're zip
files) and hands the reader one chapter or picture at a time; it never runs
anything from inside a book. A PDF turned into reading format is made in the
browser (pdf.js) and kept here as JSON.
"""
import posixpath
import re
import threading
import urllib.parse
import xml.etree.ElementTree as ET
import zipfile
from collections import OrderedDict

BOOK_EXTS = ('epub',)
MAX_ENTRY = 24 * 1024 * 1024  # biggest single file read out of a book
MAX_SPINE = 2000

# Words that give away a book inside a PDF's first pages.
BOOK_HINTS = {
    'isbn': re.compile(r'\bISBN(?:-1[03])?[:\s]*[\d-]{9,}', re.I),
    'copyright': re.compile(r'(?:©|\(c\)|copyright)\s*(?:©\s*)?(?:1[89]|20)\d\d|all rights reserved|first published', re.I),
    'contents': re.compile(r'^\s*(?:table of )?contents\s*$', re.I | re.M),
    'chapter': re.compile(r'^\s*(?:chapter|part)\s+(?:\d+|[ivxlc]+|one|two|three|first)\b', re.I | re.M),
    'novel': re.compile(r'\ba novel\b|\bprologue\b|\bepilogue\b|\backnowledg(?:e)?ments\b|\bdedicat(?:ed|ion)\b', re.I),
}
NAME_HINTS = re.compile(r'\b(?:e-?book|novel|z-lib|libgen|annas?-archive|gutenberg|edition|vol(?:ume)?\.?\s*\d)\b', re.I)
NOT_BOOKS = re.compile(r'\b(?:invoice|receipt|statement|payslip|contract|form|cv|resume|slides?|deck|'
                       r'worksheet|menu|ticket|boarding|itinerary|report|minutes|agenda|syllabus)\b', re.I)
SHELF_NAMES = re.compile(r'\b(?:books?|reading|read|library|novels?|bookshelf|shelf|tbr|kindle|ebooks?|'
                         r'fiction|non-?fiction|literature|classics|poetry)\b', re.I)


def hints(text):
    """The book giveaways in a PDF's text, kept at upload as meta.bookish."""
    head = (text or '')[:60000]
    return sorted(name for name, rx in BOOK_HINTS.items() if rx.search(head))


def pages_of(meta):
    pages = meta.get('pages') or (meta.get('media') or {}).get('pages')
    return pages if isinstance(pages, int) else 0


def book_format(row, meta):
    """'epub' or 'pdf' when a file is one the reader can open, else None."""
    ext = (row['ext'] or '').lower()
    if ext in BOOK_EXTS or row['mime'] == 'application/epub+zip':
        return 'epub'
    if row['kind'] == 'pdf':
        return 'pdf'
    return None


def is_book(row, meta):
    """Does this file look like a book? (EPUBs always; PDFs by their signs.)"""
    fmt = book_format(row, meta)
    if fmt == 'epub':
        return True
    if fmt != 'pdf':
        return False
    name = ' '.join([row['file_name'] or '', row['title'] or ''])
    if meta.get('doctype') or NOT_BOOKS.search(name):
        return False
    pages = pages_of(meta)
    found = set(meta.get('bookish') or [])
    gist = ' '.join(meta.get('gist') or []) if isinstance(meta.get('gist'), list) else str(meta.get('gist') or '')
    if re.search(r'\bchapter\b', gist, re.I):
        found.add('chapter')
    author = bool((meta.get('media') or {}).get('author'))
    named = bool(NAME_HINTS.search(name))
    score = len(found) + named + (author and pages >= 40)
    if pages >= 120:
        return score >= 1 or pages >= 200
    if pages >= 40:
        return score >= 2
    return pages >= 20 and score >= 3


def kind_words(epubs, pdfs):
    parts = []
    both = epubs and pdfs
    if epubs:
        parts.append(f'{epubs} EPUB' if epubs == 1 and both else 'one EPUB' if epubs == 1 else f'{epubs} EPUBs')
    if pdfs:
        n = f'{pdfs}' if both else 'one' if pdfs == 1 else f'{pdfs}'
        parts.append(f'{n} PDF that reads like a book' if pdfs == 1 else f'{n} PDFs that read like books')
    return ' and '.join(parts)


def shelf_signs(title, files):
    """Whether a planet is being used to keep books, in plain words.
    files: [(row, meta)]. {'fits', 'signs', 'books', 'pdfs'}."""
    n = len(files)
    books = [(r, m) for r, m in files if is_book(r, m)]
    epubs = sum(1 for r, m in books if book_format(r, m) == 'epub')
    pdfs = len(books) - epubs
    named = bool(SHELF_NAMES.search(title or ''))
    signs = []
    if named:
        signs.append(f'It’s called “{title}”, which sounds like a bookshelf.')
    if books:
        what = kind_words(epubs, pdfs)
        if len(books) == n:
            signs.append(f'Everything on it is a book: {what}.' if n > 1 else f'Its one file is a book ({what}).')
        else:
            signs.append(f'{len(books)} of its {n} files are books: {what}.')
    fits = bool(books) and (len(books) >= 0.5 * n or (named and len(books) >= 1) or len(books) >= 3)
    return {'fits': fits, 'signs': signs, 'books': [r['id'] for r, _ in books], 'pdfs': pdfs}


# ---------------------------------------------------------------- inside an EPUB

def _local(tag):
    return tag.rsplit('}', 1)[-1].lower() if isinstance(tag, str) else ''


def _xml(z, name):
    info = z.getinfo(name)
    if info.file_size > MAX_ENTRY:
        raise ValueError('too big')
    raw = z.read(name)
    # No DTDs: a book has no need of them, and they're how XML files misbehave.
    raw = re.sub(rb'<!DOCTYPE[^>\[]*(\[[^\]]*\])?>', b'', raw, count=1)
    return ET.fromstring(raw)


def _text_len(z, name):
    try:
        info = z.getinfo(name)
        if info.file_size > MAX_ENTRY:
            return 0
        raw = z.read(name).decode('utf-8', 'replace')
    except (KeyError, zipfile.BadZipFile, OSError):
        return 0
    raw = re.sub(r'(?is)<(script|style|head)\b.*?</\1>', ' ', raw)
    raw = re.sub(r'<[^>]+>', ' ', raw)
    raw = re.sub(r'&#?\w+;', 'x', raw)
    return len(re.sub(r'\s+', ' ', raw).strip())


def _join(base, href):
    href = urllib.parse.unquote(href.split('#', 1)[0])
    return posixpath.normpath(posixpath.join(posixpath.dirname(base), href)).lstrip('/')


def _nav_toc(z, path):
    """EPUB 3: the <nav epub:type="toc"> list."""
    root = _xml(z, path)
    out = []
    for nav in root.iter():
        if _local(nav.tag) != 'nav':
            continue
        kind = ' '.join(v for k, v in nav.attrib.items() if _local(k) == 'type')
        if 'toc' not in kind.split():
            continue

        def walk(el, level):
            for li in el:
                if _local(li.tag) != 'li':
                    continue
                link = next((a for a in li.iter() if _local(a.tag) in ('a', 'span')), None)
                if link is not None:
                    title = re.sub(r'\s+', ' ', ''.join(link.itertext())).strip()
                    href = link.get('href')
                    if title and href:
                        out.append({'title': title[:200], 'href': _join(path, href),
                                    'anchor': href.split('#', 1)[1] if '#' in href else None, 'level': level})
                for sub in li:
                    if _local(sub.tag) == 'ol':
                        walk(sub, level + 1)

        for ol in nav:
            if _local(ol.tag) == 'ol':
                walk(ol, 0)
        break
    return out


def _ncx_toc(z, path):
    """EPUB 2: toc.ncx's navPoints."""
    root = _xml(z, path)
    out = []

    def walk(el, level):
        for point in el:
            if _local(point.tag) != 'navpoint':
                continue
            label = next((t for t in point.iter() if _local(t.tag) == 'text'), None)
            content = next((c for c in point if _local(c.tag) == 'content'), None)
            if label is not None and content is not None and content.get('src'):
                title = re.sub(r'\s+', ' ', ''.join(label.itertext())).strip()
                src = content.get('src')
                if title:
                    out.append({'title': title[:200], 'href': _join(path, src),
                                'anchor': src.split('#', 1)[1] if '#' in src else None, 'level': level})
            walk(point, level + 1)

    for child in root:
        if _local(child.tag) == 'navmap':
            walk(child, 0)
    return out


def read_epub(path):
    """What the reader needs to know about an EPUB, or None when it can't be read."""
    try:
        with zipfile.ZipFile(path) as z:
            names = set(z.namelist())
            container = _xml(z, 'META-INF/container.xml')
            opf_path = next((el.get('full-path') for el in container.iter()
                             if _local(el.tag) == 'rootfile' and el.get('full-path')), None)
            if not opf_path or opf_path not in names:
                opf_path = next((n for n in names if n.endswith('.opf')), None)
            if not opf_path:
                return None
            opf = _xml(z, opf_path)
            meta = {}
            cover_id = None
            for el in opf.iter():
                tag = _local(el.tag)
                text = re.sub(r'\s+', ' ', ''.join(el.itertext())).strip()
                if tag in ('title', 'creator', 'language', 'publisher', 'date', 'description') and text:
                    meta.setdefault(tag, text[:400])
                if tag == 'meta' and el.get('name') == 'cover':
                    cover_id = el.get('content')
            manifest, by_id = {}, {}
            for el in opf.iter():
                if _local(el.tag) == 'item' and el.get('href'):
                    item = {'id': el.get('id'), 'href': _join(opf_path, el.get('href')),
                            'type': el.get('media-type') or '', 'props': (el.get('properties') or '').split()}
                    manifest[item['href']] = item
                    if item['id']:
                        by_id[item['id']] = item
            cover = None
            for item in by_id.values():
                if 'cover-image' in item['props']:
                    cover = item['href']
            if not cover and cover_id in by_id and by_id[cover_id]['type'].startswith('image/'):
                cover = by_id[cover_id]['href']
            if not cover:
                cover = next((i['href'] for i in by_id.values() if i['type'].startswith('image/')
                              and 'cover' in (i['id'] or '').lower() + i['href'].lower()), None)
            spine_el = next((el for el in opf.iter() if _local(el.tag) == 'spine'), None)
            spine = []
            rtl = spine_el is not None and spine_el.get('page-progression-direction') == 'rtl'
            if spine_el is not None:
                for ref in spine_el:
                    item = by_id.get(ref.get('idref'))
                    if not item or item['href'] not in names:
                        continue
                    if 'html' not in item['type'] and not item['href'].lower().endswith(('.html', '.htm', '.xhtml')):
                        continue
                    spine.append({'href': item['href'], 'chars': _text_len(z, item['href']),
                                  'linear': ref.get('linear') != 'no'})
                    if len(spine) >= MAX_SPINE:
                        break
            toc = []
            nav = next((i for i in by_id.values() if 'nav' in i['props']), None)
            try:
                if nav and nav['href'] in names:
                    toc = _nav_toc(z, nav['href'])
                if not toc:
                    ncx = next((i for i in by_id.values() if i['type'] == 'application/x-dtbncx+xml'), None)
                    if ncx and ncx['href'] in names:
                        toc = _ncx_toc(z, ncx['href'])
            except (ET.ParseError, ValueError, KeyError):
                toc = []
            return {
                'title': meta.get('title'), 'author': meta.get('creator'), 'language': meta.get('language'),
                'publisher': meta.get('publisher'), 'date': meta.get('date'),
                'cover': cover if cover in names else None, 'spine': spine, 'toc': toc[:3000],
                'dir': 'rtl' if rtl else 'ltr',
            }
    except (zipfile.BadZipFile, ET.ParseError, KeyError, ValueError, OSError, UnicodeError):
        return None


_cache = OrderedDict()
_cache_lock = threading.Lock()


def epub(path, stamp):
    """read_epub, remembered for the last few books opened."""
    key = (path, stamp)
    with _cache_lock:
        if key in _cache:
            _cache.move_to_end(key)
            return _cache[key]
    found = read_epub(path)
    with _cache_lock:
        _cache[key] = found
        while len(_cache) > 24:
            _cache.popitem(last=False)
    return found


SAFE_TYPES = {
    'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'gif': 'image/gif', 'webp': 'image/webp',
    'avif': 'image/avif', 'bmp': 'image/bmp',
}


def epub_part(path, name):
    """(bytes, content type) of one file inside an EPUB. Pages come back as plain
    text: the reader parses them and keeps only what's safe."""
    with zipfile.ZipFile(path) as z:
        info = z.getinfo(name)
        if info.file_size > MAX_ENTRY:
            raise ValueError('too big')
        data = z.read(name)
    ext = name.rsplit('.', 1)[-1].lower() if '.' in name else ''
    return data, SAFE_TYPES.get(ext, 'text/plain; charset=utf-8')
