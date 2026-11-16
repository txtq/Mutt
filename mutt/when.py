"""The days in a note: what makes it a comet (DESIGN.md "Comets").

`read(text, written)` finds every day the words name, read from when they were
written: "Thursday" is the Thursday after the note was written, "24 Nov" the
next 24 November (every year, for a birthday). It reads every way of saying
when (the user: "suggest a comet if you imply a date, time, day of the week or
month"): a day, a weekday, "the 20th", "this weekend", "next week", "end of the
month", "in March", "in 2 hours", "Friday morning", and a time alone ("call Mum
at 5" is today at five, or tomorrow once it has gone). Never a fraction ("1/2
cup"), "Day 1", anything every week or every day, and a date the note was
written after (a diary's own day) is a record, not a day still to come.

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
        r'|(?P<noon>noon|midday)\b|(?P<midnight>midnight)\b'
        # "at 5", "at 7 o'clock": an hour said plainly (1 to 7 is the afternoon or evening, 8 to 11 the morning)
        r'|\bat\s+(?P<hb>1[0-2]|[1-9])(?:\s*o[\'’]?clock)?(?![\d:.,/%°])'
        r'(?!\s*(?:percent|per\b|degrees|deg\b|of\b|out\b|x\b|times\b|points?\b|people\b|stars?\b|mph|km|miles?\b|kg\b|lbs?\b))'
        # "Friday morning", "tomorrow evening": a part of the day, beside a day only
        r'|(?P<part>morning|afternoon|evening|night)\b')
PARTS = {'morning': '09:00', 'afternoon': '15:00', 'evening': '18:00', 'night': '20:00'}

PATTERNS = [
    ('iso', re.compile(r'\b(?P<y>(?:19|20)\d\d)-(?P<mo>\d{1,2})-(?P<d>\d{1,2})\b')),
    # numbers alone only with a year: "1/2 cup" is not the first of February
    ('numeric', re.compile(r'\b(?P<d>\d{1,2})[/.](?P<mo>\d{1,2})[/.](?P<y>(?:19|20)?\d\d)\b')),
    ('day-month', re.compile(r'\b(?P<d>\d{1,2})' + ORD + r'\s+(?:of\s+)?' + MONTH + YEAR + r'(?![a-z])', re.I)),
    ('month-day', re.compile(r'\b' + MONTH + r'\s+(?P<d>\d{1,2})' + ORD + r'(?![\d:])' + YEAR + r'\b', re.I)),
    # a month alone, after a word that makes it a time: "in March", "by May", "end of June", "mid-Feb"
    ('month', re.compile(r'\b(?P<lead>in|by|during|before|until|till|early|mid|late|end\s+of|start\s+of|beginning\s+of)[\s-]+'
                         + MONTH + YEAR + r'(?![a-z\d])', re.I)),
    # a day of the month: "on the 20th", "by the 3rd", "the 15th at 2pm"
    ('ordinal', re.compile(r'\b(?:(?:on|by|before|until|till|due)\s+)?the\s+(?P<d>3[01]|[12]\d|[1-9])(?:st|nd|rd|th)\b'
                           r'(?=\s*(?:$|[,.;:!?)\n]|at\b|by\b|for\b|-|–|—|\d|of\s+(?:this|next|the)\s+month))', re.I)),
    ('weekday', re.compile(r'\b(?P<lead>next\s+|this\s+|coming\s+|every\s+|each\s+|on\s+|by\s+|due\s+|until\s+|till\s+|before\s+)?'
                           + WEEKDAY + r'(?P<s>s\b)?', re.I)),
    ('dayafter', re.compile(r'\b(?:the\s+)?day\s+after\s+(?:tomorrow|tmrw)\b', re.I)),
    ('tomorrow', re.compile(r'\b(?:tomorrow|tmrw|tmr)\b', re.I)),
    ('tonight', re.compile(r'\btonight\b', re.I)),
    ('thispart', re.compile(r'\bthis\s+(?P<part>morning|afternoon|evening)\b', re.I)),
    ('today', re.compile(r'\btoday\b', re.I)),
    ('endof', re.compile(r'\b(?:(?:by|at|before)\s+)?(?:the\s+)?end\s+of\s+(?:the\s+|this\s+)?(?P<what>day|week|month)\b'
                         r'|\b(?P<eo>eod|eow|eom)\b', re.I)),
    ('weekend', re.compile(r'\b(?P<lead>this\s+|next\s+|coming\s+)?weekend\b', re.I)),
    ('nextweek', re.compile(r'\bnext\s+week\b', re.I)),
    ('nextmonth', re.compile(r'\bnext\s+month\b', re.I)),
    ('in', re.compile(r'\bin\s+(?:(?P<half>half\s+an?)\s+(?P<hu>hour)|(?P<n>\d{1,2}|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fourteen)\s+'
                      r'(?P<unit>days?|weeks?|months?|hours?|hrs?|minutes?|mins?))\b', re.I)),
]
DATES = ('iso', 'numeric', 'day-month', 'month-day', 'ordinal')
TIME_RE = re.compile(TIME, re.I)
EVERY_RE = re.compile(r'\b(?:every|each|daily|weekly|nightly)\b', re.I)
DIARY_RE = re.compile(r'\btoday\s*[,:]?\s*(?:i|i\'m|i’m|i\'ve|i’ve|we|my|was|it\s+was|has\s+been|felt)\b', re.I)
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
    if m.group('part'):
        return PARTS[m.group('part').lower()]
    if m.group('hb'):
        h = int(m.group('hb'))
        return f'{h if h >= 8 else h + 12:02d}:00'
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
        rank = (bool(m.group('part')), gap)   # a real time before "morning"
        if clock and (best is None or rank < best[0]):
            best = (rank, clock, m)
    if best:
        used.add(best[2].start())
        return best[1], best[2]
    return None, None


def _last(y, mo):
    return (date(y + (mo == 12), mo % 12 + 1, 1) - timedelta(days=1)).day


def _add_months(d, n):
    y, mo = d.year + (d.month - 1 + n) // 12, (d.month - 1 + n) % 12 + 1
    return date(y, mo, min(d.day, _last(y, mo)))


def _same_week(a, b):
    return a.isocalendar()[:2] == b.isocalendar()[:2]


def _day_of(kind, m, start, written, yearly_note):
    """(day, preset time, yearly) for one phrase, or None. The preset is the time the phrase itself
    means ("this evening", "in 2 hours", "end of the day"), used when no time is written beside it."""
    if kind == 'iso':
        return _safe(int(m['y']), int(m['mo']), int(m['d'])), None, False
    if kind == 'numeric':
        y = int(m['y'])
        y = y + 2000 if y < 100 else y
        d, mo = int(m['d']), int(m['mo'])
        return _safe(y, mo, d) or _safe(y, d, mo), None, False   # 24/11 first; 11/24 if that can't be
    if kind in ('day-month', 'month-day'):
        word = m['mon']
        if word.lower() == 'may' and not word[0].isupper() and kind == 'month-day':
            return None  # "it may 3 times" is not a date; "May 3" is
        mo, d = _month(word), int(m['d'])
        if m['year']:
            return _safe(int(m['year']), mo, d), None, False
        day = _safe(start.year, mo, d)
        # without a year: the next one, unless it's just gone (a note about a day just past)
        if day and day < start and (yearly_note or (start - day).days > 60):
            day = _safe(start.year + 1, mo, d)
        return day, None, yearly_note
    if kind == 'month':
        word, lead = m['mon'], re.sub(r'\s+', ' ', m['lead'].lower())
        mo = _month(word)
        y = int(m['year']) if m['year'] else start.year
        pick = lambda yy: date(yy, mo, 15 if lead == 'mid' else _last(yy, mo) if lead in ('late', 'end of') else 1)
        day = pick(y)
        if day < start and not m['year']:
            if mo == start.month:
                return None   # "in November" in November: no day still to come
            day = pick(y + 1)
        return day, None, False
    if kind == 'ordinal':
        d = int(m['d'])
        first = date(start.year, start.month, 1)
        for n in range(4):
            month = _add_months(first, n)
            day = _safe(month.year, month.month, d)
            if day and day >= start:
                return day, None, False
        return None
    if kind == 'weekday':
        lead = (m['lead'] or '').strip().lower()
        word = m['wd']
        if lead in ('every', 'each') or m['s'] or word.lower().startswith('thus'):
            return None  # "every Tuesday", "on Saturdays": no one day
        wd = DAYS.index(word[:3].lower())
        ahead = (wd - start.weekday()) % 7
        day = start + timedelta(days=ahead)
        # "next Tuesday" is the Tuesday of next week: written on a Monday, eight days on, not tomorrow
        if lead == 'next' and ahead and _same_week(day, start):
            day += timedelta(days=7)
        return day, None, False
    if kind == 'dayafter':
        return start + timedelta(days=2), None, False
    if kind == 'tomorrow':
        return start + timedelta(days=1), None, False
    if kind == 'tonight':
        return start, PARTS['night'], False
    if kind == 'thispart':
        return start, PARTS[m['part'].lower()], False
    if kind == 'today':
        # "pay rent today": midday, or the evening once midday has gone
        later = [t for t in ('12:00', '18:00') if t > (written + timedelta(minutes=30)).strftime('%H:%M')]
        return start, (later[0] if later else None), False
    if kind == 'endof':
        what = (m['what'] or {'eod': 'day', 'eow': 'week', 'eom': 'month'}[m['eo'].lower()]).lower()
        if what == 'day':
            return start, '17:00', False
        if what == 'week':
            return start + timedelta(days=(4 - start.weekday()) % 7), None, False
        return date(start.year, start.month, _last(start.year, start.month)), None, False
    if kind == 'weekend':
        lead = (m['lead'] or '').strip().lower()
        if start.weekday() == 6 and lead != 'next':
            return start, None, False
        day = start + timedelta(days=(5 - start.weekday()) % 7)
        if lead == 'next' and _same_week(day, start):
            day += timedelta(days=7)
        return day, None, False
    if kind == 'nextweek':
        return start + timedelta(days=7 - start.weekday()), None, False
    if kind == 'nextmonth':
        return _add_months(date(start.year, start.month, 1), 1), None, False
    if kind == 'in':
        if m['half']:
            later = written + timedelta(minutes=30)
            return later.date(), later.strftime('%H:%M'), False
        n = m['n'].lower()
        n = int(n) if n.isdigit() else NUMBERS[n]
        unit = m['unit'].lower()
        if unit.startswith(('hour', 'hr', 'min')):
            later = written + (timedelta(hours=n) if unit.startswith('h') else timedelta(minutes=n))
            return later.date(), later.strftime('%H:%M'), False
        if unit.startswith('month'):
            return _add_months(start, n), None, False
        return start + timedelta(days=n * (7 if unit.startswith('week') else 1)), None, False
    return None


def read(text, written):
    """The days a note names, from `written` (a naive local datetime):
    [{'day': date, 'time': 'HH:MM' or None, 'said': words, 'yearly': bool}], in order of the text."""
    text = text or ''
    if len(text) > LONG:
        text = text.split('\n', 1)[0][:LONG]
    yearly_note = bool(YEARLY_RE.search(text))
    start = written.date()
    now_hm = written.strftime('%H:%M')
    used = set()
    days = []
    found = sorted(_found(text), key=lambda f: f[1].start())
    dates = [m for k, m in found if k in DATES]
    for kind, m in found:
        # "Sat 21 Nov", "21 Nov (Sat)": the weekday belongs to the date beside it
        if kind == 'weekday' and any(0 <= d.start() - m.end() <= 3 or 0 <= m.start() - d.end() <= 3 for d in dates):
            continue
        if kind == 'today' and DIARY_RE.search(text, m.start()) and DIARY_RE.search(text, m.start()).start() == m.start():
            continue  # "today I felt…" is a diary
        got = _day_of(kind, m, start, written, yearly_note)
        if not got or not got[0]:
            continue
        day, preset, yearly = got
        clock, tm = (None, None) if kind == 'in' and preset else _time_near(text, m.start(), m.end(), used)
        clock = clock or preset
        said = m.group(0).strip()
        if tm is not None:
            a, b = min(m.start(), tm.start()), max(m.end(), tm.end())
            between = text[a:b]
            said = (re.sub(r'\s+', ' ', between).strip(' ,.-–—') if len(between) <= len(m.group(0)) + len(tm.group(0)) + 4
                    else f'{m.group(0).strip()} {tm.group(0).strip()}')
        lead = (m['lead'] or '').strip().lower() if kind == 'weekday' else ''
        if kind == 'weekday' and len(m['wd'].rstrip('.')) <= 4 and not clock and lead in ('', 'coming'):
            continue  # "sat on the step", "Sun cream": a short day name counts beside a time, or after "on", "by"…
        if kind == 'weekday' and day == start and not (clock and clock > now_hm):
            # the day it was written: a note headed "Monday" on a Monday is about that day, gone by
            # tomorrow; only "next Monday" means a week on
            if lead != 'next':
                continue
            day += timedelta(days=7)
        if day < start or (day == start and not (clock and clock > now_hm)):
            if not yearly:
                continue  # a record of a day gone, not one to come
        days.append({'day': day, 'time': clock, 'said': said, 'yearly': yearly})
    if not days and not found and not EVERY_RE.search(text):
        # a time alone ("call Mum at 5", "6pm pick up"): today, or tomorrow once it has gone
        for m in TIME_RE.finditer(text):
            if m.group('part') or (m.group('h24') is not None and not text[:m.start()].rstrip().lower().endswith('at')):
                continue
            clock = _clock(m)
            if not clock:
                continue
            day = start if clock > now_hm else start + timedelta(days=1)
            days.append({'day': day, 'time': clock, 'said': m.group(0).strip(), 'yearly': False})
            break
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
