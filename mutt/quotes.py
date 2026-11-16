"""Quotes: a note that holds someone's words, read into the words, who said
them and where from. Whether a note is a quote at all is sorting.form's
answer (the one reader of how a note is written); this only splits one up,
so a commonplace book can set it as a quote. Nothing is stored: a note
edited anywhere reads again the next time it's shown.

Written the ways people keep quotes:
    “Hope is the thing with feathers.” — Emily Dickinson
    "We are such stuff as dreams are made on." - Shakespeare, The Tempest
    Be patient toward all that is unsolved in your heart.
    — Rainer Maria Rilke, Letters to a Young Poet
    “Here's looking at you, kid.”
    Rick (Casablanca, 1942)
    Mum: "Just start. The rest follows."
    ...and a link on its own last line, whose site stands in for a source.
"""
import re
from urllib.parse import urlparse

from . import lexicon

LIMIT = 1200          # a passage longer than this is writing, not a quote
OPEN = '"“‘«\'„'
CLOSE = '"”’»\''
DASH = r'(?:[-–—―~]{1,2})'
DASH_LINE = re.compile(r'^\s*' + DASH + r'\s*(\S.{0,119})$')
INLINE = re.compile(r'^(.*[' + CLOSE + r'])\s*' + DASH + r'\s*([^\n' + OPEN + r']{1,120})$', re.S)
PREFIX = re.compile(r'^([A-Z][\w.\' -]{0,40}?)\s*:\s*([' + OPEN + r'].+[' + CLOSE + r'])$', re.S)
URL_LINE = re.compile(r'^\s*(https?://\S+)\s*$')
PAREN_END = re.compile(r'^(.*?)\s*\(([^()]{1,80})\)\s*$')
JOIN = re.compile(r'\s+(?:in|from|on)\s+(?=\S)')
PLAIN_CREDIT = re.compile(r'^[A-Z][^\n]{0,79}$')
ENDS_QUOTED = re.compile(r'[' + CLOSE + r'][.,]?\s*$')

# How a note is written that means it isn't a passage kept for its words.
NOT_QUOTES = {'checklist', 'list', 'tasks', 'recipe', 'code', 'tab', 'table', 'dated', 'diary', 'measured',
              'contact', 'priced', 'appointment', 'chapter', 'story'}
_NAME_WORDS = set(lexicon.QUOTE_NAMES)


def _unwrap(words):
    """The words without the quotation marks round them: (words, marked)."""
    w = words.strip()
    if len(w) >= 3 and w[0] in OPEN and w[-1] in CLOSE:
        return w[1:-1].strip(), True
    # a closing mark followed by a full stop or a comma ("…kid”.)
    if len(w) >= 4 and w[0] in OPEN and w[-2] in CLOSE and w[-1] in '.,':
        return w[1:-2].strip(), True
    return w, False


def _clean(part):
    part = part.strip().strip('*_').strip()
    if len(part) >= 2 and part[0] in OPEN and part[-1] in CLOSE:
        part = part[1:-1].strip()
    return part.rstrip('.,;').strip()


def credit(line):
    """'Rick, Casablanca (1942)' -> ('Rick', 'Casablanca (1942)')."""
    line = _clean(line)
    if not line:
        return '', ''
    m = PAREN_END.match(line)
    if m and m.group(1) and ',' not in m.group(1):   # Rick (Casablanca, 1942)
        return _clean(m.group(1)), _clean(m.group(2))
    who, _, source = line.partition(',')
    if not source:
        bits = JOIN.split(line, maxsplit=1)
        who, source = (bits[0], bits[1]) if len(bits) == 2 and bits[0][:1].isupper() else (line, '')
    return _clean(who), _clean(source)


def parts(text):
    """{'words', 'who', 'source', 'link', 'marked', 'credited'} for a note
    written the way quotes are kept, or None. It doesn't judge: a short
    plain line comes back as words with no one to credit."""
    text = (text or '').strip()
    if not text or len(text) > LIMIT:
        return None
    lines = [ln.rstrip() for ln in text.splitlines()]
    while lines and not lines[-1].strip():
        lines.pop()
    link = ''
    if len(lines) >= 2 and URL_LINE.match(lines[-1]):
        link = URL_LINE.match(lines.pop())[1]
        while lines and not lines[-1].strip():
            lines.pop()
    if not lines:
        return None
    said = ''
    filled = [ln for ln in lines if ln.strip()]
    last = DASH_LINE.match(filled[-1])
    body = '\n'.join(lines).strip()
    if last and len(filled) >= 2 and not any(DASH_LINE.match(ln) for ln in filled[:-1]):
        said = last.group(1)
        body = '\n'.join(lines[:lines.index(filled[-1])]).strip()
    elif INLINE.match(body):
        m = INLINE.match(body)
        body, said = m.group(1), m.group(2)
    elif PREFIX.match(body):
        m = PREFIX.match(body)
        said, body = m.group(1), m.group(2)
    elif len(filled) >= 2 and filled[0].lstrip()[:1] in OPEN and PLAIN_CREDIT.match(filled[-1].strip()) \
            and ENDS_QUOTED.search(filled[-2]):
        # a quoted passage, then a short plain line naming who said it
        said = filled[-1].strip()
        body = '\n'.join(lines[:lines.index(filled[-1])]).strip()
    words, marked = _unwrap(body)
    if not words:
        return None
    who, source = credit(said) if said else ('', '')
    if len(who.split()) > 8:   # a sentence, not a name: keep it whole as the source of the words
        who, source = '', _clean(said)
    if not source and link:
        source = (urlparse(link).hostname or '').removeprefix('www.')
    return {'words': words, 'who': who, 'source': source, 'link': link,
            'marked': marked, 'credited': bool(who or source)}


def credited(text):
    """Written as a quote with someone named (sorting.form's widest sign)."""
    p = parts(text)
    return bool(p and p['credited'] and (p['marked'] or p['words'].count('\n') <= 8))


def named(title):
    """A planet called Quotes, Sayings, Commonplace book…"""
    return bool(set(re.findall(r'[a-z]+', (title or '').lower())) & _NAME_WORDS)


def on_wall(row, form):
    """Whether a note belongs on a commonplace book's wall: a quote, or a short
    passage that isn't written as anything else (a list, a recipe, a log)."""
    if row['kind'] != 'text' or not (row['content'] or '').strip() or len(row['content'].strip()) > LIMIT:
        return False
    return not any(form.get(k, 0) >= 0.7 for k in NOT_QUOTES)


def is_quote(form):
    """sorting.form reads it as a quote, and not as a list or anything else first."""
    return bool(form.get('quote')) and not any(form.get(k, 0) >= 0.7 for k in NOT_QUOTES)


def size_of(words):
    """1 short, 2 a sentence or two, 3 a passage: the words are set smaller the longer they are."""
    n = len(words)
    return 1 if n <= 70 else 2 if n <= 180 else 3


def wall(rows, form, title=''):
    """The quotes on a planet, in its own order: [{'id', 'words', 'who', 'source', 'link', 'size'}].
    form: sorting.form. On a planet named for quotes, a short passage with no
    one named counts too; elsewhere a quote has to read as one."""
    by_name = named(title)
    out = []
    for row in rows:
        f = form(row['content'] or '') if row['kind'] == 'text' else {}
        if not (on_wall(row, f) if by_name else on_wall(row, f) and is_quote(f)):
            continue
        p = parts(row['content'])
        if not p:
            continue
        out.append({'id': row['id'], 'words': p['words'], 'who': p['who'], 'source': p['source'],
                    'link': p['link'], 'size': size_of(p['words'])})
    return out


def _names(people):
    if len(people) == 1:
        return people[0]
    if len(people) == 2:
        return f'{people[0]} and {people[1]}'
    rest = len(people) - 2
    return f'{people[0]}, {people[1]} and {rest} other{"s" if rest > 1 else ""}'


def signs(title, rows, form):
    """Whether a planet is kept as a commonplace book: {'count', 'signs',
    'people'}. Quotes count; on a planet named for them, short passages
    count too."""
    by_name = named(title)
    count, people = 0, []
    for row in rows:
        if row['kind'] != 'text':
            continue
        f = form(row['content'] or '')
        if not (is_quote(f) if not by_name else on_wall(row, f)):
            continue
        count += 1
        p = parts(row['content'])
        if p and p['who'] and p['who'].lower() not in (x.lower() for x in people):
            people.append(p['who'])
    out = []
    if by_name:
        out.append(f'It’s called “{title}”.')
    if count:
        n = len(rows)
        out.append(f'{count} of its {n} files {"is a quote" if count == 1 else "are quotes"}.' if n > count
                   else ('Its one file is a quote.' if count == 1 else f'All {count} of its files are quotes.'))
    if people:
        out.append(f'Said by {_names(people)}.')
    return {'count': count, 'signs': out[-2:], 'people': len(people)}
