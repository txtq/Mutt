"""Document mode: a planet kept as a writing desk.

Like list mode and reading mode, it isn't a setting to go looking for. A planet
offers it once what it holds is writing: notes longer than a sentence or two
(essays, chapters, letters, poems), or one note longer than a note should be.

A document is still an ordinary text file (a note). Its words, kept as the
note's text in the same light Markdown every note uses, are what search,
autosort and the rest of the app read. The editor's fuller version (headings,
alignment, colours, tables, pictures, page setup) is kept beside it in `docs`,
as HTML cleaned to a short allowlist here before it's stored.
"""

import html
import json
import re
from html.parser import HTMLParser

from . import sorting

# ---------------------------------------------------------------- what's writing

# Longer than this and a note is a piece of writing, not a note.
LONG_CHARS = 280
# Longer than this and it no longer fits comfortably in a note at all.
NOTE_FITS = 1000

DOC_NAMES = re.compile(
    r'\b(?:docs?|documents?|writing|writings|drafts?|essays?|stories|story|chapters?|manuscripts?|novel|'
    r'novella|poems?|poetry|verses?|letters?|scripts?|screenplays?|articles?|posts?|blog|papers?|'
    r'thesis|dissertation|reports?|memos?|speeches|speech|lyrics|fiction|prose|journal entries|zine)\b', re.I)

SENTENCE_RE = re.compile(r'[.!?…](?:["”’)\]]*)(?:\s|$)')


def sentences(text):
    return len(SENTENCE_RE.findall(text or ''))


# ---------------------------------------------------------------- kinds of writing

# A document is set for the kind of writing it is: each kind has its own page
# and tools in the editor. 'auto' reads it from the words (the editor reads the
# same signs again as you write; docwriting.js `readsAs`).
KINDS = ('prose', 'poem', 'script', 'journal', 'letter')

SCENE_RE = re.compile(r'^\s*(?:#+\s*)?(?:INT|EXT|EST|INT\.?\s*/\s*EXT|I/E)[.\s]', re.I)
CUE_RE = re.compile(r"^\s*[A-Z][A-Z0-9 .'\-]{0,28}(?:\s*\((?:V\.O\.|O\.S\.|O\.C\.|CONT'D|CONT’D)\))?\s*$")
TRANSITION_RE = re.compile(r'^\s*(?:[A-Z ]+ TO:|FADE (?:IN|OUT)[.:]|CUT TO BLACK\.?)\s*$')
MONTHS = (r'(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|'
          r'sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)')
WEEKDAY = r'(?:(?:mon|tues?|wed(?:nes)?|thu(?:rs)?|fri|sat(?:ur)?|sun)(?:day)?\.?,?\s+)?'
DATE_LINE_RE = re.compile(
    r'^\s*(?:#+\s*)?' + WEEKDAY + r'(?:'
    r'\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?' + MONTHS + r'\.?(?:,?\s+\d{4})?'
    r'|' + MONTHS + r'\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?'
    r'|\d{4}-\d{2}-\d{2}|\d{1,2}[/.]\d{1,2}[/.]\d{2,4})'
    r'(?:\s*[,·–—-]\s*.{0,30})?\s*$', re.I)
GREETING_RE = re.compile(r'^\s*(?:dear|dearest|my dear|hi|hello|hey|to)\s+[^\n]{1,40}[,:!—–-]\s*$', re.I)
SIGNOFF_RE = re.compile(
    r'^\s*(?:love|lots of love|all my love|with love|yours(?: truly| sincerely| faithfully| ever| always)?|'
    r'sincerely(?: yours)?|best(?: wishes)?|all the best|warmly|warm(?:est)? regards|kind regards|regards|'
    r'cheers|thanks|thank you|many thanks|until soon|see you soon|x+|xo+)\s*[,.!]?\s*$', re.I)


def lines_of(text):
    return [ln for ln in (text or '').splitlines() if ln.strip()]


def is_script(lines):
    scenes = sum(1 for ln in lines if SCENE_RE.match(ln))
    cues = sum(1 for i, ln in enumerate(lines[:-1]) if CUE_RE.match(ln) and not SCENE_RE.match(ln)
               and not CUE_RE.match(lines[i + 1]) and len(ln.split()) <= 4)
    fade = any(TRANSITION_RE.match(ln) for ln in lines)
    return scenes >= 2 or (scenes >= 1 and (cues >= 2 or fade)) or (cues >= 4 and cues >= len(lines) * 0.2)


def is_journal(lines):
    dates = sum(1 for ln in lines if len(ln) <= 60 and DATE_LINE_RE.match(ln))
    return dates >= 2 and len(lines) >= dates * 2


def is_letter(lines):
    if not lines:
        return False
    opening = lines[:3]
    greet = any(GREETING_RE.match(ln) for ln in opening)
    signed = any(SIGNOFF_RE.match(ln) for ln in lines[-4:])
    return greet and (signed or bool(re.match(r'^\s*(?:dear|dearest|my dear)\b', ' '.join(opening), re.I)))


def reads_as(text):
    """The kind of writing a note is ('poem', 'script', 'journal', 'letter',
    'prose'), or None for a scrap too short to say."""
    lines = lines_of(text)
    if is_script(lines):
        return 'script'
    if is_journal(lines):
        return 'journal'
    if is_letter(lines):
        return 'letter'
    found = sorting.form(text or '')
    if found.get('poem'):
        return 'poem'
    if found.get('prose') or len((text or '').strip()) >= LONG_CHARS:
        return 'prose'
    return None


def is_long(text):
    """Longer than a sentence or two: real writing, or a poem of a few lines."""
    text = (text or '').strip()
    if not text:
        return False
    if len(text) >= LONG_CHARS or sentences(text) >= 3:
        return True
    lines = [ln for ln in text.splitlines() if ln.strip()]
    return len(lines) >= 4 and 'poem' in sorting.form(text)


def doc_signs(title, files):
    """Whether a planet is being used for writing, in plain words.
    files: rows with kind and content. {'fits', 'signs', 'long', 'notes'}."""
    n = len(files)
    notes = [f for f in files if f['kind'] == 'text']
    long_notes = [f for f in notes if is_long(f['content'])]
    huge = [f for f in notes if len((f['content'] or '').strip()) >= NOTE_FITS]
    poems = sum(1 for f in long_notes if reads_as(f['content']) == 'poem')
    named = bool(DOC_NAMES.search(title or ''))
    only_text = n > 0 and len(notes) == n
    mostly_text = n > 0 and len(notes) >= 0.8 * n

    signs = []
    if named:
        signs.append(f'It’s called “{title}”, which sounds like writing.')
    if huge:
        longest = max(len(f['content'] or '') for f in huge)
        words = max(len((f['content'] or '').split()) for f in huge)
        if len(huge) == 1:
            signs.append(f'One of its notes runs to {words:,} words, more than fits in a note.')
        else:
            signs.append(f'{len(huge)} of its notes are longer than a note should be (the longest is {longest:,} characters).')
    if long_notes:
        what = 'poems' if poems == len(long_notes) and poems > 1 else 'pieces of writing'
        if len(long_notes) == n and n > 1:
            signs.append(f'Everything on it is writing: {len(long_notes)} {what}, each more than a sentence or two.')
        elif len(long_notes) > 1:
            signs.append(f'{len(long_notes)} of its {n} files are {what} longer than a sentence or two.')
        elif not huge:
            signs.append('Its one note is longer than a sentence or two.')
    if only_text and n > 1 and long_notes:
        signs.append('It holds only text.')

    fits = bool(long_notes) and bool(
        (mostly_text and (huge or len(long_notes) >= 3 or named))
        or (len(long_notes) >= 5 and len(long_notes) >= 0.5 * n)
        or (only_text and len(long_notes) >= 2 and len(long_notes) >= 0.5 * n))
    return {'fits': fits, 'signs': signs, 'long': len(long_notes), 'notes': len(notes), 'poems': poems}


# ---------------------------------------------------------------- settings

PAGES = ('a4', 'letter')
MARGINS = ('narrow', 'normal', 'wide')
FONTS = ('serif', 'sans', 'mono', 'type')
SPACINGS = (1.0, 1.15, 1.5, 2.0)
SIZES = tuple(range(9, 25))
LAYOUTS = ('auto',) + KINDS
NUMBERS = ('off', 'center', 'right')
VIEWS = ('pages', 'flow')

# How the desk can order a planet's documents (kept per planet in modes.documents.sort).
SORTS = ('edited', 'newest', 'oldest', 'name', 'longest', 'shortest')

DEFAULTS = {'page': 'a4', 'margins': 'normal', 'font': 'serif', 'size': 12, 'spacing': 1.15,
            'layout': 'auto', 'numbers': 'center', 'header': '', 'footer': '', 'view': 'pages'}


def clean_settings(value, current=None):
    """A document's page setup; anything unknown is refused."""
    if not isinstance(value, dict):
        raise ValueError('settings')
    out = {**DEFAULTS, **(current or {})}
    for key, v in value.items():
        if key == 'page' and v in PAGES or key == 'margins' and v in MARGINS or key == 'font' and v in FONTS \
                or key == 'layout' and v in LAYOUTS or key == 'numbers' and v in NUMBERS or key == 'view' and v in VIEWS:
            out[key] = v
        elif key == 'size' and isinstance(v, int) and not isinstance(v, bool) and v in SIZES:
            out[key] = v
        elif key == 'spacing' and isinstance(v, (int, float)) and not isinstance(v, bool) and float(v) in SPACINGS:
            out[key] = float(v)
        elif key in ('header', 'footer') and isinstance(v, str) and len(v) <= 200:
            out[key] = v.replace('\x00', '').strip()
        else:
            raise ValueError(key)
    return out


# ---------------------------------------------------------------- cleaning HTML

BLOCK_TAGS = {'p', 'h1', 'h2', 'h3', 'h4', 'blockquote', 'pre', 'ul', 'ol', 'li', 'table', 'thead', 'tbody',
              'tr', 'td', 'th', 'figure', 'figcaption', 'div'}
INLINE_TAGS = {'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del', 'sub', 'sup', 'code', 'a', 'span', 'mark',
               'br', 'img', 'hr', 'font'}
ALLOWED = BLOCK_TAGS | INLINE_TAGS
VOID = {'br', 'img', 'hr'}
# Whose contents go too, not just the tag.
DROP_WITH_CONTENT = {'script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template', 'head', 'title',
                     'svg', 'math', 'video', 'audio', 'canvas', 'form', 'select', 'textarea', 'button', 'input'}
RENAME = {'b': 'strong', 'i': 'em', 'strike': 's', 'del': 's', 'font': 'span'}

CLASSES = {'pb', 'check', 'done', 'title', 'subtitle', 'stanza', 'wide', 'left', 'right', 'center',
           'dash', 'alpha', 'roman', 'dated', 'sc-scene', 'sc-action', 'sc-char', 'sc-paren', 'sc-dial', 'sc-trans'}
COLOR_RE = re.compile(r'^(?:#[0-9a-f]{3,8}|rgba?\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?\s*(?:,\s*[\d.]+%?\s*)?\)|'
                      r'transparent|inherit)$', re.I)
FONT_FAMILIES = {'serif', 'sans', 'mono', 'type'}
STYLE_RULES = {
    'text-align': re.compile(r'^(?:left|right|center|justify|start|end)$'),
    'color': COLOR_RE,
    'background-color': COLOR_RE,
    'font-size': re.compile(r'^(?:\d{1,2}(?:\.\d+)?(?:pt|px)|x-small|small|medium|large|x-large|xx-large|xxx-large)$'),
    'font-weight': re.compile(r'^(?:bold|normal|[1-9]00)$'),
    'font-style': re.compile(r'^(?:italic|normal)$'),
    'text-decoration': re.compile(r'^(?:underline|line-through|none|underline line-through)$'),
    'text-decoration-line': re.compile(r'^(?:underline|line-through|none|underline line-through)$'),
    'margin-left': re.compile(r'^\d{1,3}(?:\.\d+)?(?:px|em|pt)$'),
    'padding-left': re.compile(r'^\d{1,3}(?:\.\d+)?(?:px|em|pt)$'),
    'width': re.compile(r'^\d{1,3}(?:\.\d+)?%$'),
    'line-height': re.compile(r'^(?:1|1\.15|1\.5|2|normal)$'),
}
URL_RE = re.compile(r'^(?:https?://|mailto:|#)[^\s"\'<>]*$', re.I)
IMG_RE = re.compile(r'^/api/docs/[\w-]{1,40}/img/[\w-]{1,40}$')

MAX_HTML = 3_000_000


def clean_style(raw, tag):
    out = []
    for part in (raw or '').split(';'):
        if ':' not in part:
            continue
        prop, value = part.split(':', 1)
        prop = prop.strip().lower()
        value = value.strip().lower().replace('!important', '').strip()
        if prop == 'font-family':
            name = value.split(',')[0].strip(' "\'')
            if name in FONT_FAMILIES:
                out.append(f'font-family: {name}')
            continue
        rule = STYLE_RULES.get(prop)
        if rule and rule.match(value):
            if prop in ('margin-left', 'padding-left', 'line-height') and tag not in BLOCK_TAGS:
                continue
            if prop == 'width' and tag not in ('img', 'td', 'th', 'figure'):
                continue
            out.append(f'{prop}: {value}')
    return '; '.join(out[:8])


class Cleaner(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out = []
        self.open = []          # tags we wrote, to close in order
        self.dropping = 0       # inside a <script> or the like

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        if tag in DROP_WITH_CONTENT:
            if tag not in VOID:
                self.dropping += 1
            return
        if self.dropping or tag not in ALLOWED:
            return
        attrs = dict((k.lower(), v or '') for k, v in attrs)
        name = RENAME.get(tag, tag)
        kept = []
        if tag == 'font':
            face = attrs.get('face', '').split(',')[0].strip(' "\'')
            styles = [f'font-family: {face}'] if face in FONT_FAMILIES else []
            if COLOR_RE.match(attrs.get('color', '').strip()):
                styles.append(f'color: {attrs["color"].strip()}')
            if styles:
                kept.append(('style', '; '.join(styles)))
        if 'style' in attrs and tag != 'font':
            style = clean_style(attrs['style'], name)
            if style:
                kept.append(('style', style))
        if 'class' in attrs:
            classes = [c for c in attrs['class'].split() if c in CLASSES]
            if classes:
                kept.append(('class', ' '.join(classes)))
        if name == 'a':
            href = attrs.get('href', '').strip()
            if URL_RE.match(href):
                kept.append(('href', href))
                if not href.startswith('#'):
                    kept += [('target', '_blank'), ('rel', 'noopener noreferrer')]
        if name == 'img':
            src = attrs.get('src', '').strip()
            if not IMG_RE.match(src):
                return
            kept.append(('src', src))
            kept.append(('alt', attrs.get('alt', '')[:300]))
        if name in ('td', 'th'):
            for key in ('colspan', 'rowspan'):
                if attrs.get(key, '').isdigit() and 1 < int(attrs[key]) <= 20:
                    kept.append((key, attrs[key]))
        if name == 'li' and 'data-done' in attrs:
            kept.append(('data-done', ''))
        if name == 'ol' and attrs.get('start', '').isdigit():
            kept.append(('start', str(min(int(attrs['start']), 99999))))
        text = ''.join(f' {k}="{html.escape(v, quote=True)}"' for k, v in kept)
        self.out.append(f'<{name}{text}>')
        if name not in VOID:
            self.open.append(name)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        tag = tag.lower()
        if tag not in VOID and tag in ALLOWED and not self.dropping:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        tag = tag.lower()
        if tag in DROP_WITH_CONTENT:
            if tag not in VOID:
                self.dropping = max(0, self.dropping - 1)
            return
        if self.dropping or tag not in ALLOWED or tag in VOID:
            return
        name = RENAME.get(tag, tag)
        if name not in self.open:
            return
        while self.open:
            last = self.open.pop()
            self.out.append(f'</{last}>')
            if last == name:
                break

    def handle_data(self, data):
        if not self.dropping:
            self.out.append(html.escape(data, quote=False))

    def result(self):
        while self.open:
            self.out.append(f'</{self.open.pop()}>')
        return ''.join(self.out)


def clean_html(raw):
    if not isinstance(raw, str):
        raise ValueError('html')
    if len(raw) > MAX_HTML:
        raise ValueError('too long')
    cleaner = Cleaner()
    cleaner.feed(raw.replace('\x00', ''))
    cleaner.close()
    return cleaner.result()


def plain_text(raw):
    """The words in a document's HTML, for counting."""
    text = re.sub(r'(?i)<br\s*/?>|</(?:p|h\d|li|blockquote|pre|tr|div|figcaption)>', '\n', raw or '')
    text = re.sub(r'<[^>]+>', '', text)
    return html.unescape(text)


def word_count(text):
    return len(re.findall(r'\S+', text or ''))


def settings_of(raw):
    try:
        value = json.loads(raw or '{}')
        return {**DEFAULTS, **value} if isinstance(value, dict) else dict(DEFAULTS)
    except ValueError:
        return dict(DEFAULTS)
