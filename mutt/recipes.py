"""Cookbook mode: a planet kept as a recipe box.

Like list mode and reading mode it isn't a setting: a planet offers it once
recipes are what it holds (`signs`), and its switch lives in the planet's •••
menu after that.

A recipe is read from a note written as one (amounts, a method) or from a
saved link to a recipe page (the page's own recipe details, read by
`links.inspect`). What's read is kept in the file's `meta.recipe`:

    {title, serves, makes, prep, cook, ingredients: [line], steps: [text],
     notes, chapter, chapterSet, photo (a picture's file id), source, sig}

Ingredients stay as the lines people write ("200 g flour"); the browser
scales and converts the amounts. A heading inside them ends with a colon
("For the sauce:"). A note's text is rewritten from its card when the card is
saved, so the note and the card are the same thing; `sig` remembers the text
the card was read from, so an edit made to the note elsewhere is read again.
"""
import hashlib
import html
import re

from . import lexicon, sorting

MAX_LINES = 120
MAX_LINE = 400
MAX_STEP = 2000
MAX_NOTES = 4000
MAX_CHAPTER = 40

CHAPTERS = [name for name, _ in lexicon.RECIPE_CHAPTERS]
OTHER_CHAPTER = CHAPTERS[-1]
_CHAPTER_WORDS = [(name, set(words.split())) for name, words in lexicon.RECIPE_CHAPTERS]
_PHRASES = {w for _, ws in _CHAPTER_WORDS for w in ws if '_' in w}

_WORD_RE = re.compile(r"[a-zà-ÿ]+(?:'[a-z]+)?")


def _words(text):
    return [w.replace("'", '') for w in _WORD_RE.findall((text or '').lower())]


def _phrase_hit(words, vocab):
    """Does this run of words contain any word or underscore phrase in vocab?"""
    joined = '_'.join(words)
    singles = set(words) | {w[:-1] for w in words if w.endswith('s') and len(w) > 3}
    return any((v in singles) if '_' not in v else (f'_{v}_' in f'_{joined}_') for v in vocab)


_NAME_WORDS = set(lexicon.RECIPE_NAMES)
_NOT_RECIPE = set(lexicon.NOT_RECIPE_NAMES)
FOOD_WORDS = set(' '.join(lexicon.TOPICS['Recipes'][:2]).split()) - {'menu', 'cafe', 'restaurant', 'tasty',
                                                                      'delicious', 'bowl', 'pan', 'sheet', 'tray'}
_COOK_VERBS = set(lexicon.COOK_VERBS)


def food_name(title):
    """Does a planet's name say it's for food or recipes?"""
    if any(e in (title or '') for e in lexicon.RECIPE_EMOJI if e.strip()):
        return True
    return _phrase_hit(_words(title), _NAME_WORDS)


def food_count(text):
    """How many words in the text are food or cooking words."""
    words = _words(text)
    return sum(1 for w in words if w in FOOD_WORDS or (w.endswith('s') and w[:-1] in FOOD_WORDS))


def _cook_verbs(text):
    return len({w for w in _words(text) if w in _COOK_VERBS})


HEAD_RE = re.compile(r'^\s*(?:#+\s*)?(?:\*\*)?\s*(?P<word>ingredients?|you(?:\'ll| will)? need|what you need|'
                     r'method|directions?|instructions?|steps?|preparation|how to make(?: it)?|to make|'
                     r'notes?|tips?|cook\'?s notes?)\s*(?:\*\*)?\s*:?\s*$', re.I)
SERVES_RE = re.compile(r'\b(?:serves|servings?|feeds|portions?|for)\s*:?\s*(\d{1,3})(?:\s*[-–]\s*\d{1,3})?\b'
                       r'|\b(\d{1,3})\s*(?:servings|portions|people)\b', re.I)
MAKES_RE = re.compile(r'\b(?:makes|yields?|yield)\s*:?\s*(?:about\s+)?(\d{1,4})(?:\s*[-–]\s*\d{1,4})?\s*([a-z][a-z ]{0,30})?',
                      re.I)
TIME_RE = r'\s*(?:time)?\s*:?\s*(?:(\d{1,3})\s*(?:h|hr|hrs|hours?))?\s*(?:(\d{1,3})\s*(?:m|min|mins|minutes?))?'
PREP_RE = re.compile(r'\bprep(?:aration)?' + TIME_RE, re.I)
COOK_RE = re.compile(r'\b(?:cook(?:ing)?|bake|baking|roast(?:ing)?)' + TIME_RE, re.I)
BULLET_RE = re.compile(r'^\s*(?:[-*•·▪◦]|\[[ xX]?\])\s+')
NUMBER_RE = re.compile(r'^\s*(?:step\s*)?(\d{1,2})\s*[.):]\s*|^\s*step\s*(\d{1,2})\s*[-–:]?\s*', re.I)
AMOUNT_RE = re.compile(r'^\s*(?:\d+(?:[./,]\d+)?|\d*\s*[½⅓⅔¼¾⅛⅜⅝⅞]|a\s+(?:pinch|handful|few|little|dash|splash)|'
                       r'pinch|handful|dash|splash|few|some|one|two|three|four|half)\b', re.I)
VERB_RE = re.compile(r'^\s*(?:preheat|heat|add|mix|stir|whisk|beat|combine|place|put|pour|bake|roast|fry|'
                     r'boil|simmer|cook|serve|season|chop|slice|dice|cut|melt|bring|leave|let|remove|transfer|'
                     r'spread|sprinkle|fold|knead|cover|blend|toss|drain|rinse|grease|line|top|divide|repeat|'
                     r'meanwhile|once|when|while|in a|using|take|make|turn|reduce|return|set|allow|garnish|'
                     r'scatter|spoon|layer|roll|shape|chill|freeze|grill|toast|warm|cool|wash|peel|grate)\b', re.I)


def sig(text):
    return hashlib.sha1((text or '').encode('utf-8', 'replace')).hexdigest()[:12]


def _minutes(m):
    if not m or not (m.group(1) or m.group(2)):
        return None
    total = int(m.group(1) or 0) * 60 + int(m.group(2) or 0)
    return total if 0 < total <= 60 * 72 else None


def _clean_line(line):
    line = BULLET_RE.sub('', line)
    line = re.sub(r'^\s*\*\*(.+?)\*\*\s*$', r'\1', line)
    return re.sub(r'\s+', ' ', line).strip()


def _is_meta_line(line):
    """'Serves 4 · Prep 15 min' and the like: details, not an ingredient."""
    bare = re.sub(r'[·|,;/]+', ' ', line).strip()
    if len(bare) > 80:
        return False
    left = bare
    for rx in (SERVES_RE, MAKES_RE, PREP_RE, COOK_RE, re.compile(r'\btotal' + TIME_RE, re.I)):
        left = rx.sub(' ', left)
    return bool(left != bare and not re.sub(r'[\s\d]+', '', left).strip(' .:-–'))


def _looks_ingredient(line):
    if len(line) > 90 or line.endswith('.') and len(line) > 50:
        return False
    if AMOUNT_RE.match(line) or sorting.QUANTITY_RE.search(line):
        return True
    return len(line.split()) <= 5 and not VERB_RE.match(line)


def parse(text, title=''):
    """Read a note written as a recipe. Returns a recipe (without chapter or
    photo), or None when there's nothing like one in it."""
    text = (text or '').replace('\r', '')
    lines = text.split('\n')[:400]
    out = {'title': '', 'serves': None, 'makes': '', 'prep': None, 'cook': None,
           'ingredients': [], 'steps': [], 'notes': ''}
    section = None
    notes = []
    loose = []  # lines before any heading, sorted out after
    first = True
    numbered = False
    for raw in lines:
        line = raw.strip()
        if not line:
            if section == 'steps' and out['steps'] and not numbered:
                out['steps'].append('')  # a blank line ends a paragraph step
            continue
        inline = INLINE_HEAD_RE.match(line)
        if inline:
            section = 'ingredients'
            first = False
            out['ingredients'].extend(_comma_items(inline.group('rest')) or [_clean_line(inline.group('rest'))])
            continue
        head = HEAD_RE.match(line)
        if head:
            word = head.group('word').lower()
            section = ('notes' if word.startswith(('note', 'tip', 'cook')) and 'need' not in word
                       else 'ingredients' if word.startswith(('ingredient', 'you', 'what')) else 'steps')
            first = False
            continue
        if first:
            first = False
            if (len(line) <= 80 and not AMOUNT_RE.match(line) and not sorting.QUANTITY_RE.search(line)
                    and not _is_meta_line(line)):
                out['title'] = re.sub(r'^#+\s*', '', _clean_line(line)).strip('*_ ')
                continue
        if _is_meta_line(line):
            _meta(out, line)
            continue
        if section is None and len(line) <= 80 and (SERVES_RE.search(line) or MAKES_RE.search(line)) \
                and not sorting.QUANTITY_RE.search(line):
            _meta(out, line)
            continue
        if section == 'notes':
            notes.append(line)
        elif section == 'ingredients':
            clean = _clean_line(line)
            items = _comma_items(line)
            if items:
                out['ingredients'].extend(items)
                continue
            # A cooking sentence after the ingredients is the method starting without a heading.
            if (out['ingredients'] and not NUMBER_RE.match(line) and VERB_RE.match(line)
                    and (len(line.split()) > 5 or line.endswith('.')) and not AMOUNT_RE.match(line)):
                section = 'steps'
                out['steps'].append(_clean_line(line))
                continue
            # A numbered line after the ingredients is the method starting without a heading.
            if NUMBER_RE.match(line) and out['ingredients'] and not AMOUNT_RE.match(NUMBER_RE.sub('', line)):
                section = 'steps'
                numbered = True
                out['steps'].append(NUMBER_RE.sub('', line).strip())
            elif clean:
                out['ingredients'].append(clean)
        elif section == 'steps':
            m = NUMBER_RE.match(line)
            if m:
                numbered = True
                out['steps'].append(NUMBER_RE.sub('', line).strip())
            elif numbered and out['steps'] and not BULLET_RE.match(line):
                out['steps'][-1] = (out['steps'][-1] + ' ' + line).strip()
            elif out['steps'] and out['steps'][-1] and not numbered and not out['steps'][-1].endswith(('.', '!', ':')):
                out['steps'][-1] += ' ' + _clean_line(line)
            else:
                if out['steps'] and out['steps'][-1] == '':
                    out['steps'].pop()
                out['steps'].append(_clean_line(line))
        else:
            loose.append(line)

    # No headings: ingredients are the short lines up front, the method what follows.
    # "spaghetti, garlic, olive oil, chilli" on one line is a list of them.
    loose = [x for line in loose for x in (_comma_items(line) or [line])]
    if loose:
        i = 0
        while i < len(loose) and _looks_ingredient(_clean_line(loose[i])) and not NUMBER_RE.match(loose[i]):
            i += 1
        if i >= 2 or out['steps']:
            out['ingredients'] = [_clean_line(x) for x in loose[:i]] + out['ingredients']
            rest = loose[i:]
        else:
            rest = loose
        steps = []
        for line in rest:
            if NUMBER_RE.match(line) or not steps:
                steps.append(NUMBER_RE.sub('', _clean_line(line)).strip())
            elif steps[-1] and not steps[-1].endswith(('.', '!', ':')):
                steps[-1] += ' ' + _clean_line(line)
            else:
                steps.append(_clean_line(line))
        out['steps'] = steps + out['steps']

    out['steps'] = [s for s in (x.strip() for x in out['steps']) if s][:MAX_LINES]
    out['ingredients'] = [x for x in out['ingredients'] if x][:MAX_LINES]
    out['notes'] = '\n'.join(notes)[:MAX_NOTES]
    out['title'] = (out['title'] or title or '').strip()[:200]
    if not out['ingredients'] and not out['steps']:
        return None
    return out


INLINE_HEAD_RE = re.compile(r'^\s*(?:\*\*)?(?:ingredients?|you(?:\'ll| will)? need)\s*(?:\*\*)?\s*:\s*(?P<rest>\S.*)$', re.I)


def _comma_items(line):
    """'spaghetti, garlic, olive oil, chilli' → the items, when a line is a
    list of short things (not a sentence with commas in it)."""
    line = _clean_line(line).rstrip('.')
    parts = [p.strip() for p in re.split(r',|;|\band\b(?=[^,]*$)', line) if p.strip()]
    if len(parts) < 3 or any(len(p.split()) > 5 for p in parts) or VERB_RE.match(line):
        return None
    if not any(food_count(p) for p in parts):
        return None
    return parts


def _meta(out, line):
    m = SERVES_RE.search(line)
    if m and not out['serves']:
        out['serves'] = int(m.group(1) or m.group(2)) or None
    m = MAKES_RE.search(line)
    if m and not out['serves']:
        out['serves'] = int(m.group(1)) or None
        out['makes'] = (m.group(2) or '').strip()[:40]
    out['prep'] = out['prep'] or _minutes(PREP_RE.search(line))
    out['cook'] = out['cook'] or _minutes(COOK_RE.search(line))


def is_recipe_note(text, title='', food=False):
    """Is this note written as a recipe? It needs amounts or an ingredients
    heading, and something to do with them. On a planet that's about food
    (food=True) it's gentler: a list of what goes in, or a few lines saying
    how to cook it, will do."""
    first = next((l for l in (text or '').split('\n') if l.strip()), '')
    if _phrase_hit(_words(title or first), _NOT_RECIPE):
        return None
    read = parse(text, title)
    if not read:
        return None
    found = sorting.form(text)
    quantities = len(sorting.QUANTITY_RE.findall(text or ''))
    headed = bool(re.search(r'^\s*(?:#+\s*)?(?:\*\*)?ingredients?\b', text or '', re.I | re.M))
    ings = read['ingredients']
    if len(ings) >= 2 and (read['steps'] or headed) and (found.get('recipe') or headed or quantities >= 2):
        return read
    foodish = sum(1 for x in ings if food_count(x))
    verbs = _cook_verbs(text)
    # Anywhere: plainly food going in, and plainly cooking.
    if foodish >= 3 and read['steps'] and verbs >= 2:
        return read
    if not food:
        return None
    if len(ings) >= 2 and foodish >= 2 and (read['steps'] or headed or quantities >= 2):
        return read
    if len(ings) >= 3 and foodish >= 3 and foodish >= 0.6 * len(ings):
        return read  # what goes in it, method to come
    if read['steps'] and verbs >= 2 and food_count(text) >= 3:
        return read  # how to make it, in a few sentences
    return None


def _ld_text(value):
    if isinstance(value, (int, float)):
        return str(value)
    if not isinstance(value, str):
        return ''
    value = re.sub(r'<[^>]+>', ' ', html.unescape(value))
    value = re.sub(r'\s+', ' ', html.unescape(value)).strip()
    return re.sub(r'\s+([.,;:!?)])', r'\1', value)


def _iso_minutes(value):
    m = re.match(r'^P(?:T)?(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?', str(value or '').upper())
    if not m or not any(m.groups()):
        return None
    total = int(m.group(1) or 0) * 1440 + int(m.group(2) or 0) * 60 + int(m.group(3) or 0)
    return total if 0 < total <= 60 * 72 else None


def _steps(value, out, depth=0):
    if depth > 4:
        return
    if isinstance(value, str):
        for part in re.split(r'\n+|(?<=\.)\s{2,}', value):
            part = _ld_text(part)
            if part:
                out.append(part)
    elif isinstance(value, list):
        for item in value:
            _steps(item, out, depth + 1)
    elif isinstance(value, dict):
        kind = value.get('@type')
        kind = kind[0] if isinstance(kind, list) and kind else kind
        if kind == 'HowToSection':
            name = _ld_text(value.get('name'))
            if name:
                out.append(name.rstrip(':') + ':')
            _steps(value.get('itemListElement'), out, depth + 1)
        else:
            text = _ld_text(value.get('text') or value.get('name'))
            if text:
                out.append(text)


def from_ld(node):
    """A schema.org Recipe (from a page's JSON-LD) as a recipe."""
    title = _ld_text(node.get('name'))[:200]
    ingredients = [_ld_text(x) for x in (node.get('recipeIngredient') or node.get('ingredients') or [])
                   if isinstance(x, str)]
    steps = []
    _steps(node.get('recipeInstructions'), steps)
    # A section name in the steps reads as a heading in the method; keep it as a step with a colon.
    serves, makes = None, ''
    yields = node.get('recipeYield')
    for y in (yields if isinstance(yields, list) else [yields]):
        m = re.match(r'^\D*?(\d{1,4})\s*(.*)$', _ld_text(y))
        if not m:
            continue
        word = m.group(2).strip().lower()
        word = '' if re.match(r'^(?:servings?|serves|portions?|people|persons?)\b', word) else word[:40]
        if serves is None or (word and not makes):
            serves, makes = int(m.group(1)) or None, word
    prep = _iso_minutes(node.get('prepTime'))
    cook = _iso_minutes(node.get('cookTime'))
    if not cook and not prep:
        cook = _iso_minutes(node.get('totalTime'))
    if not ingredients and not steps:
        return None
    return {'title': title, 'serves': serves, 'makes': makes, 'prep': prep, 'cook': cook,
            'ingredients': [x[:MAX_LINE] for x in ingredients if x][:MAX_LINES],
            'steps': [x[:MAX_STEP] for x in steps if x][:MAX_LINES], 'notes': ''}


def find_ld_recipe(blobs):
    """The first Recipe in a page's JSON-LD scripts (already parsed)."""
    def walk(node, depth=0):
        if depth > 6:
            return None
        if isinstance(node, list):
            for item in node:
                found = walk(item, depth + 1)
                if found:
                    return found
        elif isinstance(node, dict):
            kind = node.get('@type')
            kinds_ = kind if isinstance(kind, list) else [kind]
            if 'Recipe' in kinds_:
                return node
            for key in ('@graph', 'mainEntity', 'mainEntityOfPage', 'itemListElement'):
                if key in node:
                    found = walk(node[key], depth + 1)
                    if found:
                        return found
        return None
    for blob in blobs:
        found = walk(blob)
        if found:
            return from_ld(found)
    return None


def recipe_site(url):
    url = (url or '').lower()
    host = re.sub(r'^https?://(?:www\.)?', '', url)
    if any(host.startswith(site) or ('.' + site) in host.split('/')[0] for site in lexicon.RECIPE_SITES):
        return True
    return bool(re.search(r'/recipes?/|/recipe-|[/-]recipe(?:s)?(?:[/-]|$)', url))


def is_recipe_link(row, meta, food=False):
    if row['kind'] != 'link':
        return False
    if isinstance(meta.get('recipe'), dict):
        return True
    words = ' '.join(filter(None, [row['title'], meta.get('description') if isinstance(meta.get('description'), str) else '']))
    if recipe_site(row['content']) or re.search(r'\brecipes?\b|\bhow to (?:make|cook|bake)\b', words, re.I):
        return True
    if not food:
        return False
    url = (row['content'] or '').lower()
    video = any(site in url for site in lexicon.FOOD_VIDEO_SITES)
    return food_count(words + ' ' + url.replace('-', ' ').replace('/', ' ')) >= (1 if video else 2)


def chapter_of(recipe):
    """Which divider a recipe goes behind: its title says most."""
    def tokens(text):
        text = (text or '').lower()
        for phrase in _PHRASES:
            text = text.replace(phrase.replace('_', ' '), phrase)
        return re.findall(r"[a-z_]+", text)
    scores = {}
    for i, (name, words) in enumerate(_CHAPTER_WORDS):
        if not words:
            continue
        title_hits = sum(1 for w in tokens(recipe.get('title')) if w in words)
        body = tokens(' '.join(recipe.get('steps') or [])[:1500])
        body_hits = sum(1 for w in body if w in words) if name not in ('Sauces & basics', 'Mains', 'Sides') else 0
        score = title_hits * 4 + min(body_hits, 4) * 0.5
        if score:
            scores[name] = score - i * 0.01  # ties go to the earlier chapter
    if not scores:
        return OTHER_CHAPTER
    return max(scores, key=scores.get)


def to_text(recipe):
    """A card written back out as a note anyone can read (and parse again)."""
    out = [recipe.get('title') or 'Untitled recipe']
    details = []
    if recipe.get('serves'):
        details.append(f"Makes {recipe['serves']} {recipe['makes']}" if recipe.get('makes') else f"Serves {recipe['serves']}")
    if recipe.get('prep'):
        details.append(f"Prep {fmt_minutes(recipe['prep'])}")
    if recipe.get('cook'):
        details.append(f"Cook {fmt_minutes(recipe['cook'])}")
    if details:
        out.append(' · '.join(details))
    if recipe.get('ingredients'):
        out += ['', 'Ingredients']
        out += [line if line.endswith(':') else f'- {line}' for line in recipe['ingredients']]
    if recipe.get('steps'):
        out += ['', 'Method']
        n = 0
        for step in recipe['steps']:
            if step.endswith(':') and len(step) < 60:
                out.append(step)
            else:
                n += 1
                out.append(f'{n}. {step}')
    if recipe.get('notes'):
        out += ['', 'Notes', recipe['notes']]
    return '\n'.join(out)


def fmt_minutes(m):
    if m < 60:
        return f'{m} min'
    hrs, mins = divmod(m, 60)
    return f'{hrs} hr {mins} min' if mins else f'{hrs} hr'


def _num(value, high):
    if value in (None, ''):
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not 0 < value <= high:
        raise ValueError
    return int(round(value))


def _str(value, limit):
    if value is None:
        return ''
    if not isinstance(value, str):
        raise ValueError
    return value.strip()[:limit]


def _lines(value, limit):
    if value is None:
        return []
    if not isinstance(value, list) or len(value) > MAX_LINES:
        raise ValueError
    out = []
    for line in value:
        if not isinstance(line, str):
            raise ValueError
        line = re.sub(r'\s+', ' ', line).strip()[:limit]
        if line:
            out.append(line)
    return out


def clean(body):
    """Check the parts of a card being saved (only the ones given). Raises
    ValueError when something's off."""
    if not isinstance(body, dict):
        raise ValueError
    checks = {
        'title': lambda v: _str(v, 200),
        'serves': lambda v: _num(v, 500),
        'makes': lambda v: _str(v, 40),
        'prep': lambda v: _num(v, 60 * 72),
        'cook': lambda v: _num(v, 60 * 72),
        'ingredients': lambda v: _lines(v, MAX_LINE),
        'steps': lambda v: _lines(v, MAX_STEP),
        'notes': lambda v: _str(v, MAX_NOTES),
        'chapter': lambda v: _str(v, MAX_CHAPTER) or OTHER_CHAPTER,
        'photo': _photo,
    }
    out = {}
    for key, value in body.items():
        if key not in checks:
            raise ValueError
        out[key] = checks[key](value)
    return out


def _photo(value):
    if value is not None and (not isinstance(value, str) or not re.match(r'^[\w-]{1,40}$', value)):
        raise ValueError
    return value


FOOD_SIGHTS = ('meal', 'baking', 'ingredients', 'drinks', 'restaurant')


def signs(title, files, purpose=None):
    """Whether a planet is being used to keep recipes, in plain words.
    files: [(row, meta)]; purpose: what sorting.purpose reads the planet as.
    {'fits', 'signs', 'recipes', 'food'}. A planet whose name or files say
    it's about food reads its notes and links more gently."""
    purpose = purpose or {}
    named = food_name(title)
    topics = dict(purpose.get('topics') or [])
    shows = dict(purpose.get('shows') or [])
    food_photos = sum(v for k, v in shows.items() if k in FOOD_SIGHTS)
    about = topics.get('Recipes', 0) >= 0.4 and next(iter(topics), None) == 'Recipes'
    food = named or about or food_photos >= 0.4
    n = len(files)
    notes, sites = [], []
    for row, meta in files:
        if isinstance(meta.get('recipe'), dict):
            (sites if row['kind'] == 'link' else notes).append(row['id'])
        elif row['kind'] == 'text' and is_recipe_note(row['content'], row['title'], food=food):
            notes.append(row['id'])
        elif is_recipe_link(row, meta, food=food):
            sites.append(row['id'])
    found = len(notes) + len(sites)
    out = []
    if named:
        out.append(f'It’s called “{title}”, which sounds like somewhere to keep recipes.')
    elif about:
        out.append('Most of what’s on it is about food and cooking.')
    if notes:
        out.append(f'{_count(len(notes), "note")} {"is" if len(notes) == 1 else "are"} '
                   f'{"a recipe" if len(notes) == 1 else "recipes"}.')
    if sites:
        out.append(f'{_count(len(sites), "link")} {"goes" if len(sites) == 1 else "go"} to recipes.')
    if food_photos >= 0.4:
        out.append('Its pictures are mostly of food.')
    if found and found == n and n > 1:
        out.append('Everything on it is a recipe.')
    fits = bool(found) and (found >= 4 or (found >= 2 and found >= 0.3 * n)
                            or (food and (found >= 2 or found >= 0.2 * n)))
    return {'fits': fits, 'signs': out, 'recipes': notes + sites, 'food': food}


def _count(n, word):
    words = {1: 'One', 2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six', 7: 'Seven', 8: 'Eight', 9: 'Nine'}
    return f'{words.get(n, n)} {word}{"" if n == 1 else "s"}'
