"""The registry of modes: every feature that stays hidden until what you're
doing calls for it. One entry per mode, here for the server and under the
same key in public/assets/js/modes.js for the page. CLAUDE.md, "How to add a
mode", is the recipe.

Two kinds:
  planet  belongs to a whole planet (a list, a bookshelf, a cookbook, a desk
          of documents). Read from the planet's files.
  moment  answers what's being written right now in one note (writing).
          Read from the text with sorting.form.

An entry says:
  read     what it noticed. For a planet mode, read(ctx) gives {'share': the
           part of the planet's files that are its kind (0 to 1), 'count': how
           many, 'signs': plain sentences for the offer, ...anything its page
           needs}. It may give its own 'fits' when its rule is more than a
           share (the four older modes do). For a moment mode, read(text,
           form) gives {'strength': 0 to 1, 'say': the line shown}.
  on/stay  the two bars. A mode switches on at `on` and keeps fitting down to
           `stay`, so one odd file never switches it on and it never flickers.
  least    how many of its kind of file it needs before it can switch on.
  moons    whether a moon can be one.
  arrives  'offer' (suggested once, in place; the owner accepts), 'undo'
           (switches on by itself and says so with an Undo) or 'quiet'
           (appears and leaves by itself).
  settings what it saves on the planet, each with the check that cleans it.
           Every mode also has on, dismissed and kept.

Everything else is shared: clean() checks and stores every mode's settings
the same way, signs() reports every planet mode from one reading of the
planet, and moment() answers every moment mode for one piece of text.
"""
import json

from . import books, documents, recipes, sorting
from .web import HttpError

ARRIVES = ('offer', 'undo', 'quiet')


class Mode:
    def __init__(self, key, read, kind='planet', words=None, on=0.6, stay=0.4, least=1, moons=False,
                 arrives='offer', settings=None, defaults=None):
        assert kind in ('planet', 'moment') and arrives in ARRIVES and 0 <= stay <= on <= 1
        self.key = key
        self.read = read
        self.kind = kind
        self.words = words or key      # "Those <words> settings could not be saved."
        self.on = on
        self.stay = stay
        self.least = least
        self.moons = moons
        self.arrives = arrives
        self.settings = settings or {}
        self.defaults = {'on': False, 'dismissed': False, **(defaults or {})}


# ---------------------------------------------------------------- checks for saved settings

def flag(value):
    if not isinstance(value, bool):
        raise ValueError
    return value


def one_of(*choices):
    def check(value):
        # True == 1 in Python; a switch is never one of a list of numbers.
        if isinstance(value, bool) or value not in choices:
            raise ValueError
        return value
    return check


def names(most, longest):
    """A list of short names (chapters), without repeats."""
    def check(value):
        if not (isinstance(value, list) and len(value) <= most
                and all(isinstance(c, str) and 0 < len(c.strip()) <= longest for c in value)):
            raise ValueError
        return list(dict.fromkeys(c.strip() for c in value))
    return check


COMMON = {'on': flag, 'dismissed': flag, 'kept': flag}


# ---------------------------------------------------------------- one planet, read once

class Reading:
    """A planet as the modes read it. Its files and its purpose are fetched
    the first time a mode asks and shared by the rest, so opening a planet
    never pays for a mode that didn't need them."""

    def __init__(self, conn, row):
        self.conn = conn
        self.row = row
        self.id = row['id']
        self.title = row['title'] or ''
        self.moon = bool(row['parent_id']) if 'parent_id' in row.keys() else False
        self._files = None
        self._purpose = False

    @property
    def files(self):
        if self._files is None:
            self._files = self.conn.execute(
                'SELECT b.* FROM connections c JOIN blocks b ON b.id = c.block_id WHERE c.drawer_id = ? '
                'ORDER BY c.position, c.connected_at DESC', (self.id,)).fetchall()
        return self._files

    @property
    def with_meta(self):
        return [(f, json.loads(f['meta'] or '{}')) for f in self.files]

    @property
    def purpose(self):
        """sorting.purpose for this planet, or {} if it can't be read."""
        if self._purpose is False:
            try:
                self._purpose = sorting.purpose(self.conn, self.id) or {}
            except Exception:  # a mode can do without it
                self._purpose = {}
        return self._purpose


def _share(count, n):
    return count / n if n else 0.0


# ---------------------------------------------------------------- the planet modes

def read_list(ctx):
    return sorting.list_signs(ctx.conn, ctx.id)


def read_reading(ctx):
    signs = books.shelf_signs(ctx.title, ctx.with_meta)
    found = signs.pop('books')
    return {**signs, 'count': len(found), 'share': _share(len(found), len(ctx.files))}


def read_cookbook(ctx):
    if not ctx.files:
        return {'fits': False, 'signs': [], 'food': recipes.food_name(ctx.title), 'count': 0, 'share': 0.0}
    signs = recipes.signs(ctx.title, ctx.with_meta, ctx.purpose)
    found = len(signs.pop('recipes')) + len(signs.pop('lists'))
    return {**signs, 'count': found, 'share': _share(found, len(ctx.files))}


def read_documents(ctx):
    signs = documents.doc_signs(ctx.title, ctx.files)
    return {**signs, 'count': signs['long'], 'share': _share(signs['long'], len(ctx.files))}


PLANET_MODES = [
    Mode('list', read_list, on=0.6, stay=0.4, moons=True,
         settings={'doneLast': flag, 'type': one_of('check', 'bullet', 'number', 'plain'),
                   'marker': one_of('dot', 'dash', 'arrow', 'star', 'circle', 'square'),
                   'limit': one_of(60, 120, 200, 400)},
         defaults={'type': 'check', 'marker': 'dot', 'limit': 120, 'doneLast': True}),
    Mode('reading', read_reading, on=0.5, stay=0.25),
    Mode('cookbook', read_cookbook, on=0.3, stay=0.15,
         settings={'chapters': names(40, recipes.MAX_CHAPTER)}),
    Mode('documents', read_documents, words='document', on=0.5, stay=0.3, moons=True,
         settings={'sort': one_of(*documents.SORTS)}),
]


# ---------------------------------------------------------------- the moment modes

def read_writing(text, form):
    """Writing that's outgrowing a note: long, or reading as prose, a story or
    a chapter (sorting.form's strengths), and never code or a table."""
    size = len(text)
    if form.get('code') or form.get('table') or form.get('tab'):
        return {'strength': 0.0}
    if size >= documents.NOTE_FITS:
        return {'strength': 1.0, 'say': 'Long for a note.'}
    if size < 400:
        return {'strength': 0.0}
    strength = max(form.get('prose', 0), form.get('story', 0), form.get('chapter', 0))
    return {'strength': strength, 'say': 'This reads like a piece of writing.'}


MOMENT_MODES = [
    Mode('writing', read_writing, kind='moment', on=0.6, stay=0.4, moons=True, arrives='quiet'),
]

MODES = {m.key: m for m in PLANET_MODES + MOMENT_MODES}
LIST_DEFAULTS = MODES['list'].defaults


# ---------------------------------------------------------------- saved settings, all checked one way

def clean(value, current, moon=False):
    """Check the modes a planet's owner is setting; returns the whole new value."""
    if not isinstance(value, dict):
        raise HttpError(400, 'Those settings could not be saved.')
    saved = dict(current)
    for key, given in value.items():
        if key == 'shareTip':
            # The one-time "who can see it" tip on a new planet; only ever put away.
            if given is not False:
                raise HttpError(400, 'Those settings could not be saved.')
            saved.pop('shareTip', None)
            continue
        mode = MODES.get(key)
        if mode is None:
            continue
        sorry = HttpError(400, f'Those {mode.words} settings could not be saved.')
        if not isinstance(given, dict):
            raise sorry
        merged = {**mode.defaults, **(saved.get(key) or {})}
        for name, v in given.items():
            check = COMMON.get(name) or mode.settings.get(name)
            if check is None:
                raise sorry
            try:
                merged[name] = check(v)
            except ValueError:
                raise sorry from None
        if moon and not mode.moons and merged.get('on'):
            raise HttpError(400, 'Moons can’t be that.')
        saved[key] = merged
    return saved


# ---------------------------------------------------------------- signs, all from one place

def fits(mode, found, saved, n):
    """Whether a planet fits a mode now. It takes the higher bar to switch on;
    once its owner has answered (it's on, or was waved away) the lower bar is
    enough to stay, and an empty planet stays whatever it was."""
    if 'fits' in found:
        rule = bool(found['fits'])
    else:
        rule = found.get('count', 0) >= mode.least and found.get('share', 0) >= mode.on
    if rule:
        return True
    held = mode.key in saved
    return held and (n == 0 or (found.get('count', 0) >= 1 and found.get('share', 0) >= mode.stay))


def signs(conn, row, saved):
    """What every planet mode noticed about one planet: {key: {'fits',
    'signs', 'share', 'arrives', ...}}. 'left' is set when a mode that's on
    no longer fits and its owner hasn't said to keep it."""
    ctx = Reading(conn, row)
    out = {}
    for mode in PLANET_MODES:
        if ctx.moon and not mode.moons:
            continue
        found = mode.read(ctx)
        if 'share' not in found:  # list mode counts for itself
            found['share'] = 1.0 if found.get('fits') else 0.0
            found['count'] = 1 if found.get('fits') else 0
        state = saved.get(mode.key) or {}
        ok = fits(mode, found, saved, len(ctx.files))
        found = {**found, 'fits': ok, 'share': round(found['share'], 2), 'arrives': mode.arrives}
        if state.get('on') and not ok and not state.get('kept'):
            found['left'] = True
        out[mode.key] = found
    return out


MOMENT_LIMIT = 20000


def moment(text, held=(), saved=None, moon=False):
    """Which moment modes answer what's being written: {key: {'fits', 'say'}}.
    `held` are the ones already showing, which stay down to their lower bar."""
    text = (text or '').strip()[:MOMENT_LIMIT]
    form = sorting.form(text) if text else {}
    out = {}
    for mode in MOMENT_MODES:
        if (moon and not mode.moons) or ((saved or {}).get(mode.key) or {}).get('dismissed'):
            continue
        found = mode.read(text, form) if text else {'strength': 0.0}
        bar = mode.stay if mode.key in held else mode.on
        out[mode.key] = {'fits': found['strength'] >= bar and found['strength'] > 0, 'say': found.get('say')}
    return out
