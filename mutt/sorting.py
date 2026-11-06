"""Autosort, and what each planet is for.

Everything about a file is weighed against everything about each planet:
- the file's name, its note, and what's inside it (typed text, text files, Word,
  PowerPoint, spreadsheets, PDFs, ePubs, link titles and descriptions);
- how it's written (a checklist, a poem, a dated diary entry, a workout log, a
  recipe, a quote, code) and what that says it's for;
- what the planet is called, and what that name means (a planet called "Food"
  wants recipes even if no file says "food"; "🌱" is houseplants);
- the files already on the planet: their words, subjects, kinds, file types,
  websites, colours and forms. Files moved by hand teach it, since they're on
  the right planet now.

purpose() reads one planet on its own: what it's about, what it's used for
(collecting, making, planning, tasks, logging, learning, keeping, wanting), the
kinds and forms of its files, and the words that are its own. Autosort uses
the same reading, and features that appear when a planet needs them should too.

Nothing leaves the server. pick() returns (drawer id, None) for a planet that
fits, or (None, title) for a new planet to make. The words themselves live in
mutt/lexicon.py.
"""
import json
import math
import re
import zipfile
from array import array
import zlib
from collections import Counter
from functools import lru_cache

from . import media as media_info
from . import sight
from .lexicon import (ALIASES, COMMON, CONCEPTS, DOC_TYPES, EMOJI, FOREIGN, GROUP_NAMES, KIN_PAIRS, KIND_GROUPS,
                      MEDIUMS, NATIONALITIES, PLACES, ROLE_PHRASES, ROLES, SHOP_SITES, SHORT_OK, SIGHTS, SITE_TOPICS,
                      STOP_WORDS, TOPICS)

# ---------------------------------------------------------------- words

TOKEN_RE = re.compile(r'[^\W_]+', re.UNICODE)
CAMEL_RE = re.compile(r'(?<=[a-z])(?=[A-Z])')
YEAR_RE = re.compile(r'^(19|20)\d\d$')
SCREENSHOT_RE = re.compile(r'\bscreen[ _-]?shots?\b', re.I)
PRICE_RE = re.compile(r'[£$€¥]\s?\d|\b\d+(?:[.,]\d+)?\s?(?:k\b)?\s?(?:gbp|usd|eur|quid)\b', re.I)
CLOCK_RE = re.compile(r'\b\d{1,2}:\d{2}\b(?!\s*/)|\b\d{1,2}\s?(?:am|pm)\b', re.I)
# Measured things become one word each, so "5x5 @ 100kg" and "4x6 @ 70kg" look alike.
MEASURES = [
    (re.compile(r'^\d+(?:x\d+)+$'), '#sets'),
    (re.compile(r'^\d+(?:kg|kgs|lb|lbs)$'), '#weight'),
    (re.compile(r'^\d+(?:km|k|mi|m)$'), '#distance'),
    (re.compile(r'^\d+(?:g|ml|oz|tbsp|tsp)$'), '#qty'),
    (re.compile(r'^\d+mm$'), '#mm'),
    (re.compile(r'^\d+(?:am|pm)$'), '#time'),
]
BOOK_VERB_RE = re.compile(r'\bbook(?:ed|ing)?(?=\s+(?:a|an|the|in|my|our|your|some|tickets?|flights?|tables?|'
                          r'hotels?|trains?|appointments?|it|them|this|that|him|her|us)\b)', re.I)


def stem(word):
    """A light English stemmer, so 'baking', 'baked' and 'bake' agree."""
    if len(word) <= 3 or not word.isascii():
        return word
    if word.endswith('ies') and len(word) > 4:
        word = word[:-3] + 'i'
    elif word.endswith('sses'):
        word = word[:-2]
    elif word.endswith('s') and not word.endswith(('ss', 'us', 'is')):
        word = word[:-1]
    for end in ('ing', 'ed'):
        if word.endswith(end) and len(word) - len(end) >= 3:
            word = word[:-len(end)]
            if len(word) > 3 and word[-1] == word[-2] and word[-1] not in 'lsz':
                word = word[:-1]
            break
    if len(word) > 3 and word.endswith('y'):
        word = word[:-1] + 'i'
    if len(word) > 3 and word.endswith('e'):
        word = word[:-1]
    return word


def words(text):
    """Plain lowercase words, without filler. Prices, clock times and measured
    amounts become words of their own (#price, #time, #sets, #weight...)."""
    text = text or ''
    found = ['#price'] * min(3, len(PRICE_RE.findall(text))) + ['#time'] * min(2, len(CLOCK_RE.findall(text)))
    text = BOOK_VERB_RE.sub('reserve', CAMEL_RE.sub(' ', SCREENSHOT_RE.sub('screenshot', text)))
    for word in TOKEN_RE.findall(text.lower()):
        word = ALIASES.get(word, word)
        if word[0].isdigit():
            measure = next((name for pattern, name in MEASURES if pattern.match(word)), None)
            if measure:
                found.append(measure)
                continue
        if word in STOP_WORDS or (word.isdigit() and not YEAR_RE.match(word)):
            continue
        if len(word) < 3 and word not in SHORT_OK and word.isascii():
            continue
        found.append(word)
    return found


@lru_cache(maxsize=50000)
def _stem(word):
    return stem(word)


def stems(text):
    return [_stem(w) for w in words(text)]


def emoji_in(text):
    """Topics and concepts that emoji in the text stand for."""
    if not text or text.isascii():
        return []
    return [meaning for char, meaning in EMOJI.items() if char in text]


# ---------------------------------------------------------------- what words mean

COMMON_STEMS = {stem(w) for w in COMMON}
TOPIC_NAMES = {}     # stem -> topics a planet's name means by it
TOPIC_WORDS = {}     # stem -> topics files using it are about
CONCEPT_NAMES = {}   # stem -> concepts a planet's name means by it
CONCEPT_WORDS = {}   # stem -> concepts files using it are about
CONCEPT_TOPIC = {}   # concept -> its topic
for _topic, (_names, _words) in TOPICS.items():
    for _w in _names.split():
        TOPIC_NAMES.setdefault(stem(_w), set()).add(_topic)
    for _w in (_names + ' ' + _words).split():
        TOPIC_WORDS.setdefault(stem(_w), set()).add(_topic)
for _concept, (_topic, _names, _words) in CONCEPTS.items():
    CONCEPT_TOPIC[_concept] = _topic
    for _w in _names.split():
        CONCEPT_NAMES.setdefault(stem(_w), set()).add(_concept)
        if stem(_w) not in COMMON_STEMS:
            TOPIC_NAMES.setdefault(stem(_w), set()).add(_topic)
    for _w in _words.split():
        CONCEPT_WORDS.setdefault(stem(_w), set()).add(_concept)
        TOPIC_WORDS.setdefault(stem(_w), set()).add(_topic)
KIN = {}
for _a, _b, _k in KIN_PAIRS:
    KIN.setdefault(_a, {})[_b] = _k
    KIN.setdefault(_b, {})[_a] = _k
PLACES = {stem(country): {stem(w) for w in places.split()} for country, places in PLACES.items()}
for _country, _places in PLACES.items():
    for _w in _places | {_country}:
        TOPIC_WORDS.setdefault(_w, set()).add('Travel')
PLACE_WORDS = {w for country, places in PLACES.items() for w in places | {country}}
COUNTRY_OF = {w: country for country, places in PLACES.items() for w in places}
NATIONAL = {stem(w) for w in NATIONALITIES}
LANGUAGE_NAMES = {w for w, topics in TOPIC_NAMES.items() if 'Language' in topics} - {'language', 'languag', 'vocab',
                                                                                     'vocabulari'}
GROUP_NAMES = {group: {stem(w) for w in names.split()} for group, names in GROUP_NAMES.items()}
ROLE_WORDS = {}
for _role, _words in ROLES.items():
    for _w in _words.split():
        ROLE_WORDS.setdefault(stem(_w), set()).add(_role)
ROLE_PHRASES = {role: [re.compile(p, re.I) for p in pats] for role, pats in ROLE_PHRASES.items()}
# Words in a planet's name that say how its things are kept rather than what they're about.
QUALIFIERS = {stem(w) for w in 'idea ideas note notes stuff things misc random inspiration references saved '
              'favourites collection list lists log tracker wip drafts wishlist'.split()}


def meaning(name):
    """(topic, concept or None) for a topic or concept name."""
    if name in CONCEPTS:
        return CONCEPT_TOPIC[name], name
    return name, None


def site_meaning(site):
    """What a website is about: a topic or concept name, or None."""
    parts = site.split('.')
    for i in range(len(parts) - 1):
        found = SITE_TOPICS.get('.'.join(parts[i:]))
        if found:
            return found
    return None


def is_shop(site):
    parts = site.split('.')
    return any('.'.join(parts[i:]) in SHOP_SITES for i in range(len(parts) - 1))


def group_of(kind, ext):
    if kind == 'doc' and ext in NOTE_EXTS:
        return 'Notes'  # a text file is a note that came as a file
    return KIND_GROUPS.get(kind, 'Files')


NOTE_EXTS = {'txt', 'md', 'markdown', 'rtf', 'text'}
CODE_EXTS = set('js mjs cjs ts tsx jsx py rb go rs java kt swift c h cc cpp hpp cs php css scss sass less sh bash '
                'zsh sql lua r vue svelte ipynb'.split())
TABLE_EXTS = {'csv', 'tsv', 'xlsx', 'xls', 'ods', 'numbers'}
# A code file's type names its language, so a .rs file is about Rust.
CODE_LANGUAGES = {'rs': 'rust', 'py': 'python', 'ipynb': 'python', 'js': 'javascript', 'mjs': 'javascript',
                  'jsx': 'javascript', 'ts': 'typescript', 'tsx': 'typescript', 'go': 'golang', 'rb': 'ruby',
                  'swift': 'swift', 'kt': 'kotlin', 'java': 'java', 'cpp': 'cpp', 'cc': 'cpp', 'hpp': 'cpp',
                  'c': 'c', 'h': 'c', 'cs': 'csharp', 'php': 'php', 'lua': 'lua', 'r': 'r', 'sql': 'sql',
                  'sh': 'shell', 'bash': 'shell', 'css': 'css', 'scss': 'css', 'vue': 'vue', 'svelte': 'svelte',
                  'hs': 'haskell', 'ex': 'elixir', 'exs': 'elixir', 'scala': 'scala', 'dart': 'dart'}


# ---------------------------------------------------------------- how a note is written

QUANTITY_RE = re.compile(r'\b\d+(?:[./]\d+)?\s*(?:g|kg|ml|l|oz|lb|lbs|cups?|tbsp|tsp|tablespoons?|teaspoons?|'
                         r'grams?|cloves?|pinch|tins?|fillets?)\b', re.I)
CHECKBOX_RE = re.compile(r'^\s*(?:[-*]\s*)?(?:\[[ xX]?\]|☐|☑|✅|✓|✔)', re.M)
BULLET_RE = re.compile(r'^\s*(?:[-*•·]|\d+[.)])\s+\S', re.M)
QUOTE_RE = re.compile(r'^\s*["“‘«\'].{6,}?["”’»\']\s*(?:[-–—―~,]*\s*[A-Z][\w.\' ]{1,40})?\s*$', re.S)
CREDIT_RE = re.compile(r'(?:^|\n)\s*(?:[-–—~]{1,2}|―)\s*[A-Z][\w.\' ]{1,40}\s*$')
MONTHS = r'(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?'
WEEKDAYS = r'(?:mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat|sun)(?:day|nesday|sday|rsday|urday)?\.?,?'
DATE_LEAD_RE = re.compile(r'^\s*(?:\d{1,4}[./-]\d{1,2}[./-]\d{1,4}|' + WEEKDAYS + r'\s+\d{1,2}(?:st|nd|rd|th)?\b|'
                          + MONTHS + r'\s+\d{1,2}\b|\d{1,2}(?:st|nd|rd|th)?\s+' + MONTHS + r'(?:\s|$)|'
                          r'(?:week|day|entry|loaf|session|run)\s*#?\d+\b)', re.I)
PHONE_RE = re.compile(r'(?:\+?\d[\d ().-]{7,}\d)')
EMAIL_RE = re.compile(r'\b[\w.+-]+@[\w-]+\.[\w.]+\b')
CODE_RE = re.compile(r'(?:[{};]\s*$|^\s*(?:def|class|function|const|let|var|import|from|return|if|for|while|fn|'
                     r'impl|pub|struct)\b.*[(:{=<]|=>|</?\w+[^>]*>)', re.M)
TAB_RE = re.compile(r'^\s*[A-Ga-g]#?\s*\|[-\d|hpbr/\\~x ]{6,}', re.M)
CHORDS_RE = re.compile(r'^(?:\s*[A-G][#b]?(?:m|maj|min|dim|sus|add)?\d*(?:/[A-G][#b]?)?\s*){3,}$', re.M)
MEASURED_RE = re.compile(r'\b\d+(?:x\d+)+\b|\b\d+(?:\.\d+)?\s?(?:kg|km|k|mi|miles?|m)\b|\b\d{1,2}:\d{2}\s?/\s?(?:km|mi)\b'
                         r'|@\s?\d', re.I)
FIRST_PERSON_RE = re.compile(r"\b(?:I|I'm|I've|I'd|my|me|myself)\b")
TODO_VERBS = set('buy call email text book pick ring pay send finish fix clean return cancel schedule renew '
                 'order get make print sign submit post reply check wash charge water feed collect drop chase '
                 'ask remember reserve'.split())


FORM_LIMIT = 2000
ROLE_LIMIT = 800  # what a file is for shows in its first lines


def form(text, ext=''):
    """How a note is written: form -> strength, 0 to 1. A planet whose notes
    share a form (all poems, all dated runs) is told apart by it, and a form
    is what switches a feature on (a list, long writing)."""
    found = Counter()
    text = (text or '').strip()[:FORM_LIMIT]  # how a note is written shows in its opening
    if ext in CODE_EXTS:
        found['code'] = 1.0
    if ext in TABLE_EXTS:
        found['table'] = 1.0
    if not text:
        return found
    lines = [ln for ln in text.splitlines() if ln.strip()]
    n = len(lines)
    short = len(text) < 600
    per_line = sum(len(ln.split()) for ln in lines) / n
    chars_line = sum(len(ln) for ln in lines) / n
    sentences = len(re.findall(r'[.!?;](?:\s|$)', text))
    bullets = len(BULLET_RE.findall(text))
    code_lines = len(CODE_RE.findall(text))
    quantities = len(QUANTITY_RE.findall(text))
    first = (words(lines[0][:40]) or [''])[0]

    cells = [max(ln.count(','), ln.count('\t'), ln.count('|')) for ln in lines[:20]]
    if n >= 2 and min(cells) >= 2 and max(cells) - min(cells) <= 1:
        found['table'] = 1.0  # rows of a spreadsheet, not a list
    if CHECKBOX_RE.search(text) or re.match(r'\s*(?:to ?do|tasks?)\b', text, re.I):
        found['checklist'] = 1.0
    if n >= 3 and per_line <= 3.5 and not code_lines and sentences <= 1 and 'table' not in found:
        found['list'] = 1.0  # a list of things (shopping, packing)
    elif bullets >= 3 and bullets >= n * 0.6 and chars_line < 60:
        found['list'] = 0.8
    verbs = 0
    if short and n <= 6:  # errands are short
        clauses = [c for c in re.split(r'[,;\n]|\band\b|\bthen\b', text) if c.strip()]
        verbs = sum(1 for c in clauses if (words(c[:30]) or [''])[0] in TODO_VERBS)
    if short and n <= 6 and (first in TODO_VERBS or verbs >= 2):
        found['tasks'] = 1.0 if verbs >= 2 or first in TODO_VERBS and n == 1 else 0.7
    if short and (QUOTE_RE.match(text) or (CREDIT_RE.search(text) and n <= 6)):
        found['quote'] = 1.0
    if quantities >= 2 or re.search(r'\bingredients?\b', text, re.I):
        found['recipe'] = min(1.0, 0.5 + quantities * 0.1)
    if ext in CODE_EXTS or (n >= 2 and code_lines >= max(2, n * 0.3)) or (n == 1 and code_lines and '(' in text):
        found['code'] = 1.0
    if TAB_RE.search(text) or len(CHORDS_RE.findall(text)) >= 2:
        found['tab'] = 1.0
    measured = len(MEASURED_RE.findall(text))
    if measured >= 2 or (measured and DATE_LEAD_RE.match(text)):
        found['measured'] = min(1.0, 0.4 + 0.2 * measured)
    dated = bool(DATE_LEAD_RE.match(text) or re.match(r'\s*dear (?:diary|journal)', text, re.I))
    mine = len(FIRST_PERSON_RE.findall(text)) / max(1, len(text.split()))
    if dated:
        found['dated'] = 1.0
    if len(text) > 60 and mine > 0.05 and re.search(r'\b(?:felt|feel|feeling|today|slept|woke|tired|happy|sad|'
                                                     r'worry|worried|grateful|calm|lighter)\b', text, re.I):
        found['diary'] = min(1.0, 0.5 + mine * 5)
    if (n >= 3 and not code_lines and per_line >= 3 and chars_line < 52 and text.count('. ') <= n / 3
            and bullets < 2 and not quantities and not measured and 'list' not in found):
        found['poem'] = 1.0
    if len(text) >= 250 and sentences >= 2 and chars_line >= 60 and 'poem' not in found:
        found['prose'] = min(1.0, len(text) / 1500)
    third = len(re.findall(r'\b(?:he|she|they|his|her|their|him|them)\b', text, re.I))
    past = len(re.findall(r'\b(?:was|were|had|\w{3,}ed|flew|went|came|saw|said|took|found|woke|knew|thought|ran|'
                          r'sat|stood|fell|felt|made|gave|told|began|left|lost|heard|brought|caught)\b', text, re.I))
    if len(text) >= 150 and third >= 2 and past >= 3 and mine < 0.03 and not code_lines:
        found['story'] = min(1.0, 0.4 + 0.1 * (third + past))
    if re.match(r'\s*(?:#+\s*)?(?:chapter|ch\.?|part)\s+(?:\d+|[a-z]+)\b|\s*#\s*(?:one|two|three|four|five|six|'
                r'seven|eight|nine|ten)\b', text, re.I):
        found['chapter'] = 1.0
    if re.match(r'\s*(?:idea|ideas|what if|how about|imagine|someday|one day)\b', text, re.I):
        found['idea'] = 1.0
    if short and PHONE_RE.search(text) and EMAIL_RE.search(text):
        found['contact'] = 1.0
    if PRICE_RE.search(text):
        found['priced'] = min(1.0, 0.5 * len(PRICE_RE.findall(text)))
    if CLOCK_RE.search(text) and re.search(WEEKDAYS + r'|' + MONTHS + r'|\btomorrow\b|\btonight\b', text, re.I):
        found['appointment'] = 1.0
    return found


# What each form says a note is about.
FORM_TOPICS = {'checklist': ('To do', 5), 'list': ('To do', 1.5), 'tasks': ('To do', 2.5), 'quote': ('Quotes', 5),
               'code': ('Code', 5), 'poem': ('Writing', 3), 'chapter': ('Writing', 2), 'story': ('Writing', 2.5), 'idea': ('Ideas', 3.5),
               'contact': ('People', 3), 'tab': ('Music', 4)}


def shape(text, ext='', forms=None):
    """Clues from how a note is written rather than what it says: topic -> weight."""
    forms = form(text, ext) if forms is None else forms
    found = Counter()
    for f, strength in forms.items():
        if f in FORM_TOPICS:
            topic, weight = FORM_TOPICS[f]
            found[topic] += weight * strength
    if forms.get('list') and not forms.get('checklist'):
        found['To do'] += 2.5  # a list of things to get or pack
    if forms.get('recipe'):
        found['Recipes'] += 2 + min(len(QUANTITY_RE.findall((text or '')[:FORM_LIMIT])), 6) * 0.5
    if forms.get('dated') and not forms.get('measured'):
        found['Journal'] += 2.5
    if forms.get('diary'):
        found['Journal'] += 1.5 + forms['diary']
    if forms.get('appointment') and not forms.get('dated'):
        found['To do'] += 1.0
    return found


# ---------------------------------------------------------------- reading what's inside

TEXT_LIMIT = 60_000
TAG_RE = re.compile(r'<[^>]+>')


def read_text(path, ext, texty):
    """The readable text inside a stored file, as well as can be done without
    any libraries. Empty when there's nothing to read."""
    try:
        if texty:
            with open(path, 'rb') as f:
                text = f.read(TEXT_LIMIT * 2).decode('utf-8', 'replace').replace('\x00', '')
            if ext in ('html', 'htm', 'xml', 'svg'):
                text = TAG_RE.sub(' ', text)
            return text[:TEXT_LIMIT]
        if ext == 'ipynb':
            with open(path, 'rb') as f:
                cells = json.loads(f.read(4_000_000)).get('cells', [])
            return '\n'.join(''.join(c.get('source', [])) for c in cells)[:TEXT_LIMIT]
        if ext in ('docx', 'pptx', 'xlsx', 'odt', 'odp', 'ods', 'epub', 'pages', 'key', 'numbers'):
            return _zip_text(path)
        if ext == 'rtf':
            with open(path, 'rb') as f:
                return _rtf_text(f.read(2_000_000).decode('latin-1'))
        if ext == 'pdf':
            with open(path, 'rb') as f:
                return _pdf_text(f.read(20_000_000))
    except (OSError, ValueError, zipfile.BadZipFile, RuntimeError, KeyError, AttributeError, TypeError):
        pass
    return ''


def _xml_text(xml):
    xml = re.sub(r'</(?:w:p|a:p|text:p|text:h|p|h\d|li|div|si|row)>', '\n', xml)
    xml = re.sub(r'<(?:w:tab|text:tab|br)\b[^>]*/?>', ' ', xml)
    text = TAG_RE.sub('', xml)
    for entity, char in (('&lt;', '<'), ('&gt;', '>'), ('&quot;', '"'), ('&apos;', "'"), ('&#39;', "'"),
                         ('&amp;', '&')):
        text = text.replace(entity, char)
    return re.sub(r'[ \t]+', ' ', text)


def _zip_text(path):
    parts, size = [], 0
    with zipfile.ZipFile(path) as z:
        names = z.namelist()

        def slide_no(name):
            m = re.search(r'(\d+)\.xml$', name)
            return int(m.group(1)) if m else 0
        wanted = (['word/document.xml'] + sorted([n for n in names if re.match(r'ppt/slides/slide\d+\.xml$', n)],
                                                  key=slide_no)
                  + ['xl/sharedStrings.xml', 'content.xml', 'index.xml']
                  + sorted(n for n in names if re.search(r'\.x?html?$', n) and 'nav' not in n.lower())[:40])
        for name in wanted:
            if name not in names:
                continue
            info = z.getinfo(name)
            if info.file_size > 30_000_000:
                continue
            parts.append(_xml_text(z.read(name).decode('utf-8', 'replace')))
            size += len(parts[-1])
            if size > TEXT_LIMIT:
                break
    return '\n'.join(parts)[:TEXT_LIMIT]


def _rtf_text(rtf):
    rtf = re.sub(r'\{\\\*[^{}]*\}', '', rtf)
    rtf = re.sub(r"\\'[0-9a-f]{2}", '', rtf)
    rtf = re.sub(r'\\par[d]?\b', '\n', rtf)
    rtf = re.sub(r'\\[a-z]+-?\d* ?', '', rtf)
    return re.sub(r'[{}]', '', rtf)[:TEXT_LIMIT]


PDF_STRING_RE = re.compile(rb'\((?:\\.|[^\\)])*\)|-?\d+(?:\.\d+)?|T[Jj*]|\'|"', re.S)
PDF_INFO_RE = re.compile(rb'/(Title|Subject|Keywords)\s*\(((?:\\.|[^\\)]){1,400})\)')


def _pdf_unescape(raw):
    out = re.sub(rb'\\([nrtbf()\\]|[0-7]{1,3})', lambda m: {
        b'n': b'\n', b'r': b' ', b't': b' ', b'b': b'', b'f': b'', b'(': b'(', b')': b')', b'\\': b'\\',
    }.get(m.group(1), bytes([int(m.group(1), 8) & 255]) if m.group(1)[:1].isdigit() else b''), raw)
    return out.decode('latin-1')


def _pdf_text(data):
    """Text drawn with plain strings in a PDF. PDFs whose fonts are stored as
    numbered glyphs (common from Google Docs) give nothing; those still sort by
    name, title and the rest."""
    found = [_pdf_unescape(m.group(2)) for m in PDF_INFO_RE.finditer(data[:2_000_000])
             if not m.group(2).startswith(b'\xfe\xff')]
    total, unpacked = 0, 0
    for m in re.finditer(rb'stream\r?\n', data):
        if unpacked > 60_000_000:
            break  # mostly pictures; enough
        end = data.find(b'endstream', m.end())
        if end < 0:
            break
        head = data[max(0, m.start() - 300):m.start()]
        raw = data[m.end():end]
        if b'FlateDecode' in head[head.rfind(b'obj'):]:
            try:
                raw = zlib.decompressobj().decompress(raw, 4_000_000)
            except zlib.error:
                continue
            unpacked += len(raw)
        elif b'/Filter' in head[head.rfind(b'obj'):]:
            continue  # pictures and other encodings
        if b'BT' not in raw:
            continue
        line = []
        for token in PDF_STRING_RE.findall(raw):
            if token[:1] == b'(':
                line.append(_pdf_unescape(token[1:-1]))
            elif token[:1].isdigit() or token[:1] == b'-':
                if float(token) < -180:
                    line.append(' ')  # a wide gap between letters is a space
            elif token in (b'T*', b"'", b'"'):
                line.append('\n')
            elif token == b'Tj' or token == b'TJ':
                line.append(' ' if token == b'Tj' else '')
        text = ''.join(line)
        total += len(text)
        found.append(text)
        if total > TEXT_LIMIT:
            break
    text = '\n'.join(found)
    tokens = TOKEN_RE.findall(text)
    if not tokens:
        return ''
    wordlike = sum(1 for t in tokens if len(t) > 1 and t.isalpha() and re.search(r'[aeiouyAEIOUY]', t))
    return text[:TEXT_LIMIT] if wordlike / len(tokens) > 0.55 else '\n'.join(found[:1])


def gist(text, limit=60):
    """The words that say most about a long text, kept on the file so it can be
    compared (and searched) later without reading it again."""
    counts = Counter(w for w in words(text) if not w.isdigit())
    return ' '.join(w for w, _ in counts.most_common(limit))


# ---------------------------------------------------------------- what a file is about, and for

OWN_WORK_RE = re.compile(r'\b(?:sketch\w*|stud(?:y|ies)|wip|final|draft|v\d+|oil|oils|painting|drawing|ink|demo|'
                         r'take|mix|memo|portrait|self[ -]portrait|my|idea|commission|piece)\b|\b\d+\s?x\s?\d+\b',
                         re.I)
KEEP_RE = re.compile(r'\b(?:invoice|receipt|contract|agreement|certificate|statement|policy|p60|p45|tax|bills?|vat|'
                     r'expenses|payslip|tax return|vat return|pension|renewal|premium|mot|'
                     r'tenancy|insurance|payslip|warranty|quotation|terms|payment|deposit|council|record)\b', re.I)
DEFINE_RE = re.compile(r'^\s*[^=\n]{1,30}\s=\s\w|\b(?:is|are) like\b|\bmeans\b|\byou can have\b|\bvs\.?\b', re.M | re.I)
LEARN_RE = re.compile(r'\b(?:lessons?|lectures?|tutorials?|course|beginners?|guide|how to|learn|learning|'
                      r'shortcuts?|exercises|documentation|week \d+|notes on|explained|introduction|basics|'
                      r'cheat ?sheet|what is)\b', re.I)
PLAN_RE = re.compile(r'\b(?:flights?|booked|book|reserve|booking|itinerary|venues?|hire|tickets?|deadline|must see|'
                     r'day \d|load in|shortlist|confirm|rsvp|quotes?|need it|start(?:s)? (?:on|first)|'
                     r'by (?:mon|tue|wed|thu|fri|sat|sun|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|the)\w*)\b',
                     re.I)
WANT_RE = re.compile(r'(?:^|\n)\s*wants?\b|\b(?:i|we) (?:really )?want\b|\bwants?:|'
                     r'\b(?:wishlist|wish list|for me|would love|gifts?|presents?|voucher|to buy)\b', re.I)
COLLECT_RE = re.compile(r'\b(?:someday|one day|tbr|to read|to watch|to listen|to try|recommended|recs?)\b|'
                        r'\b(?:have|got|owned):', re.I)
MAKE_RE = re.compile(r'\b(?:draft|redraft|wip|work in progress|v\d+|issue \d+|spreads?|contributors?|print run|'
                     r'chapter \d+|ch \d+|demo|mixdown|sketch|layout|next: a series|bug|feature|ship|shipped|'
                     r'release|deploy)\b', re.I)
DOCS_SITE_RE = re.compile(r'^(?:docs?|developer|learn|developers)\.|/(?:docs?|book|tutorials?|learn|guide)/')
TEXTY_GROUPS = {'Notes', 'Code'}


def file_role(doc, text, name):
    """What a file says about what its planet is used for: role -> strength."""
    role = Counter()
    f = doc.forms
    if doc.kind == 'link':
        about = name + ' ' + text
        role['collecting'] += 0.6
        if is_shop(doc.site) or PRICE_RE.search(about):
            role['wanting'] += 0.7
        if site_meaning(doc.site) == 'trip planning':
            role['planning'] += 0.6
            role['collecting'] = 0.2
        if LEARN_RE.search(about) or DOCS_SITE_RE.search(doc.site + doc.path):
            role['learning'] += 0.6
            role['collecting'] = 0.3
        elif 'youtube' in doc.site:
            role['learning'] += 0.15
        return role
    if doc.group in ('Images', 'Videos'):
        if doc.screenshot:
            role['collecting'] += 0.5
        elif OWN_WORK_RE.search(name):
            role['making'] += 0.7
        else:
            role['collecting'] += 0.35
        return role
    if doc.group == 'Sounds':
        role['making'] += 0.6 if OWN_WORK_RE.search(name) else 0.3
        return role
    if doc.group not in TEXTY_GROUPS and not text:
        role['collecting'] += 0.2
    if doc.group == 'Reading' or doc.kind in ('pdf', 'doc') and doc.group != 'Notes':
        if KEEP_RE.search(name) or KEEP_RE.search(text[:600]):
            role['keeping'] += 0.8
        elif f.get('chapter') or re.search(r'\b(?:draft|manuscript|chapter)\b', name, re.I):
            role['making'] += 0.7
        elif LEARN_RE.search(name):
            role['learning'] += 0.5
        else:
            role['collecting'] += 0.2
        if 'table' in f and PRICE_RE.search(text) is None and re.search(r'\bbudget\b', name, re.I):
            role['planning'] += 0.4
        return role
    if doc.group == 'Code':
        role['making'] += 0.4
    whole = name + '\n' + text
    if f.get('checklist') or f.get('list') or f.get('tasks'):
        role['tasks'] += 0.8 * max(f.get('checklist', 0), f.get('list', 0), f.get('tasks', 0))
    if f.get('quote'):
        role['collecting'] += 0.6
    if f.get('poem') or f.get('chapter') or f.get('story'):
        role['making'] += 0.9
    elif f.get('prose') and not f.get('diary'):
        role['making'] += 0.6 * f['prose']
    if f.get('dated'):
        role['logging'] += 0.5 + 0.4 * max(f.get('diary', 0), f.get('measured', 0))
    elif f.get('diary'):
        role['logging'] += 0.6
    elif f.get('measured'):
        role['logging'] += 0.3
    plans = len(PLAN_RE.findall(whole))
    if plans:
        role['planning'] += min(0.8, 0.35 * plans)
    if LEARN_RE.search(whole) or DEFINE_RE.search(text):
        role['learning'] += 0.6
    if WANT_RE.search(whole):
        role['wanting'] += 0.5 + 0.2 * bool(f.get('priced'))
    if KEEP_RE.search(whole):
        role['keeping'] += 0.4
    if COLLECT_RE.search(whole):
        role['collecting'] += 0.6
    if MAKE_RE.search(whole):
        role['making'] += 0.4
    return role


class Doc:
    """One file, boiled down."""
    __slots__ = ('id', 'kind', 'group', 'ext', 'site', 'path', 'heads', 'body', 'lead', 'topics', 'concepts', 'forms',
                 'role', 'look', 'terms', 'screenshot', 'see', 'medium', 'sights', 'taken', 'gps', 'added', 'doctype',
                 'device', 'artist', 'genre', 'spread')

    def __init__(self, row, extra='', limit=20000):
        meta = json.loads(row['meta'] or '{}')
        self.id = row['id']
        self.kind = row['kind']
        self.ext = (row['ext'] or '').lower()
        self.group = group_of(self.kind, self.ext)
        self.site = (meta.get('domain') or '').lower()
        self.path = re.sub(r'^https?://[^/]+', '', row['content'] or '') if self.kind == 'link' else ''
        title = row['title'] or ''
        file_name = (row['file_name'] or '').rsplit('.', 1)[0]
        name = ' '.join([title, file_name if file_name.lower() != title.lower() else '', row['description'] or ''])
        media = meta.get('media') if isinstance(meta.get('media'), dict) else {}
        # What a file says about itself: a photo's caption and keywords, a song's title.
        said = ' '.join(filter(None, [media.get('title') if (media.get('title') or '').lower() not in name.lower()
                                      else '', media.get('caption'), ' '.join(media.get('keywords') or [])]))
        name = ' '.join(filter(None, [name, said]))
        self.screenshot = self.group == 'Images' and bool(SCREENSHOT_RE.search(name) or re.search(
            r'\bscreenshot\b', name, re.I))
        content = row['content'] or ''
        if self.kind == 'text':
            body = content[:limit]
            written = content
        else:
            path = urlpath(content) if self.kind == 'link' else ''
            inside = extra[:limit] or ' '.join(filter(None, [meta.get('excerpt'), meta.get('gist')]))
            body = ' '.join(filter(None, [meta.get('description'), meta.get('siteName'), meta.get('keywords'),
                                          path, inside, media.get('album'), media.get('genre'), media.get('subject'),
                                          media.get('location'), media.get('template')]))
            written = extra or meta.get('excerpt') or ''  # real text, never the gist (a bag of words)
        lines = written.strip().splitlines()
        first = lines[0] if lines else ''
        # A short heading before a colon or dash ("Ellie's nursery: ...", "# Weekly sync") is what a
        # note is about, like a title.
        subject = re.match(r'\s*(?:#+\s*)?([^:\n—–]{1,40}?)\s*(?::|—|–|\s-\s|$)', first)
        if subject and len(subject.group(1).split()) <= 4 and (self.kind == 'text' or first.lstrip().startswith('#')):
            name += ' ' + subject.group(1)
        if self.ext in CODE_LANGUAGES:
            name += ' ' + CODE_LANGUAGES[self.ext]
        self.heads = Counter(stems(name))
        self.body = Counter(stems(body))
        self.lead = set(stems(' '.join(first.split()[:8])))
        self.forms = form(written, self.ext)
        self.topics, self.concepts = subject_scores(self, shape(written, self.ext, self.forms),
                                                    emoji_in(name + ' ' + written[:400]), written)
        if self.group == 'Code' and 'table' not in self.forms:
            self.forms['code'] = 1.0
        self.role = file_role(self, written[:ROLE_LIMIT] if self.kind == 'text' else ' '.join(
            filter(None, [meta.get('description'), written[:ROLE_LIMIT]])), name)
        self.look = meta.get('look') if isinstance(meta.get('look'), dict) else None
        self.doctype = None
        # Documents, scans and long pasted text can be invoices, payslips, tickets; a quick note isn't.
        if self.kind in ('pdf', 'doc', 'image', 'other') or (self.kind == 'text' and len(written) > 600):
            # Worked out from the whole text on upload; older files fall back to what's kept.
            self.doctype = meta.get('doctype') if meta.get('doctype') in DOC_TYPES else doc_type(
                (written or body)[:DOC_LIMIT], ' '.join(filter(None, [title, file_name, media.get('template')])))
        read_media(self, meta, media, row)
        # Weighted words, the name counting most.
        self.terms = Counter()
        for word, n in self.heads.items():
            self.terms[word] += 3 * (1 + math.log(n)) * telling(word)
        for word, n in self.body.items():
            self.terms[word] += (1 + math.log(n)) * telling(word)
        if self.site:
            self.terms['@' + self.site] += 2
        # The same artist, album or camera as files on a planet is a strong hint.
        for key, weight in (('artist', 3), ('album', 3)):
            if media.get(key):
                self.terms[f'@{key}:{media[key].lower()[:60]}'] += weight
        if self.device in ('camera', 'drone', 'action camera', 'scanner'):
            self.terms['@camera:' + (media.get('camera') or '').lower()[:60]] += 1


def telling(word):
    """How much sharing a word says two files go together."""
    if word in COMMON_STEMS or word == '#time':
        return 0.3
    return 0.6 if word[0] == '#' else 1.0


def urlpath(url):
    parts = re.split(r'[/?#=&._-]+', re.sub(r'^https?://[^/]+', '', url or ''))
    return ' '.join(p for p in parts if not re.fullmatch(r'[0-9a-f]{6,}|\d+', p, re.I))


FOREIGN_WORDS = {lang: set(ws.split()) for lang, ws in FOREIGN.items()}


SCRIPT_RE = re.compile(r'[\u3040-\u30ff\u4e00-\u9fff\uac00-\ud7af\u0400-\u04ff\u0600-\u06ff\u0900-\u097f]')


def foreign(text):
    """How much of a note is in another language (0 to 1), for language planets."""
    if len(SCRIPT_RE.findall((text or '')[:3000])) >= 2:
        return 1.0
    tokens = TOKEN_RE.findall((text or '').lower()[:3000])
    if len(tokens) < 3:
        return 0.0
    best = max(sum(1 for t in tokens if t in ws) for ws in FOREIGN_WORDS.values())
    return min(1.0, best / len(tokens) * 4) if best >= 2 else 0.0


def subject_scores(doc, clues, emojis=(), written=''):
    """How much a file is about each topic and concept, from its words,
    website, form, emoji and language: (topics, concepts)."""
    topics, concepts = Counter(clues), Counter()
    topics['Language'] += 4 * foreign(written)
    # In a poem or a story the words are pictures, not the subject ("frost on the car").
    imagery = 0.35 if max(doc.forms.get('poem', 0), doc.forms.get('story', 0)) >= 0.8 else 1.0
    for bag, weight in ((doc.heads, 3.0), (doc.body, 1.0)):
        for word, n in bag.items():
            base = weight * (1 + math.log(n)) * (0.3 if word in QUALIFIERS else 1) * imagery
            found = TOPIC_WORDS.get(word)
            if found:
                share = base / len(found) * (1.5 if word in TOPIC_NAMES else 1)
                for topic in found:
                    topics[topic] += share
            found = CONCEPT_WORDS.get(word)
            if found:
                for concept in found:
                    concepts[concept] += base * (2 / 3 if weight > 1 else 1) / len(found)
    site = site_meaning(doc.site) if doc.site else None
    if site == 'News':
        section = next((w for w in re.split(r'[/._-]+', doc.path.lower())[:3] if stem(w) in TOPIC_NAMES), None)
        if section:
            site = sorted(TOPIC_NAMES[stem(section)])[0]  # bbc.co.uk/sport/football is sport
    if site:
        topic, concept = meaning(site)
        topics[topic] += 4
        if concept:
            concepts[concept] += 4
    if doc.group == 'Code':
        topics['Code'] += 3
    for found in emojis:
        topic, concept = meaning(found)
        topics[topic] += 3
        if concept:
            concepts[concept] += 3
    return topics, concepts


def topic_profile(raw, scale=3):
    """(unit vector over topics, how sure). A bigger scale needs more words to be sure."""
    raw = {t: v for t, v in raw.items() if v > 0}
    total = sum(raw.values())
    if not total:
        return {}, 0.0
    norm = math.sqrt(sum(v * v for v in raw.values()))
    sure = (1 - math.exp(-max(raw.values()) / scale)) * (max(raw.values()) / total) ** 0.5
    return {t: v / norm for t, v in raw.items()}, sure


# ---------------------------------------------------------------- pictures, sound and documents

DOC_LIMIT = 4000
DOC_CLUES = {name: (re.compile(clues, re.M), re.compile(tells, re.M) if tells else None)
             for name, (_, _, _, clues, tells) in DOC_TYPES.items()}


def doc_type(text, title=''):
    """What kind of document this is (an invoice, a payslip, a boarding pass...), or None."""
    text = (text or '').lower()
    title = (title or '').lower()
    if not text.strip() and not title.strip():
        return None
    best, best_score = None, 0.0
    for name, (clues, tells) in DOC_CLUES.items():
        found = {m.group(0) for m in clues.finditer(text)}
        found |= {m.group(0) for m in clues.finditer(title)}
        score = len(found)
        if tells and (tells.search(title) or tells.search(text[:300])):
            score += 2.5
        if score > best_score:
            best, best_score = name, score
    return best if best_score >= (3 if best == 'letter' else 2.5) else None


ART_MEDIUMS = {'painting', 'drawing', 'print', 'illustration', 'comic', 'render', 'pixel art', 'collage'}
PAPER_MEDIUMS = {'document', 'receipt', 'handwriting', 'sheet music', 'diagram', 'map'}
SCREEN_MEDIUMS = {'screenshot', 'interface', 'meme'}
PICTURE_FORMS = set(MEDIUMS) | {'song', 'recording', 'artwork', 'scan'}
MEDIUM_MEANING = {name: (topic, concept) for name, (topic, concept, _) in MEDIUMS.items()}
SIGHT_MEANING = {name: (topic, concept) for name, (topic, concept, _) in SIGHTS.items()}
GENRE_TOPICS = {'podcast': 'Podcasts', 'audiobook': 'Books', 'spoken': 'Podcasts', 'speech': 'Podcasts',
                'soundtrack': 'Film', 'score': 'Film'}


def read_media(doc, meta, media, row):
    """What a picture shows, how it was made, when and where; who made a song;
    what kind of document it is. Adds to the file's subjects, forms and role."""
    keys = row.keys() if hasattr(row, 'keys') else ()
    doc.added = row['created_at'] if 'created_at' in keys else None
    doc.taken = media.get('taken')
    gps = media.get('gps')
    doc.gps = tuple(gps) if isinstance(gps, list) and len(gps) == 2 else None
    doc.device = media.get('device')
    doc.artist = (media.get('artist') or '').lower() or None
    doc.genre = (media.get('genre') or '').lower() or None
    made = media.get('made')
    topics, concepts, forms, role = doc.topics, doc.concepts, doc.forms, doc.role

    doc.see, mediums, sights = sight.read(meta.get('see'))
    doc.medium = None
    doc.sights = {}
    if doc.see is not None:
        top = max(mediums, key=mediums.get) if mediums else None
        doc.medium = top if top and mediums[top] >= 0.3 else None
        for name, p in mediums.items():
            if p >= 0.2 and name != 'photo':  # most pictures are photos; only other kinds tell planets apart
                forms[name] = max(forms.get(name, 0), min(1.0, p * 1.4))
            topic, concept = MEDIUM_MEANING.get(name, (None, None))
            if topic:
                topics[topic] += 4 * p
            if concept:
                concepts[concept] += 4 * p
        # What an artwork or a screenshot shows matters less than that it is one.
        damp = 0.5 if doc.medium in ART_MEDIUMS | SCREEN_MEDIUMS else 0.3 if doc.medium in PAPER_MEDIUMS else 1.0
        doc.sights = {k: p * damp for k, p in sights.items()}
        for name, p in doc.sights.items():
            topic, concept = SIGHT_MEANING.get(name, (None, None))
            if topic:
                topics[topic] += 5 * p
            if concept:
                concepts[concept] += 5 * p
        if doc.medium == 'screenshot':
            doc.screenshot = True

    if made == 'screenshot':
        doc.screenshot = True
        forms['screenshot'] = 1.0
    elif made == 'drawn':
        topics['Art'] += 3
        concepts['illustration'] += 1.5
        forms['artwork'] = 1.0
        role['making'] += 0.6
    elif made == 'designed':
        topics['Design'] += 2.5
        role['making'] += 0.5
    elif made == 'generated':
        topics['Art'] += 1.5
        forms['artwork'] = 1.0
    elif made == 'edited' and doc.group == 'Images':
        topics['Photos'] += 1.5
        concepts['photography'] += 1.5
    elif made == 'scanned':
        forms['scan'] = 1.0
    elif made == 'produced':
        topics['Music'] += 3
        concepts['recording'] += 3
        role['making'] += 0.6
    elif made == 'notation':
        topics['Music'] += 3
        concepts['instruments'] += 2
        forms['sheet music'] = 1.0
    if doc.device in ('camera', 'drone', 'action camera') and doc.group in ('Images', 'Videos'):
        topics['Photos'] += 2.5  # a camera of its own says photography
        concepts['photography'] += 2.5
        role['making'] += 0.3
    if doc.group == 'Sounds':
        if doc.artist or media.get('album'):
            forms['song'] = 1.0
            topics[next((t for g, t in GENRE_TOPICS.items() if g in (doc.genre or '')), 'Music')] += 3
        elif made == 'voice memo' or re.match(r'(?:new )?recording\b|voice|memo', (row['title'] or '').lower()):
            forms['recording'] = 1.0
    if doc.doctype:
        topic, concept, role_name, _, _ = DOC_TYPES[doc.doctype]
        forms[doc.doctype] = 1.0
        if topic:
            topics[topic] += 3
        if concept:
            concepts[concept] += 3
        if role_name:
            role[role_name] += 0.6


_centres = {}  # (planet id, its pictures) -> the average of its pictures


def centre(planet):
    key = (planet.id, tuple(m.id for m in planet.members if m.see is not None)[:40])
    found = _centres.get(key)
    if found is None:
        if len(_centres) > 2000:
            _centres.clear()
        total = [0.0] * len(planet.pictures[0])
        for p in planet.pictures:
            for i, x in enumerate(p):
                total[i] += x
        norm = math.sqrt(sum(x * x for x in total)) or 1.0
        found = _centres[key] = array('f', (x / norm for x in total))
    return found


def picture_likeness(doc, planet):
    """How much the picture looks like the planet's pictures (0..1): mostly
    like their average, partly like the closest one."""
    if doc.see is None or not planet.pictures:
        return 0.0
    average = sight.dot(doc.see, centre(planet))
    closest = max(sight.dot(doc.see, p) for p in planet.pictures)
    alike = max(min(1.0, max(0.0, (average - 0.55) / 0.25)), 0.8 * min(1.0, max(0.0, (closest - 0.62) / 0.28)))
    return alike * min(1.0, 0.6 + 0.2 * len(planet.pictures))


def km(a, b):
    lat1, lon1, lat2, lon2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 12742 * math.asin(min(1.0, math.sqrt(h)))


def moment_match(doc, planet):
    """Taken at the same time or place as the planet's photos (the same trip, shoot or day out)."""
    if not doc.taken and not doc.gps:
        return 0.0
    best = 0.0
    for taken, gps in planet.moments:
        when = 0.0
        if doc.taken and taken:
            gap = abs(doc.taken - taken) / 3600
            when = 1.0 if gap <= 3 else 0.75 if gap <= 12 else 0.5 if gap <= 72 else 0.25 if gap <= 240 else 0.0
        where = None
        if doc.gps and gps:
            d = km(doc.gps, gps)
            where = 1.0 if d <= 1 else 0.8 if d <= 10 else 0.55 if d <= 60 else 0.3 if d <= 300 else 0.0
        if where is None:
            fit = 0.6 * when
        else:
            fit = max(when * (0.4 + 0.6 * where), 0.45 * where)
        best = max(best, fit)
    return best


def batch_match(doc, planet):
    """Added in the same go as files already on the planet."""
    if not doc.added or not planet.added:
        return 0.0
    gap = min(abs(doc.added - a) for a in planet.added)
    return 1.0 if gap <= 120 else 0.5 if gap <= 900 else 0.0


# ---------------------------------------------------------------- what a planet is about, and for

class Planet:
    """A planet read as a whole: what it's about (from its name and its files),
    what it's for, and what its files are like."""

    def __init__(self, row, members, vecs=None, terms=None):
        self.id = row['id']
        self.title = row['title'] or ''
        self.name = set(stems(self.title))
        self.about = Counter(stems(self.title))
        for word, n in Counter(stems(row['description'] or '')).items():
            self.about[word] += 0.5 * n
        self.members = members
        n = len(members)
        self.named_group = next((g for g, names in GROUP_NAMES.items()
                                 if self.name and self.name <= names | {'my', 'all', 'random'}), None)

        # What its name (and note, and emoji) say it's about.
        named, named_concepts = Counter(), Counter()
        # "Gear wishlist", "Art inspo", "Recipes to try": a word that says what a planet is for
        # says less about what it's about when other words in the name do that.
        subjects = {w for w in self.name if w not in ROLE_WORDS and w not in QUALIFIERS and (w in TOPIC_WORDS or w in CONCEPT_NAMES
                                                                      or w in CONCEPT_WORDS)}
        for word in self.name:
            lean = 0.35 if (word in QUALIFIERS and len(self.name) > 1) or (word in ROLE_WORDS and subjects) else 1.0
            for topic in TOPIC_NAMES.get(word, ()):
                named[topic] += lean * 6 / len(TOPIC_NAMES[word])
            for topic in TOPIC_WORDS.get(word, ()):
                named[topic] += lean * 4 / len(TOPIC_WORDS[word])
            for concept in CONCEPT_NAMES.get(word, ()):
                named_concepts[concept] += lean * 6 / len(CONCEPT_NAMES[word])
            if word not in TOPIC_NAMES or CONCEPT_NAMES.get(word):
                for concept in CONCEPT_WORDS.get(word, ()):
                    named_concepts[concept] += lean * 3 / len(CONCEPT_WORDS[word])
        for word, count in self.about.items():
            if word not in self.name:
                for topic in TOPIC_WORDS.get(word, ()):
                    named[topic] += 0.5 * count / len(TOPIC_WORDS[word])
        for found in emoji_in(self.title):
            topic, concept = meaning(found)
            named[topic] += 8
            if concept:
                named_concepts[concept] += 8
        self.named = named

        # What its files say, each file clearly about something pulling its way.
        shown, shown_concepts = Counter(), Counter()
        for m in members:
            vec, sure = topic_profile(m.topics)
            for t, v in vec.items():
                shown[t] += 10 * v * sure / max(2, n)
            vec, sure = topic_profile(m.concepts, CONCEPT_SCALE)
            for c, v in vec.items():
                shown_concepts[c] += 10 * v * sure / max(2, n)
        self.shown = shown
        self.content_topics = topic_profile(shown)
        self.topic_raw = named + shown
        self.topics = topic_profile(self.topic_raw)[0]
        self.concept_raw = named_concepts + shown_concepts
        self.concepts, self.concept_sure = topic_profile(self.concept_raw)

        self.vecs = [vecs[m.id] for m in members] if vecs else []
        self.df = Counter()
        if terms:
            for block_id in {m.id for m in members}:
                self.df.update(terms[block_id].keys())
        self.groups = Counter(m.group for m in members)
        self.exts = Counter(m.ext for m in members if m.ext)
        self.sites = Counter(m.site for m in members if m.site)
        self.forms = Counter()
        for m in members:
            for f, v in m.forms.items():
                self.forms[f] += v / n
        self.shots = sum(1 for m in members if m.screenshot)
        # Its pictures, sounds and documents.
        seen = [m for m in members if m.see is not None]
        self.pictures = [m.see for m in seen[:40]]
        self.mediums, self.sights = Counter(), Counter()
        for m in seen:
            if m.medium:
                self.mediums[m.medium] += 1
            for k, p in m.sights.items():
                self.sights[k] += p
        self.moments = [(m.taken, m.gps) for m in members if m.taken or m.gps][:80]
        self.added = [m.added for m in members if m.added][:80]
        self.doctypes = Counter(m.doctype for m in members if m.doctype)
        self.artists = Counter(m.artist for m in members if m.artist)
        self.genres = Counter(m.genre for m in members if m.genre)
        self.devices = Counter(m.device for m in members if m.device)

        # What it's for: its name, then what its files are like.
        roles = Counter()
        for word in self.name:
            for r in ROLE_WORDS.get(word, ()):
                roles[r] += 3 / len(ROLE_WORDS[word])
        for r, patterns in ROLE_PHRASES.items():
            if any(p.search(self.title) for p in patterns):
                roles[r] += 3
        if self.name & (PLACE_WORDS - NATIONAL) and not roles:
            roles['planning'] += 1.5  # a planet named after a place is usually a trip
        elif self.name & LANGUAGE_NAMES and not roles:
            roles['learning'] += 1.5  # and one named after a language, learning it
        named_role = set(roles)
        backing = Counter()
        for m in members:
            for r, v in m.role.items():
                roles[r] += 4 * v / max(3, n)
                backing[r] += v >= 0.3
        self.roles = roles
        ranked = roles.most_common(2) + [(None, 0.0)] * 2
        (top, best), (_, second) = ranked[0], ranked[1]
        # One link doesn't make a planet a collection: the name says so, or more than one file does.
        backed = (top in named_role or backing[top] >= 2
                  or (backing[top] and best >= 1.0 and best >= 2 * second))
        self.role = top if backed and best >= 0.75 and best >= 1.25 * second else None
        self.role_share = {r: v / best for r, v in roles.items()} if best else {}
        self.role_sure = min(1.0, best / 3) * (1 - second / best if best else 0) if best else 0.0


# ---------------------------------------------------------------- comparing

def cosine(a, b):
    if len(a) > len(b):
        a, b = b, a
    return sum(v * b.get(k, 0) for k, v in a.items())


def topic_match(a, b):
    """How alike two topic mixes are, with neighbouring topics (climbing
    training is sport and health) counting partly."""
    total = 0.0
    for topic, v in a.items():
        total += v * (b.get(topic, 0) + sum(k * b.get(other, 0) for other, k in KIN.get(topic, {}).items()))
    return min(1.0, total)


def unit(vec):
    norm = math.sqrt(sum(v * v for v in vec.values()))
    return {k: v / norm for k, v in vec.items()} if norm else {}


def name_match(doc, planet):
    """Does the file use the planet's name? 1 for its title, less for a mention.
    Everyday words in a name ("Morning pages") count for less. Returns (fit,
    whether it's the very word, which can mean something else)."""
    if not planet.name:
        return 0.0, False
    hits, exact = [], []
    words_in = len(doc.body)
    for word in planet.name:
        # Only a word with a meaning of its own can mean something else ("bass").
        exact.append((word in doc.heads or word in doc.body) and (word in TOPIC_WORDS or word in CONCEPT_WORDS))
        if word in doc.heads:
            hit = 1.0
        elif any(len(word) >= 5 and len(w) >= 5 and (w.startswith(word) or word.startswith(w)) for w in doc.heads):
            hit = 0.8
        elif PLACES.get(word, set()) & doc.heads.keys():
            hit = 0.75
        elif PLACES.get(word, set()) & doc.body.keys():
            hit = 0.6
        elif word in COUNTRY_OF and PLACES[COUNTRY_OF[word]] & (doc.heads.keys() | doc.body.keys()):
            hit = 0.5  # Kyoto planet, a note about Kurama
        elif word in doc.body:
            count = doc.body[word]
            hit = 0.45 + 0.15 * min(2, count - 1)
            if count == 1 and words_in > 150:
                hit = 0.3
            if word in doc.lead:
                hit = min(0.9, hit + 0.2)
        else:
            hit = 0.0
        if word in COMMON_STEMS and hit < 1.0:
            hit *= 0.35
        hits.append(hit)
    best = max(range(len(hits)), key=hits.__getitem__)
    return 0.7 * hits[best] + 0.3 * sum(hits) / len(hits), exact[best]


def look_match(doc, planet):
    if not doc.look or doc.look.get('v') != 2:
        return 0.0
    sims = []
    for m in planet.members:
        if not m.look or m.look.get('v') != 2:
            continue
        a, b = doc.look.get('colors') or {}, m.look.get('colors') or {}
        colors = sum(min(v, b.get(k, 0)) for k, v in a.items())
        ta, tb = set(doc.look.get('tags') or []), set(m.look.get('tags') or [])
        tags = len(ta & tb) / len(ta | tb) if ta | tb else 0
        sims.append(0.6 * colors + 0.4 * tags)
    if not sims:
        return 0.0
    sims.sort(reverse=True)
    return sum(sims[:3]) / len(sims[:3])


MEDIA = {'Images', 'Videos', 'Sounds'}
CONCEPT_SCALE = 4.5  # a fine subject needs more than one word to be sure of
DISTINCT_FORMS = {'poem', 'dated', 'measured', 'recipe', 'quote', 'checklist', 'list', 'tasks', 'code', 'tab',
                  'chapter', 'diary', 'prose', 'contact', 'table', 'story'} | PICTURE_FORMS | set(DOC_TYPES)
GENRES = {'poem', 'story', 'chapter', 'quote'}
STRONG_FORMS = {'poem', 'quote', 'code', 'recipe', 'tab', 'chapter', 'dated', 'measured', 'checklist', 'list',
                'diary', 'story'}
SUBJECT = ('name', 'topic', 'concept', 'content', 'site', 'look', 'visual', 'moment')


def evidence(doc, terms, vec_doc, planet, idf, df):
    """Each kind of clue that the file belongs on this planet, from 0 to 1."""
    n = len(planet.members)
    vec, sure = topic_profile(doc.topics)
    clues = {}
    clues['name'], exact = name_match(doc, planet)
    # A planet's name means what its files say it means: "Bass" full of tabs
    # is the guitar, so a sea bass recipe doesn't count as using its name.
    content_vec, content_sure = planet.content_topics
    if clues['name'] and exact and content_sure >= 0.25 and sure >= 0.25:
        agree = topic_match(vec, content_vec)
        clues['name'] *= 0.3 + 0.7 * agree

    cvec, csure = topic_profile(doc.concepts, CONCEPT_SCALE)
    concept = cosine(cvec, planet.concepts) if planet.concepts else 0.0
    clues['concept'] = concept * min(1.0, csure * 1.4)
    agree = topic_match(vec, planet.topics) if planet.topics else 0.0
    if csure >= 0.3 and planet.concept_sure >= 0.3:
        agree *= 0.55 + 0.45 * concept  # same topic, different concept (cycling vs. a dentist)
    clues['topic'] = agree * sure
    clues['agree'] = agree

    total = Counter()
    for vec_m in planet.vecs:
        for k, v in vec_m.items():
            total[k] += v
    for k, v in unit({w: c * idf.get(w, 1) for w, c in planet.about.items()}).items():
        total[k] += 2 * v  # the planet's own name and note count like two files
    vec_doc = {k: v for k, v in vec_doc.items() if k not in planet.name} if planet.name & vec_doc.keys() else vec_doc
    centroid = cosine(vec_doc, unit(total))
    near = sorted((cosine(vec_doc, vec_m) for vec_m in planet.vecs), reverse=True)[:2]
    nearest = sum(near) / len(near) if near else 0.0
    # Words of the file that, among all your files, live mostly on this planet
    # ('shakshuka' when your one shakshuka note is on Recipes).
    own = known = 0.0
    for word, weight in terms.items():
        if df.get(word) and word not in planet.name:
            known += weight * idf[word]
            own += weight * idf[word] * planet.df[word] / df[word]
    everything = sum(weight * idf.get(word, 1) for word, weight in terms.items()) or 1
    owned = own / known * min(1.0, 2.5 * known / everything) if known else 0.0
    clues['content'] = max(min(1.0, (0.5 * centroid + 0.5 * nearest) / 0.3), 0.9 * owned)

    if n:
        group = planet.groups[doc.group] / n
        ext = planet.exts[doc.ext] / n if doc.ext else group
        clues['kind'] = (0.7 * group + 0.3 * ext) * min(1.0, n / 3)
        if doc.group == 'Images' and planet.shots / n >= 0.6 and not doc.screenshot:
            clues['kind'] *= 0.3  # a planet of screenshots isn't for other pictures
    else:
        clues['kind'] = 0.0
    if planet.named_group == 'Screenshots':
        clues['named'] = 1.0 if doc.screenshot else 0.0
    else:
        clues['named'] = 1.0 if planet.named_group == doc.group else 0.0
    clues['site'] = min(1.0, planet.sites[doc.site] / 2) if doc.site else 0.0
    clues['look'] = look_match(doc, planet)
    clues['visual'] = picture_likeness(doc, planet)
    clues['moment'] = moment_match(doc, planet)

    # How it's written and what it's for tell planets on one subject apart
    # (poems from diary entries, a wishlist from a gear planet). They only
    # count where something about the subject fits too.
    about = max(clues[c] for c in SUBJECT)
    # Added in the same go only counts alongside something else in common, and
    # only when the rest of the go landed together (not spread over many planets).
    clues['batch'] = (batch_match(doc, planet) * min(1.0, max(0.0, (about - 0.15) / 0.25))
                      / max(1, getattr(doc, 'spread', 1) - 1))
    forms = {f: min(1.0, v) for f, v in doc.forms.items() if f in DISTINCT_FORMS}
    if n and forms:
        shared = sum(v * min(1.0, planet.forms.get(f, 0)) for f, v in forms.items())
        clues['form'] = shared / sum(forms.values()) * min(1.0, n / 2) * min(1.0, 0.5 + 2 * about)
    else:
        clues['form'] = 0.0
    if doc.role and planet.role:
        clues['role'] = (min(1.0, sum(min(1.0, v) * planet.role_share.get(r, 0) for r, v in doc.role.items()))
                         * planet.role_sure * min(1.0, max(0.0, (about - 0.15) / 0.35)))
    else:
        clues['role'] = 0.0
    # A poem doesn't go with diary entries, or a quote with chapters: the
    # planet's notes share a form of their own, and this file has another.
    strong = {f for f, v in forms.items() if v >= 0.8 and f in STRONG_FORMS}
    texty = [m for m in planet.members if m.group in TEXTY_GROUPS]
    theirs = sum(min(1.0, v) for m in texty for f, v in m.forms.items() if f in STRONG_FORMS) / max(1, len(texty))
    clues['clash'] = 0.0
    if strong and len(texty) >= 2 and not any(planet.forms.get(f) for f in strong):
        # 1: its notes have a form of their own; 0.5: a poem or story among notes that aren't.
        clues['clash'] = 1.0 if theirs >= 0.4 else 0.5 if strong & GENRES else 0.0
    return clues


def read_inside(doc):
    """Do we know what this picture, sound or video is, beyond being one?"""
    return doc.see is not None or bool(doc.artist or doc.taken or doc.gps or doc.device or doc.forms.get('song')
                                       or doc.forms.get('recording') or doc.forms.get('screenshot'))


def weights(doc):
    # A picture we can't see into can only go by being a picture; one we can
    # see into goes by what it shows.
    media = doc.group in MEDIA and not read_inside(doc)
    return {'name': 0.85, 'topic': 0.7, 'concept': 0.55, 'content': 0.75, 'site': 0.55, 'look': 0.3,
            'kind': 0.5 if media else 0.2 if doc.group in MEDIA else 0.25,
            'named': 0.55 if doc.group in MEDIA else 0.5, 'form': 0.55, 'role': 0.45,
            'visual': 0.7, 'moment': 0.5, 'batch': 0.25}


FITS = 0.34   # fits well enough whatever else there is
CLEAR = 0.22  # or, with something specific, fits clearly better than any other planet
SPECIFIC = SUBJECT


def score(doc, terms, vec_doc, planet, idf, df):
    """How well the file fits, 0 to 1: the clues combine like independent
    witnesses, so one strong clue or several weaker ones are both enough."""
    clues = evidence(doc, terms, vec_doc, planet, idf, df)
    miss = 1.0
    for clue, weight in weights(doc).items():
        miss *= 1 - weight * clues[clue]
    # A file that's clearly about one thing fits less well on a planet that's
    # clearly about another (a poem mentioning salt isn't a recipe).
    _, sure = topic_profile(doc.topics)
    if sure and planet.topics and clues['name'] < 0.5:
        strength = 0.4 + 0.3 * planet.content_topics[1]
        miss = 1 - (1 - miss) * (1 - strength * sure * max(0.0, 0.6 - clues['agree']) / 0.6)
    if clues['clash']:
        miss = 1 - (1 - miss) * (1 - 0.2 * clues['clash'])
    blind = doc.group in MEDIA and not read_inside(doc)
    clues['specific'] = 1 - math.prod(1 - w * clues[c] for c, w in weights(doc).items()
                                      if c in SPECIFIC or blind or (doc.group in MEDIA and c == 'form'))
    return 1 - miss, clues


# ---------------------------------------------------------------- choosing

_members = {}  # (block id, updated_at, meta) -> Doc; files on planets rarely change


def member(row):
    key = (row['id'], row['updated_at'], row['meta'])
    doc = _members.get(key)
    if doc is None:
        if len(_members) > 20000:
            _members.clear()
        doc = _members[key] = Doc(row, limit=5000)
    return doc


PER_PLANET = 150
MEMBER_SQL = ('SELECT * FROM (SELECT c.drawer_id, b.id, b.kind, b.title, b.description, b.content, b.file_name, '
              'b.ext, b.meta, b.updated_at, b.created_at, ROW_NUMBER() OVER (PARTITION BY c.drawer_id '
              'ORDER BY c.connected_at DESC) AS rn FROM connections c JOIN blocks b ON b.id = c.block_id '
              'JOIN drawers d ON d.id = c.drawer_id WHERE d.user_id = ? AND b.id != ?) WHERE rn <= ?')


def galaxy(conn, user_id, leave_out=''):
    """A person's planets (newest first) and the files on each, boiled down."""
    planets = conn.execute('SELECT id, title, description FROM drawers WHERE user_id = ? '
                           'ORDER BY updated_at DESC', (user_id,)).fetchall()
    members = {p['id']: [] for p in planets}
    for r in conn.execute(MEMBER_SQL, (user_id, leave_out, PER_PLANET)):
        members[r['drawer_id']].append(member(r))
    return planets, members


def weigh(docs):
    """How telling each word is across these files (rare means telling), and
    each file's words as a weighted unit vector."""
    terms = {i: d.terms for i, d in docs.items()}
    df = Counter()
    for t in terms.values():
        df.update(t.keys())
    idf = {w: math.log((len(docs) + 4) / (c + 0.5)) for w, c in df.items()}
    vecs = {i: unit({w: v * idf[w] for w, v in t.items()}) for i, t in terms.items()}
    return terms, df, idf, vecs


def pick(conn, user_id, row, extra='', explain=None):
    """Where a file belongs: (drawer id, None), or (None, title) for a new planet."""
    doc = Doc(row, extra)
    planets, members = galaxy(conn, user_id, row['id'])
    docs = {m.id: m for ms in members.values() for m in ms}
    docs[doc.id] = doc
    terms, df, idf, vecs = weigh(docs)
    df.subtract(terms[doc.id].keys())  # from here on: how many files on planets use each word

    ranked = []
    built = [Planet(p, members[p['id']], vecs, terms) for p in planets]
    doc.spread = sum(1 for planet in built if batch_match(doc, planet))  # planets holding the rest of this go
    for i, planet in enumerate(built):
        fit, clues = score(doc, terms[doc.id], vecs[doc.id], planet, idf, df)
        # A hair's preference for planets used lately, only to break ties.
        ranked.append((fit + 0.004 * (len(planets) - i) / len(planets), fit, planet, clues))
    ranked.sort(key=lambda r: r[0], reverse=True)
    if explain is not None:
        explain.extend((p.title, round(fit, 3), {k: round(v, 2) for k, v in clues.items() if v and k != 'agree'})
                       for _, fit, p, clues in ranked)
    if ranked:
        best, runner_up = ranked[0][1], (ranked[1][1] if len(ranked) > 1 else 0.0)
        clues = ranked[0][3]
        elsewhere = (topic_profile(doc.topics)[1] >= 0.55 and clues['agree'] < 0.4 and clues['name'] < 0.3
                     and clues['content'] < 0.3)
        enough = clues['specific'] >= 0.3 or doc.group in MEDIA  # more than being a note too
        if (best >= FITS and enough) or (best >= CLEAR and best - runner_up >= 0.06 and best >= 1.3 * runner_up
                            and clues['specific'] >= 0.1 and not elsewhere and not clues['clash']):
            return ranked[0][2].id, None
    title = new_title(doc)
    same = next((p['id'] for p in planets if p['title'].strip().lower() == title.lower()), None)
    return (same, None) if same else (None, title)


def new_title(doc):
    """A name for a new planet: what the file is about, if that's clear,
    otherwise what kind of thing it is."""
    vec, sure = topic_profile(doc.topics)
    if doc.doctype in DOC_TITLES:
        return DOC_TITLES[doc.doctype]
    if doc.medium and doc.medium != 'photo' and doc.medium in MEDIUM_TITLES:
        return MEDIUM_TITLES[doc.medium]
    if doc.group in MEDIA:
        # A picture of something clear is named after it: Climbing, Pottery, Dogs.
        cvec, csure = topic_profile(doc.concepts, CONCEPT_SCALE)
        if cvec and csure >= 0.3:
            concept = max(cvec, key=cvec.get)
            if not vec or CONCEPT_TOPIC.get(concept) == max(vec, key=vec.get):
                return CONCEPT_TITLES.get(concept, concept.capitalize())
        if doc.group == 'Sounds' and doc.forms.get('song'):
            return 'Music'
    if vec and sure >= 0.45:
        return max(vec, key=vec.get)
    top = max(vec, key=vec.get) if vec else None
    if top == 'To do' and (doc.forms.get('tasks') or doc.forms.get('checklist') or doc.forms.get('appointment')):
        return top
    return doc.group


DOC_TITLES = {'invoice': 'Invoices', 'receipt': 'Receipts', 'bank statement': 'Bank statements',
              'payslip': 'Payslips', 'tax': 'Tax', 'bill': 'Bills', 'insurance': 'Insurance', 'contract': 'Contracts',
              'tenancy': 'Home', 'cv': 'CV', 'cover letter': 'Job applications', 'boarding pass': 'Travel',
              'booking': 'Travel', 'ticket': 'Tickets', 'menu': 'Menus', 'manual': 'Manuals', 'medical': 'Health',
              'school report': 'School', 'certificate': 'Certificates', 'paper': 'Papers', 'lecture': 'Lectures',
              'script': 'Scripts'}
MEDIUM_TITLES = {'painting': 'Paintings', 'drawing': 'Drawings', 'print': 'Prints', 'illustration': 'Illustrations',
                 'comic': 'Comics', 'render': '3D', 'pixel art': 'Pixel art', 'collage': 'Collages',
                 'screenshot': 'Screenshots', 'document': 'Documents', 'receipt': 'Receipts',
                 'handwriting': 'Handwritten notes', 'diagram': 'Diagrams', 'map': 'Maps',
                 'sheet music': 'Sheet music', 'graphic design': 'Design', 'logo': 'Logos', 'interface': 'UI design',
                 'meme': 'Memes'}
CONCEPT_TITLES = {'ceramics': 'Pottery', 'portraits': 'People', 'outdoors': 'Outdoors', 'trip planning': 'Travel',
                  'cooking': 'Food', 'live music': 'Gigs', 'strength': 'Gym', 'birthdays': 'Parties',
                  'printmaking': 'Prints', '3d': '3D', 'art history': 'Art', 'interface design': 'UI design',
                  'day job': 'Work', 'freelance': 'Work', 'kids': 'Kids', 'instruments': 'Music',
                  'recording': 'Music', 'records': 'Records', 'medical': 'Health', 'textiles': 'Textiles'}


# ---------------------------------------------------------------- what a planet is for

ROLE_TEXT = {
    'collecting': 'Collecting {}', 'making': 'Making {}', 'planning': 'Planning {}', 'tasks': '{} to do',
    'logging': 'A log of {}', 'learning': 'Learning {}', 'keeping': 'Keeping {} records', 'wanting': '{} you want',
}


SUBJECT_TEXT = {'trip planning': 'a trip', 'meal planning': 'meals', 'reading list': 'books to read',
                'day job': 'a day job', 'programming languages': 'programming', 'art history': 'art',
                'live music': 'gigs', 'music admin': 'music admin', 'to do': 'things', 'portraits': 'people',
                'outdoors': 'the outdoors', 'strength': 'the gym', 'kids': 'the kids', '3d': '3D work'}
# How a planet's pictures, sounds and documents read in a summary.
MEDIUM_TEXT = {'photo': 'Photos', 'painting': 'Paintings', 'drawing': 'Drawings', 'print': 'Prints',
               'illustration': 'Illustrations', 'comic': 'Comics', 'render': '3D renders', 'pixel art': 'Pixel art',
               'collage': 'Collages', 'screenshot': 'Screenshots', 'document': 'Documents', 'receipt': 'Receipts',
               'handwriting': 'Handwritten notes', 'diagram': 'Diagrams', 'map': 'Maps', 'sheet music': 'Sheet music',
               'graphic design': 'Graphic design', 'logo': 'Logos', 'interface': 'Interface designs',
               'meme': 'Memes', 'song': 'Songs', 'recording': 'Recordings', 'video': 'Videos'}
DOC_TEXT = {'invoice': 'Invoices', 'receipt': 'Receipts', 'bank statement': 'Bank statements', 'payslip': 'Payslips',
            'tax': 'Tax papers', 'bill': 'Bills', 'insurance': 'Insurance papers', 'contract': 'Contracts',
            'tenancy': 'Tenancy papers', 'cv': 'CVs', 'cover letter': 'Cover letters', 'letter': 'Letters',
            'boarding pass': 'Boarding passes', 'booking': 'Bookings', 'ticket': 'Tickets', 'menu': 'Menus',
            'manual': 'Manuals', 'medical': 'Medical papers', 'school report': 'School reports',
            'certificate': 'Certificates', 'paper': 'Papers', 'lecture': 'Lecture notes', 'script': 'Scripts',
            'form': 'Forms'}
# A medium that already says what it's about doesn't need "of art".
SELF_EVIDENT = {('painting', 'painting'), ('drawing', 'drawing'), ('print', 'printmaking'),
                ('illustration', 'illustration'), ('comic', 'illustration'), ('render', '3d'),
                ('sheet music', 'instruments'), ('graphic design', 'print'), ('logo', 'branding'),
                ('interface', 'interface design'), ('receipt', 'money'), ('map', 'travel'), ('diagram', 'science'),
                ('pixel art', 'illustration'), ('collage', 'art'), ('painting', 'art'), ('drawing', 'art'),
                ('print', 'art'), ('illustration', 'art')}


def _shares(raw, limit=3, least=0.1):
    raw = {k: v for k, v in raw.items() if v > 0}
    total = sum(raw.values())
    if not total:
        return []
    ranked = sorted(((k, v / total) for k, v in raw.items()), key=lambda kv: kv[1], reverse=True)
    return [(k, round(v, 2)) for k, v in ranked[:limit] if v >= least]


def purpose(conn, drawer_id):
    """What one planet is about and what it's for, read from its name, its note
    and every file on it. For autosort's sake and for features that switch on
    when a planet needs them. None if there's no such planet.

    topics / concepts: what it's about, broad and fine, with shares.
    role: collecting, making, planning, tasks, logging, learning, keeping,
          wanting, or None when it's mixed or unclear; roles has the scores.
    kinds / forms: what its files are (Images, Notes...) and how its notes are
          written (list, poem, dated, measured, recipe, prose...), as shares.
    keywords: words that are its own (used on it, rarely elsewhere).
    places: places it mentions. sure: 0 to 1, how clear all this is.
    """
    row = conn.execute('SELECT id, user_id, title, description FROM drawers WHERE id = ?', (drawer_id,)).fetchone()
    if row is None:
        return None
    planets, members = galaxy(conn, row['user_id'])
    mine = members.get(drawer_id, [])
    planet = Planet(row, mine)
    n = len(mine)

    # Words that are this planet's own, in the form people wrote them.
    everywhere = Counter()
    for ms in members.values():
        for m in ms:
            everywhere.update(set(m.terms))
    here = Counter()
    for m in mine:
        here.update(set(m.terms))
    total_files = sum(len(ms) for ms in members.values()) or 1
    own = []
    for word, count in here.items():
        if word.startswith(('#', '@')) or word in COMMON_STEMS or word.isdigit() or len(word) < 3:
            continue
        if count >= 2 or (n <= 3 and everywhere[word] == count):
            rarity = math.log((total_files + 1) / (everywhere[word] + 0.5))
            own.append((count / max(1, n) * rarity * (count / everywhere[word]), word))
    own.sort(reverse=True)
    surface = {}
    if own:
        wanted = {w for _, w in own[:8]}
        for r in conn.execute('SELECT b.title, b.description, b.content, b.file_name FROM connections c '
                              'JOIN blocks b ON b.id = c.block_id WHERE c.drawer_id = ?', (drawer_id,)):
            text = ' '.join(filter(None, [r['title'], r['description'], r['file_name'],
                                          (r['content'] or '')[:5000]]))
            for word in words(text):
                s = _stem(word)
                if s in wanted:
                    surface.setdefault(s, Counter())[word] += 1
    keywords = [surface[w].most_common(1)[0][0] if w in surface else w for _, w in own[:8]]

    named = set(planet.name)
    for m in mine:
        named |= m.heads.keys() | m.body.keys()
    places = sorted(w for w in named if w in PLACES)
    places += sorted({w for w in named if w in PLACE_WORDS and w not in PLACES})[:6]

    topics = _shares(planet.topic_raw)
    concepts = _shares(planet.concept_raw, least=0.15)
    kinds = _shares(planet.groups, limit=4, least=0.05)
    forms = sorted(((f, round(v, 2)) for f, v in planet.forms.items() if v >= 0.2), key=lambda fv: -fv[1])
    sure = topic_profile(planet.topic_raw)[1]

    lead = concepts[0][0] if concepts and concepts[0][1] >= 0.4 else None
    if lead and topics and CONCEPT_TOPIC[lead] != topics[0][0]:
        lead = None
    subject_key = lead or (topics[0][0].lower() if topics else '')
    subject = subject_key
    if not subject and kinds:
        subject = kinds[0][0].lower()
    subject = SUBJECT_TEXT.get(subject, subject)

    # What its files are, in every format: pictures by kind of picture, sounds, documents.
    contains = Counter()
    for m in mine:
        if m.group in ('Images', 'Videos'):
            contains[m.medium or ('video' if m.group == 'Videos' else 'picture')] += 1
        elif m.group == 'Sounds':
            contains['song' if m.forms.get('song') else 'recording' if m.forms.get('recording') else 'sound'] += 1
        elif m.doctype:
            contains[m.doctype] += 1
        else:
            contains[m.group.lower().rstrip('s') if m.group != 'Notes' else 'note'] += 1
    contains_shares = _shares(contains, limit=5, least=0.05)
    shows = _shares(planet.sights, limit=5, least=0.08)
    doctypes = _shares(planet.doctypes, limit=3, least=0.15)

    if planet.role and subject:
        summary = ROLE_TEXT[planet.role].format(subject)
        summary = summary[0].upper() + summary[1:]
    elif subject:
        summary = subject[0].upper() + subject[1:]
    else:
        summary = 'Not clear yet'
    # A planet mostly of one kind of picture, sound or document says so first:
    # "Photos of climbing", "Prints", "Invoices", "Songs (jazz)".
    if contains_shares and contains_shares[0][1] >= 0.5 and n >= 2:
        main = contains_shares[0][0]
        label = MEDIUM_TEXT.get(main) or DOC_TEXT.get(main)
        if label and main == 'song' and planet.genres:
            summary = f'{label} ({planet.genres.most_common(1)[0][0]})'
        elif label and subject_key and (main, subject_key) not in SELF_EVIDENT and main in MEDIUM_TEXT \
                and subject.lower() not in label.lower():
            summary = f'{label} of {subject}'
        elif label:
            summary = label
    return {
        'id': row['id'], 'title': row['title'], 'files': n,
        'topics': topics, 'concepts': concepts,
        'role': planet.role, 'roles': [(r, round(v, 2)) for r, v in planet.roles.most_common(4) if v > 0],
        'kinds': kinds, 'contains': contains_shares, 'shows': shows, 'documents': doctypes,
        'forms': forms[:5], 'keywords': keywords, 'places': places,
        'music': {'artists': [a for a, _ in planet.artists.most_common(3)],
                  'genres': [g for g, _ in planet.genres.most_common(3)]} if planet.artists or planet.genres else None,
        'cameras': dict(planet.devices) or None,
        'sure': round(sure, 2), 'summary': summary,
    }
