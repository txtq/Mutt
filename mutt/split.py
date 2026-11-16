"""Split into moons: a planet that has grown into two or more clearly
different things (climbing and pottery) can give each its own moon.

It reads every file with the same sorter autosort and sorting.purpose use
(sorting.member: each file's topics and finer concepts, which already carry
what a picture shows), never a classifier of its own. A file joins the group
of the one subject it is most clearly about; a file that is about nothing
clearly, or about something too small to be a group, stays on the planet.

`plan` says what a split would do; `split` and `undo` in mutt/api.py do it.
The bars (how big the second group must be before it's offered) are the
'split' entry in mutt/modes.py.
"""
from . import sorting

GROUP_LEAST = 3      # files a subject needs to be a group at all
GROUP_SHARE = 0.15   # and its part of the owner's files
COVERED = 0.5        # the groups together hold at least this much of the planet
CLEAR = 1.0          # a fine subject (climbing) needs one telling word; a broad one (Sports) two
AHEAD = 1.5          # and to be half again ahead of the next subject
NEAR_TOP = 0.6       # a fine subject's own broad one is (nearly) the file's strongest

NUMBERS = {2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight', 9: 'nine'}


def _top(scores):
    """(best, its score, the next best's score) of the scores above nothing."""
    ranked = sorted(((v, k) for k, v in scores.items() if v > 0), reverse=True) + [(0.0, None)] * 2
    return ranked[0][1], ranked[0][0], ranked[1][0]


def subject(doc):
    """(concept or None, topic) a file is clearly about, or None. Clearly: its
    strongest subject has a real word or more behind it and well ahead of the
    next (half again as much), so a note torn between two stays out."""
    topic, t_best, t_next = _top(doc.topics)
    concept, c_best, c_next = _top(doc.concepts)
    if concept and c_best >= CLEAR and c_best >= AHEAD * c_next:
        own = sorting.CONCEPT_TOPIC.get(concept)
        if not topic or doc.topics.get(own, 0) >= NEAR_TOP * t_best:
            return concept, own
    if topic and t_best >= 2 * CLEAR and t_best >= AHEAD * t_next:
        return None, topic
    return None


def name_of(concept, topic):
    return sorting.CONCEPT_TITLES.get(concept, concept.capitalize()) if concept else topic


def word_of(name):
    """How a group's name reads mid-sentence: pottery, UI design, 3D."""
    return name if name[:2].isupper() or name[:1].isdigit() else name[:1].lower() + name[1:]


def named_after(row):
    """(concept, topic) the planet's own name points to, if any."""
    alone = sorting.Planet(row, [])
    concepts = {c: v for c, v in alone.concept_raw.items() if v > 0}
    topics = {t: v for t, v in alone.topic_raw.items() if v > 0}
    return (max(concepts, key=concepts.get) if concepts else None,
            max(topics, key=topics.get) if topics else None)


def groups(row, files):
    """The owner's files on a planet, gathered by what each is about:
    ([{concept, topic, name, word, ids}], how many of the owner's files),
    biggest first. Other people's files (a planet anyone can add to) are
    theirs, so they are never read or moved."""
    mine = [f for f in files if f['user_id'] == row['user_id']]
    by, loose = {}, []
    for f in mine:
        found = subject(sorting.member(f))
        if not found:
            continue
        concept, topic = found
        if concept:
            by.setdefault(concept, {'concept': concept, 'topic': topic, 'ids': []})['ids'].append(f['id'])
        else:
            loose.append((f['id'], topic))
    # A file only broadly about Sports joins climbing when climbing is the
    # one sport here; with several, it stays where it is.
    for block_id, topic in loose:
        same = [g for g in by.values() if g['concept'] and g['topic'] == topic]
        if len(same) == 1:
            same[0]['ids'].append(block_id)
        elif not same:
            by.setdefault('#' + topic, {'concept': None, 'topic': topic, 'ids': []})['ids'].append(block_id)
    n = len(mine)
    found = [g for g in by.values() if len(g['ids']) >= GROUP_LEAST and len(g['ids']) >= GROUP_SHARE * n]
    found.sort(key=lambda g: (-len(g['ids']), g['concept'] or g['topic']))
    if sum(len(g['ids']) for g in found) < COVERED * n:
        found = []
    for g in found:
        g['name'] = name_of(g['concept'], g['topic'])
        g['word'] = word_of(g['name'])
    return found, n


def plan(conn, row, files, most_moons):
    """What splitting this planet would do: {'groups': [{name, word, count,
    ids, home, stays, moon}], 'count', 'share', 'signs', 'things', 'rest'}.
    A group the planet is named after stays (home); a group whose name a moon
    already has goes to that moon; the rest get new moons, biggest first,
    while there's room for one (most_moons), and stay when there isn't. Only
    offered when at least one group would move."""
    found, n = groups(row, files) if not row['parent_id'] else ([], 0)
    empty = {'count': 0, 'share': 0.0, 'signs': [], 'groups': [], 'things': 0, 'rest': 0}
    if len(found) < 2:
        return empty
    moons = conn.execute('SELECT id, title FROM drawers WHERE parent_id = ? ORDER BY created_at',
                         (row['id'],)).fetchall()
    have = {(m['title'] or '').strip().lower(): m['id'] for m in moons}
    room = most_moons - len(moons)
    concept, topic = named_after(row)
    home = next((g for g in found if concept and g['concept'] == concept), None) or next(
        (g for g in found if topic and g['topic'] == topic and not concept
         and sum(1 for o in found if o['topic'] == topic) == 1), None)
    out = []
    for g in found:
        entry = {'name': g['name'], 'word': g['word'], 'count': len(g['ids']), 'ids': g['ids'],
                 'home': g is home, 'moon': have.get(g['name'].lower())}
        # It stays on the planet when the planet is named after it, or when
        # there's no room left for its moon (a planet has at most most_moons).
        entry['stays'] = entry['home']
        if not entry['stays'] and not entry['moon']:
            entry['stays'] = room <= 0
            room -= 1
        out.append(entry)
    if not any(not g['stays'] for g in out):
        return empty
    second = out[1]['count']
    grouped = sum(g['count'] for g in out)
    about = [f"{g['count']} files are about {g['word']}" if i == 0 else f"{g['count']} about {g['word']}"
             for i, g in enumerate(out)]
    said = about[0] if len(about) == 1 else ', '.join(about[:-1]) + ' and ' + about[-1]
    signs = [said + '.']
    rest = n - grouped
    if rest:
        signs.append('1 other fits neither.' if rest == 1 and len(out) == 2 else
                     '1 other fits none of them.' if rest == 1 else
                     f'{rest} others fit neither.' if len(out) == 2 else f'{rest} others fit none of them.')
    return {'count': second, 'share': second / n if n else 0.0, 'signs': signs, 'things': len(out),
            'thingsWord': NUMBERS.get(len(out), str(len(out))), 'rest': rest,
            'groups': out}
