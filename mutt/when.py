"""The days in a note: what makes it a comet (DESIGN.md "Comets").

`read(text, written)` finds every day the words name, read from when they were
written: "Thursday" is the Thursday after the note was written, "24 Nov" the
next 24 November (every year, for a birthday). It is careful on purpose: only
a clear day counts, never a time alone ("the light at 6pm"), never a fraction
("1/2 cup"), never "Day 1" or "every Tuesday", and a date the note was written
after (a diary's own day) is a record, not a day still to come.

A note becomes a comet only when its owner says so (the offer under the box);
the day found is then kept in `reminders` (`comets` in api.py), and read again
whenever the note's words change.
"""
import re
from datetime import date, datetime, timedelta

MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
NUMBERS = {'a': 1, 'an': 1, 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7,
           'eight': 8, 'nine': 9, 'ten': 10, 'eleven': 11, 'twelve': 12, 'fourteen': 14}
# A day with no time of its own is closest at noon (the comet rounds the void then).
NOON = '12:00'
LONG = 400   # past this many characters only the first line is read: a long piece mentions days in passing

MONTH = r'(?P<mon>jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?'
ORD = r'(?:st|nd|rd|th)?'
YEAR = r'(?:,?\s+(?P<year>(?:19|20)\d\d))?'
WEEKDAY = (r'(?P<wd>monday|tuesday|wednesday|thursday|friday|saturday|sunday|'
           r'mon|tues?|weds?|thur?s?|fri|sat|sun)\b\.?')
TIME = (r'(?P<h>\d{1,2})(?::(?P<m>[0-5]\d))?\s?(?P<ap>a\.?m\.?|p\.?m\.?)(?![a-z])'
        r'|(?P<h24>[01]?\d|2[0-3]):(?P<m24>[0-5]\d)(?!\s*/|\d)'
        r'|(?P<noon>noon|midday)\b|(?P<midnight>midnight)\b')

PATTERNS = [
    ('iso', re.compile(r'\b(?P<y>(?:19|20)\d\d)-(?P<mo>\d{1,2})-(?P<d>\d{1,2})\b')),
    # numbers alone only with a year: "1/2 cup" is not the first of February
    ('numeric', re.compile(r'\b(?P<d>\d{1,2})[/.](?P<mo>\d{1,2})[/.](?P<y>(?:19|20)?\d\d)\b')),
    ('day-month', re.compile(r'\b(?P<d>\d{1,2})' + ORD + r'\s+(?:of\s+)?' + MONTH + YEAR + r'(?![a-z])', re.I)),
    ('month-day', re.compile(r'\b' + MONTH + r'\s+(?P<d>\d{1,2})' + ORD + r'(?![\d:])' + YEAR + r'\b', re.I)),
    ('weekday', re.compile(r'\b(?P<lead>next\s+|this\s+|coming\s+|every\s+|each\s+|on\s+)?' + WEEKDAY + r'(?P<s>s\b)?', re.I)),
    ('tomorrow', re.compile(r'\b(?:tomorrow|tmrw|tmr)\b', re.I)),
    ('tonight', re.compile(r'\btonight\b', re.I)),
    ('today', re.compile(r'\b(?:today|this\s+(?:morning|afternoon|evening))\b', re.I)),
    ('in', re.compile(r'\bin\s+(?P<n>\d{1,2}|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fourteen)\s+'
                      r'(?P<unit>days?|weeks?)\b', re.I)),
]
TIME_RE = re.compile(TIME, re.I)
YEARLY_RE = re.compile(r'\b(?:birthday|bday|b-day|anniversary)\b', re.I)
NEAR = 28   # how far (characters) a time may sit from its day, on the same line


def _month(word):
    return MONTHS.index(word[:3].lower()) + 1


def _clock(m):
    """'15:00' from a time match, or None."""
    if m.group('noon'):
        return '12:00'
    if m.group('midnight'):
        return '23:59'
    if m.group('h24') is not None:
        return f'{int(m.group("h24")):02d}:{m.group("m24")}'
    h = int(m.group('h'))
    if not 1 <= h <= 12:
        return None
    pm = m.group('ap').lower().startswith('p')
    h = (h % 12) + (12 if pm else 0)
    return f'{h:02d}:{m.group("m") or "00"}'


def _safe(y, mo, d):
    try:
        return date(y, mo, d)
    except ValueError:
        return None


def _found(text):
    """Every day phrase in the text: (kind, match)."""
    out = []
    taken = []
    for kind, rx in PATTERNS:
        for m in rx.finditer(text):
            if any(m.start() < e and s < m.end() for s, e in taken):
                continue
            out.append((kind, m))
            taken.append((m.start(), m.end()))
    return out


def _time_near(text, start, end, used):
    """The time written next to a day (on the same line, a few words away), if any."""
    line_start = text.rfind('\n', 0, start) + 1
    line_end = text.find('\n', end)
    line_end = len(text) if line_end < 0 else line_end
    best = None
    for m in TIME_RE.finditer(text, line_start, line_end):
        if m.start() in used:
            continue
        gap = m.start() - end if m.start() >= end else start - m.end()
        if gap < 0 or gap > NEAR:
            continue
        clock = _clock(m)
        if clock and (best is None or gap < best[0]):
            best = (gap, clock, m)
    if best:
        used.add(best[2].start())
        return best[1], best[2]
    return None, None


def read(text, written):
    """The days a note names, from `written` (a naive local datetime):
    [{'day': date, 'time': 'HH:MM' or None, 'said': words, 'yearly': bool}], in order of the text."""
    text = text or ''
    if len(text) > LONG:
        text = text.split('\n', 1)[0][:LONG]
    yearly_note = bool(YEARLY_RE.search(text))
    start = written.date()
    used = set()
    days = []
    found = sorted(_found(text), key=lambda f: f[1].start())
    dates = [m for k, m in found if k not in ('weekday', 'tomorrow', 'tonight', 'today', 'in')]
    for kind, m in found:
        # "Sat 21 Nov", "21 Nov (Sat)": the weekday belongs to the date beside it
        if kind == 'weekday' and any(0 <= d.start() - m.end() <= 3 or 0 <= m.start() - d.end() <= 3 for d in dates):
            continue
        day, yearly = None, False
        if kind == 'iso':
            day = _safe(int(m['y']), int(m['mo']), int(m['d']))
        elif kind == 'numeric':
            y = int(m['y'])
            y = y + 2000 if y < 100 else y
            d, mo = int(m['d']), int(m['mo'])
            day = _safe(y, mo, d) or _safe(y, d, mo)   # 24/11 first; 11/24 if that can't be
        elif kind in ('day-month', 'month-day'):
            word = m['mon']
            if word.lower() == 'may' and not word[0].isupper() and kind == 'month-day':
                continue  # "it may 3 times" is not a date; "May 3" is
            mo, d = _month(word), int(m['d'])
            if m['year']:
                day = _safe(int(m['year']), mo, d)
            else:
                yearly = yearly_note
                day = _safe(start.year, mo, d)
                # without a year: the next one, unless it's just gone (a note about a day just past)
                if day and day < start and (yearly or (start - day).days > 60):
                    day = _safe(start.year + 1, mo, d)
        elif kind == 'weekday':
            lead = (m['lead'] or '').strip().lower()
            word = m['wd']
            if lead in ('every', 'each') or m['s']:
                continue  # "every Tuesday", "on Saturdays": no one day
            if word.lower().startswith('thus'):
                continue
            wd = DAYS.index(word[:3].lower())
            ahead = (wd - start.weekday()) % 7
            day = start + timedelta(days=ahead)
        elif kind == 'tomorrow':
            day = start + timedelta(days=1)
        elif kind in ('tonight', 'today'):
            day = start
        elif kind == 'in':
            n = m['n'].lower()
            n = int(n) if n.isdigit() else NUMBERS[n]
            day = start + timedelta(days=n * (7 if m['unit'].lower().startswith('week') else 1))
        if not day:
            continue
        clock, tm = _time_near(text, m.start(), m.end(), used)
        said = m.group(0).strip()
        if tm is not None:
            a, b = min(m.start(), tm.start()), max(m.end(), tm.end())
            between = text[a:b]
            said = (re.sub(r'\s+', ' ', between).strip(' ,.-–—') if len(between) <= len(m.group(0)) + len(tm.group(0)) + 4
                    else f'{m.group(0).strip()} {tm.group(0).strip()}')
        short = kind == 'weekday' and len(m['wd'].rstrip('.')) <= 4
        if short and not clock and (m['lead'] or '').strip().lower() not in ('on', 'next', 'this'):
            continue  # "sat on the step", "Sun cream": a short day name counts beside a time, or after "on"
        if kind == 'today' and not clock:
            continue  # "today I felt…" is a diary; "today 4pm" is a day
        if kind == 'weekday' and day == start and not (clock and clock > written.strftime('%H:%M')):
            # the day it was written: a note headed "Monday" on a Monday is about that day, gone by
            # tomorrow; only "next Monday" means a week on
            if (m['lead'] or '').strip().lower() != 'next':
                continue
            day += timedelta(days=7)
        if day < start or (day == start and kind not in ('tonight',) and not (clock and clock > written.strftime('%H:%M'))):
            if not yearly:
                continue  # a record of a day gone, not one to come
        days.append({'day': day, 'time': clock, 'said': said, 'yearly': yearly})
    return days


def next_of(found, today):
    """The day a found date next falls on, on or after `today` (a yearly one comes round again)."""
    day = found['day']
    if found['yearly']:
        while day < today:
            day = _safe(day.year + 1, day.month, day.day) or date(day.year + 1, day.month, 28)
    return day


def year_before(day):
    """The same day a year earlier (28 Feb for a 29th)."""
    return _safe(day.year - 1, day.month, day.day) or date(day.year - 1, day.month, 28)


def at(found, day):
    """When the comet is closest: its day at its time, or noon."""
    h, m = (found['time'] or NOON).split(':')
    return datetime(day.year, day.month, day.day, int(h), int(m))
