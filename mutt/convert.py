"""Turning a stored document file into a Mutt document.

Word (.docx), OpenDocument (.odt), RTF, plain text and Markdown are read into
a short list of blocks (headings, paragraphs, lists, quotes, tables, pictures,
page breaks), each paragraph a list of runs of text with bold, italic,
underline and strike. From that come the editor's HTML (built here, every word
escaped, so it is safe by construction and also passes `documents.clean_html`)
and the note's Markdown (what the rest of Mutt reads). No libraries: zip and
XML from the standard library.

PDFs are turned into documents in the browser (`pdfbook.js` reads them far
better than the server can) and arrive here as HTML and Markdown already.
"""

import html
import posixpath
import re
import zipfile
from xml.etree import ElementTree as ET

# What can be made into a document. A PDF too, through the browser.
CONVERTIBLE = {'docx', 'odt', 'rtf', 'txt', 'text', 'md', 'markdown'}
PLAIN = {'txt', 'text', 'md', 'markdown'}

MAX_BLOCKS = 6000
MAX_PICTURES = 40
MAX_PICTURE = 8 * 1024 * 1024
PICTURE_TYPES = {'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'gif': 'image/gif',
                 'webp': 'image/webp'}

W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
R_NS = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
A_NS = '{http://schemas.openxmlformats.org/drawingml/2006/main}'
REL = '{http://schemas.openxmlformats.org/package/2006/relationships}'
TEXT = '{urn:oasis:names:tc:opendocument:xmlns:text:1.0}'
TABLE = '{urn:oasis:names:tc:opendocument:xmlns:table:1.0}'
STYLE = '{urn:oasis:names:tc:opendocument:xmlns:style:1.0}'
FO = '{urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0}'
DRAW = '{urn:oasis:names:tc:opendocument:xmlns:drawing:1.0}'
XLINK = '{http://www.w3.org/1999/xlink}'
OFFICE = '{urn:oasis:names:tc:opendocument:xmlns:office:1.0}'


class Unreadable(Exception):
    """The file couldn't be read as a document."""


def can_convert(ext):
    return (ext or '').lower() in CONVERTIBLE


# ---------------------------------------------------------------- the shape of a document
#
#   {'t': 'h1'|'h2'|'h3'|'p'|'quote'|'title'|'subtitle', 'runs': [...], 'align': 'center'|None}
#   {'t': 'list', 'ordered': bool, 'items': [{'runs': [...], 'level': 0}]}
#   {'t': 'table', 'rows': [[runs, runs], ...]}
#   {'t': 'img', 'name': 'word/media/image1.png'}
#   {'t': 'pb'}
# A run is {'x': text, 'b': bool, 'i': bool, 'u': bool, 's': bool, 'href': str|None, 'br': bool}


def _run(text, b=False, i=False, u=False, s=False, href=None):
    return {'x': text, 'b': b, 'i': i, 'u': u, 's': s, 'href': href}


def _plain(runs):
    return ''.join('\n' if r.get('br') else r['x'] for r in runs)


def _has_words(runs):
    return any(r['x'].strip() for r in runs if not r.get('br'))


# ---------------------------------------------------------------- Word

def _on(el, tag):
    """Is a Word switch (w:b, w:i...) set in this run's properties?"""
    if el is None:
        return False
    found = el.find(W + tag)
    if found is None:
        return False
    return found.get(W + 'val', 'true').lower() not in ('0', 'false', 'none', 'off')


def _docx(z):
    names = set(z.namelist())
    if 'word/document.xml' not in names:
        raise Unreadable('This Word file has no document inside.')
    root = ET.fromstring(z.read('word/document.xml'))

    rels = {}
    if 'word/_rels/document.xml.rels' in names:
        for r in ET.fromstring(z.read('word/_rels/document.xml.rels')).iter(REL + 'Relationship'):
            rels[r.get('Id')] = (r.get('Target') or '', r.get('TargetMode') == 'External')

    styles = {}
    if 'word/styles.xml' in names:
        for st in ET.fromstring(z.read('word/styles.xml')).iter(W + 'style'):
            name = st.find(W + 'name')
            styles[st.get(W + 'styleId')] = (name.get(W + 'val') if name is not None else '').lower()

    ordered_lists = set()  # (numId, level) pairs that count rather than bullet
    if 'word/numbering.xml' in names:
        numbering = ET.fromstring(z.read('word/numbering.xml'))
        abstract = {}
        for an in numbering.iter(W + 'abstractNum'):
            levels = {}
            for lvl in an.iter(W + 'lvl'):
                fmt = lvl.find(W + 'numFmt')
                levels[lvl.get(W + 'ilvl')] = fmt.get(W + 'val') if fmt is not None else 'bullet'
            abstract[an.get(W + 'abstractNumId')] = levels
        for num in numbering.iter(W + 'num'):
            ref = num.find(W + 'abstractNumId')
            levels = abstract.get(ref.get(W + 'val') if ref is not None else None, {})
            for lvl, fmt in levels.items():
                if fmt not in ('bullet', 'none'):
                    ordered_lists.add((num.get(W + 'numId'), lvl))

    def kind_of(ppr):
        if ppr is None:
            return 'p'
        style = ppr.find(W + 'pStyle')
        name = styles.get(style.get(W + 'val'), style.get(W + 'val', '').lower()) if style is not None else ''
        outline = ppr.find(W + 'outlineLvl')
        if name == 'title':
            return 'title'
        if name == 'subtitle':
            return 'subtitle'
        m = re.match(r'heading\s*(\d)', name)
        level = int(m.group(1)) if m else (int(outline.get(W + 'val')) + 1 if outline is not None else 0)
        if level:
            return 'h1' if level == 1 else 'h2' if level == 2 else 'h3'
        if 'quote' in name:
            return 'quote'
        return 'p'

    def runs_of(p, href=None):
        out = []
        for el in p:
            tag = el.tag
            if tag == W + 'hyperlink':
                target = rels.get(el.get(R_NS + 'id'))
                link = target[0] if target and target[1] and re.match(r'^(https?://|mailto:)', target[0]) else None
                out.extend(runs_of(el, link))
            elif tag in (W + 'ins', W + 'smartTag', W + 'sdt', W + 'sdtContent', W + 'fldSimple'):
                out.extend(runs_of(el, href))
            elif tag == W + 'r':
                rpr = el.find(W + 'rPr')
                style = dict(b=_on(rpr, 'b'), i=_on(rpr, 'i'), s=_on(rpr, 'strike') or _on(rpr, 'dstrike'))
                u = rpr.find(W + 'u') if rpr is not None else None
                style['u'] = u is not None and u.get(W + 'val', 'single') != 'none'
                for part in el:
                    if part.tag == W + 't':
                        out.append(_run(part.text or '', href=href, **style))
                    elif part.tag == W + 'tab':
                        out.append(_run('\t', href=href, **style))
                    elif part.tag in (W + 'br', W + 'cr'):
                        if part.get(W + 'type') == 'page':
                            out.append({'x': '', 'pb': True})
                        else:
                            out.append({'x': '', 'br': True})
                    elif part.tag == W + 'drawing':
                        for blip in part.iter(A_NS + 'blip'):
                            target = rels.get(blip.get(R_NS + 'embed'))
                            if target and not target[1]:
                                out.append({'x': '', 'img': posixpath.normpath(posixpath.join('word', target[0]))})
        return out

    blocks = []

    def add_paragraph(p):
        ppr = p.find(W + 'pPr')
        runs = runs_of(p)
        # Pictures and page breaks inside a paragraph become blocks of their own.
        pieces, current = [], []
        for r in runs:
            if r.get('img') or r.get('pb'):
                pieces.append(current)
                pieces.append(r)
                current = []
            else:
                current.append(r)
        pieces.append(current)
        jc = ppr.find(W + 'jc') if ppr is not None else None
        align = {'center': 'center', 'right': 'right', 'end': 'right', 'both': None}.get(
            jc.get(W + 'val') if jc is not None else '', None)
        numpr = ppr.find(W + 'numPr') if ppr is not None else None
        kind = kind_of(ppr)
        for piece in pieces:
            if isinstance(piece, dict):
                blocks.append({'t': 'img', 'name': piece['img']} if piece.get('img') else {'t': 'pb'})
                continue
            if not _has_words(piece):
                continue
            if numpr is not None and kind == 'p':
                num = numpr.find(W + 'numId')
                lvl = numpr.find(W + 'ilvl')
                num_id = num.get(W + 'val') if num is not None else '0'
                level = lvl.get(W + 'val') if lvl is not None else '0'
                if num_id != '0':
                    ordered = (num_id, level) in ordered_lists
                    item = {'runs': piece, 'level': min(int(level or 0), 4)}
                    last = blocks[-1] if blocks else None
                    if last and last['t'] == 'list' and (last['ordered'] == ordered or item['level'] > 0):
                        last['items'].append(item)
                    else:
                        blocks.append({'t': 'list', 'ordered': ordered, 'items': [item]})
                    continue
            blocks.append({'t': kind, 'runs': piece, 'align': align})

    def add_table(tbl):
        rows = []
        for tr in tbl.findall(W + 'tr'):
            cells = []
            for tc in tr.findall(W + 'tc'):
                runs = []
                for p in tc.iter(W + 'p'):
                    if runs:
                        runs.append({'x': '', 'br': True})
                    runs.extend(r for r in runs_of(p) if not r.get('img') and not r.get('pb'))
                cells.append(runs)
            if cells:
                rows.append(cells)
        if rows:
            blocks.append({'t': 'table', 'rows': rows})

    body = root.find(W + 'body')
    if body is None:
        raise Unreadable('This Word file has no document inside.')

    def walk(parent):
        for el in parent:
            if len(blocks) > MAX_BLOCKS:
                return
            if el.tag == W + 'p':
                add_paragraph(el)
            elif el.tag == W + 'tbl':
                add_table(el)
            elif el.tag in (W + 'sdt', W + 'sdtContent', W + 'customXml'):
                walk(el)
    walk(body)
    return blocks


# ---------------------------------------------------------------- OpenDocument

def _odt(z):
    names = set(z.namelist())
    if 'content.xml' not in names:
        raise Unreadable('This file has no document inside.')
    root = ET.fromstring(z.read('content.xml'))

    # What each automatic style does to words, and which list styles count.
    looks = {}
    numbered = set()
    sources = [root]
    if 'styles.xml' in names:
        sources.append(ET.fromstring(z.read('styles.xml')))
    for src in sources:
        for st in src.iter(STYLE + 'style'):
            props = st.find(STYLE + 'text-properties')
            para = st.find(STYLE + 'paragraph-properties')
            look = {}
            if props is not None:
                look = {
                    'b': props.get(FO + 'font-weight') in ('bold', '600', '700', '800', '900'),
                    'i': props.get(FO + 'font-style') == 'italic',
                    'u': props.get(STYLE + 'text-underline-style') not in (None, 'none'),
                    's': props.get(STYLE + 'text-line-through-style') not in (None, 'none'),
                }
            if para is not None and para.get(FO + 'text-align') in ('center', 'end', 'right'):
                look['align'] = 'center' if para.get(FO + 'text-align') == 'center' else 'right'
            look['parent'] = st.get(STYLE + 'parent-style-name')
            looks[st.get(STYLE + 'name')] = look
        for ls in src.iter(TEXT + 'list-style'):
            first = next(iter(ls), None)
            if first is not None and first.tag == TEXT + 'list-level-style-number':
                numbered.add(ls.get(STYLE + 'name'))

    def look_of(name):
        look, seen = {}, 0
        while name and seen < 6:
            here = looks.get(name, {})
            for k, v in here.items():
                look.setdefault(k, v)
            name, seen = here.get('parent'), seen + 1
        return look

    def runs_of(el, style=None, href=None):
        style = style or {}
        out = []
        if el.text:
            out.append(_run(el.text, href=href, **{k: style.get(k, False) for k in 'bius'}))
        for child in el:
            tag = child.tag
            if tag == TEXT + 'span':
                inner = dict(style)
                inner.update({k: v for k, v in look_of(child.get(TEXT + 'style-name')).items() if k in 'bius' and v})
                out.extend(runs_of(child, inner, href))
            elif tag == TEXT + 'a':
                link = child.get(XLINK + 'href')
                out.extend(runs_of(child, style, link if link and re.match(r'^(https?://|mailto:)', link) else None))
            elif tag == TEXT + 's':
                out.append(_run(' ' * int(child.get(TEXT + 'c', '1') or 1), href=href))
            elif tag == TEXT + 'tab':
                out.append(_run('\t', href=href))
            elif tag == TEXT + 'line-break':
                out.append({'x': '', 'br': True})
            elif tag == DRAW + 'frame':
                for img in child.iter(DRAW + 'image'):
                    name = img.get(XLINK + 'href') or ''
                    if name and not re.match(r'^[a-z]+:', name):
                        out.append({'x': '', 'img': name.lstrip('./')})
            elif tag in (TEXT + 'note', TEXT + 'bookmark', TEXT + 'bookmark-start', TEXT + 'bookmark-end'):
                pass
            else:
                out.extend(runs_of(child, style, href))
            if child.tail:
                out.append(_run(child.tail, href=href, **{k: style.get(k, False) for k in 'bius'}))
        return out

    blocks = []

    def paragraph(el, kind):
        look = look_of(el.get(TEXT + 'style-name'))
        name = (el.get(TEXT + 'style-name') or '').lower()
        if kind == 'p' and name.startswith('title'):
            kind = 'title'
        elif kind == 'p' and name.startswith('subtitle'):
            kind = 'subtitle'
        elif kind == 'p' and 'quot' in name:
            kind = 'quote'
        style = {k: v for k, v in look.items() if k in 'bius' and v and kind == 'p'}
        runs = runs_of(el, style)
        pieces, current = [], []
        for r in runs:
            if r.get('img'):
                pieces.append(current)
                pieces.append(r)
                current = []
            else:
                current.append(r)
        pieces.append(current)
        for piece in pieces:
            if isinstance(piece, dict):
                blocks.append({'t': 'img', 'name': piece['img']})
            elif _has_words(piece):
                blocks.append({'t': kind, 'runs': piece, 'align': look.get('align')})

    def a_list(el, level, ordered=None):
        if ordered is None:
            ordered = el.get(TEXT + 'style-name') in numbered
        for item in el.findall(TEXT + 'list-item') + el.findall(TEXT + 'list-header'):
            for child in item:
                if child.tag in (TEXT + 'p', TEXT + 'h'):
                    runs = runs_of(child)
                    if not _has_words(runs):
                        continue
                    entry = {'runs': runs, 'level': min(level, 4)}
                    last = blocks[-1] if blocks else None
                    if last and last['t'] == 'list' and (last['ordered'] == ordered or level > 0):
                        last['items'].append(entry)
                    else:
                        blocks.append({'t': 'list', 'ordered': ordered, 'items': [entry]})
                elif child.tag == TEXT + 'list':
                    a_list(child, level + 1, ordered)

    def table(el):
        rows = []
        for tr in el.iter(TABLE + 'table-row'):
            cells = []
            for tc in tr.findall(TABLE + 'table-cell'):
                runs = []
                for p in tc.iter(TEXT + 'p'):
                    if runs:
                        runs.append({'x': '', 'br': True})
                    runs.extend(r for r in runs_of(p) if not r.get('img'))
                cells.append(runs)
            if cells:
                rows.append(cells)
        if rows:
            blocks.append({'t': 'table', 'rows': rows})

    def walk(parent):
        for el in parent:
            if len(blocks) > MAX_BLOCKS:
                return
            if el.tag == TEXT + 'h':
                level = int(el.get(TEXT + 'outline-level') or 1)
                paragraph(el, 'h1' if level <= 1 else 'h2' if level == 2 else 'h3')
            elif el.tag == TEXT + 'p':
                paragraph(el, 'p')
            elif el.tag == TEXT + 'list':
                a_list(el, 0)
            elif el.tag == TABLE + 'table':
                table(el)
            elif el.tag in (TEXT + 'section', OFFICE + 'text', TEXT + 'soft-page-break'):
                walk(el)

    body = root.find(OFFICE + 'body')
    text = body.find(OFFICE + 'text') if body is not None else None
    if text is None:
        raise Unreadable('This file has no written document inside.')
    walk(text)
    return blocks


# ---------------------------------------------------------------- RTF and plain text

def _rtf(raw):
    """RTF's words, a paragraph per \\par, with bold and italic followed."""
    text = raw.decode('latin-1')
    # Drop the font table, colours, styles, pictures and other hidden groups.
    for name in ('fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'header', 'footer', 'listtable',
                 'listoverridetable', 'generator', 'rsidtbl'):
        text = _drop_group(text, '\\' + name)
    text = _drop_group(text, '\\*')
    blocks, runs = [], []
    bold = italic = under = strike = False
    stack = []
    i, n = 0, len(text)
    buf = []

    def flush_text():
        if buf:
            runs.append(_run(''.join(buf), b=bold, i=italic, u=under, s=strike))
            buf.clear()

    def end_paragraph():
        flush_text()
        if _has_words(runs):
            blocks.append({'t': 'p', 'runs': list(runs), 'align': None})
        runs.clear()

    while i < n and len(blocks) < MAX_BLOCKS:
        c = text[i]
        if c == '{':
            flush_text()
            stack.append((bold, italic, under, strike))
            i += 1
        elif c == '}':
            flush_text()
            if stack:
                bold, italic, under, strike = stack.pop()
            i += 1
        elif c == '\\':
            m = re.match(r"\\([a-z]+)(-?\d+)? ?|\\'([0-9a-f]{2})|\\(.)", text[i:i + 40], re.I)
            if not m:
                i += 1
                continue
            word, arg, hexa, sym = m.group(1), m.group(2), m.group(3), m.group(4)
            i += m.end()
            if hexa:
                buf.append(bytes([int(hexa, 16)]).decode('cp1252', 'replace'))
            elif sym:
                if sym in '\\{}':
                    buf.append(sym)
                elif sym == '~':
                    buf.append('\u00a0')
            elif word == 'par':
                end_paragraph()
            elif word == 'line':
                flush_text()
                runs.append({'x': '', 'br': True})
            elif word == 'tab':
                buf.append('\t')
            elif word == 'u' and arg is not None:
                flush_text()
                code = int(arg)
                buf.append(chr(code + 65536 if code < 0 else code))
                if i < n and text[i] == '?':
                    i += 1
            elif word in ('b', 'i', 'ul', 'strike', 'ulnone'):
                flush_text()
                on = arg != '0'
                if word == 'b':
                    bold = on
                elif word == 'i':
                    italic = on
                elif word == 'ul':
                    under = on
                elif word == 'ulnone':
                    under = False
                else:
                    strike = on
            elif word == 'plain':
                flush_text()
                bold = italic = under = strike = False
            elif word == 'page':
                end_paragraph()
                blocks.append({'t': 'pb'})
        elif c in '\r\n':
            i += 1
        else:
            buf.append(c)
            i += 1
    end_paragraph()
    return blocks


def _drop_group(text, word):
    out, i = [], 0
    while True:
        at = text.find('{' + word, i)
        if at < 0:
            out.append(text[i:])
            return ''.join(out)
        out.append(text[i:at])
        depth, j = 0, at
        while j < len(text):
            if text[j] == '\\':
                j += 2
                continue
            if text[j] == '{':
                depth += 1
            elif text[j] == '}':
                depth -= 1
                if depth == 0:
                    break
            j += 1
        i = j + 1


def read_blocks(path, ext):
    """The document inside a stored file, as blocks, plus the zip it came from
    (for its pictures) when it has one."""
    ext = (ext or '').lower()
    try:
        if ext == 'docx':
            with zipfile.ZipFile(path) as z:
                return _docx(z), _pictures(z)
        if ext == 'odt':
            with zipfile.ZipFile(path) as z:
                return _odt(z), _pictures(z)
        if ext == 'rtf':
            with open(path, 'rb') as f:
                return _rtf(f.read(4_000_000)), {}
    except (zipfile.BadZipFile, ET.ParseError, KeyError, ValueError, OSError):
        raise Unreadable('This file could not be read as a document.')
    raise Unreadable('This kind of file can’t be made into a document.')


def _pictures(z):
    """Every picture in the zip that a document may show, by name (read lazily)."""
    out = {}
    for info in z.infolist():
        ext = info.filename.rsplit('.', 1)[-1].lower()
        if ext in PICTURE_TYPES and info.file_size <= MAX_PICTURE and len(out) < MAX_PICTURES * 3:
            out[info.filename] = (PICTURE_TYPES[ext], z.read(info.filename))
    return out


def read_plain(path):
    with open(path, 'rb') as f:
        raw = f.read(400_000)
    return raw.decode('utf-8', 'replace').replace('\x00', '').replace('\r\n', '\n').strip('\n')


# ---------------------------------------------------------------- out: HTML and Markdown

def _runs_html(runs):
    out = []
    for r in runs:
        if r.get('br'):
            out.append('<br>')
            continue
        if not r['x']:
            continue
        piece = html.escape(r['x'].replace('\t', '    '), quote=False)
        if r.get('s'):
            piece = f'<s>{piece}</s>'
        if r.get('u'):
            piece = f'<u>{piece}</u>'
        if r.get('i'):
            piece = f'<em>{piece}</em>'
        if r.get('b'):
            piece = f'<strong>{piece}</strong>'
        if r.get('href'):
            piece = f'<a href="{html.escape(r["href"])}">{piece}</a>'
        out.append(piece)
    # Neighbouring runs of the same kind join up.
    joined = ''.join(out)
    for tag in ('strong', 'em', 'u', 's'):
        joined = joined.replace(f'</{tag}><{tag}>', '')
    return joined


def _runs_md(runs):
    out = []
    for r in runs:
        if r.get('br'):
            out.append('  \n')
            continue
        x = r['x'].replace('\t', ' ')
        if not x.strip():
            out.append(x)
            continue
        lead, core, tail = re.match(r'^(\s*)(.*?)(\s*)$', x, re.S).groups()
        core = re.sub(r'([*_`~\\])', r'\\\1', core)
        if r.get('s'):
            core = f'~~{core}~~'
        if r.get('i'):
            core = f'*{core}*'
        if r.get('b'):
            core = f'**{core}**'
        if r.get('href'):
            core = f'[{core}]({r["href"]})'
        out.append(lead + core + tail)
    joined = ''.join(out)
    for mark in ('**', '*', '~~'):
        joined = joined.replace(mark + mark, '') if mark != '*' else joined
    return joined.strip()


def to_html(blocks, picture_src=None):
    """The editor's HTML. `picture_src(name)` gives a picture's address, or None to leave it out."""
    out = []
    for b in blocks:
        t = b['t']
        if t == 'pb':
            out.append('<div class="pb"></div>')
        elif t == 'img':
            src = picture_src(b['name']) if picture_src else None
            if src:
                out.append(f'<figure><img src="{html.escape(src)}" alt=""></figure>')
        elif t == 'list':
            out.append(_list_html(b))
        elif t == 'table':
            rows = ''.join('<tr>' + ''.join(f'<td>{_runs_html(c) or "<br>"}</td>' for c in row) + '</tr>'
                           for row in b['rows'])
            out.append(f'<table><tbody>{rows}</tbody></table>')
        else:
            inner = _runs_html(b['runs'])
            align = f' style="text-align: {b["align"]}"' if b.get('align') else ''
            if t == 'title':
                out.append(f'<h1 class="title"{align}>{inner}</h1>')
            elif t == 'subtitle':
                out.append(f'<p class="subtitle"{align}>{inner}</p>')
            elif t == 'quote':
                out.append(f'<blockquote><p>{inner}</p></blockquote>')
            elif t in ('h1', 'h2', 'h3'):
                out.append(f'<{t}{align}>{inner}</{t}>')
            else:
                out.append(f'<p{align}>{inner}</p>')
    return ''.join(out)


def _list_html(b):
    tag = 'ol' if b['ordered'] else 'ul'
    out, depth = [f'<{tag}>'], 0
    for n, item in enumerate(b['items']):
        level = min(item['level'], depth + 1) if n else 0
        while depth < level:
            out.append(f'<{tag}>')
            depth += 1
        while depth > level:
            out.append(f'</li></{tag}>')
            depth -= 1
        if n and out[-1] != f'<{tag}>':
            out.append('</li>')
        out.append(f'<li>{_runs_html(item["runs"])}')
    out.append('</li>')
    while depth > 0:
        out.append(f'</{tag}></li>')
        depth -= 1
    out.append(f'</{tag}>')
    return ''.join(out)


def to_markdown(blocks):
    out = []
    for b in blocks:
        t = b['t']
        if t in ('pb', 'img'):
            continue
        if t == 'list':
            counts = {}
            lines = []
            for item in b['items']:
                level = item['level']
                counts[level] = counts.get(level, 0) + 1
                for deeper in [k for k in counts if k > level]:
                    counts.pop(deeper)
                mark = f'{counts[level]}.' if b['ordered'] else '-'
                lines.append('  ' * level + f'{mark} {_runs_md(item["runs"])}')
            out.append('\n'.join(lines))
        elif t == 'table':
            rows = [' | '.join(_plain(c).replace('\n', ' ').strip() for c in row) for row in b['rows']]
            out.append('\n'.join(rows))
        else:
            words = _runs_md(b['runs'])
            if not words:
                continue
            prefix = {'title': '# ', 'h1': '# ', 'h2': '## ', 'h3': '### ', 'quote': '> '}.get(t, '')
            out.append(prefix + words.replace('\n', ' ') if prefix else words)
    return '\n\n'.join(out).strip()


def first_heading(blocks):
    for b in blocks:
        if b['t'] in ('title', 'h1') and _has_words(b['runs']):
            return _plain(b['runs']).strip()[:200]
    return None
