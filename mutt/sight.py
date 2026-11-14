"""What a picture shows, from the numbers the browser's on-device model
(CLIP ViT-B/32) made of it. The browser saves them as meta['see']['e']
(512 signed bytes, base64); this module compares them with the
descriptions in lexicon.MEDIUMS and lexicon.SIGHTS (as numbers in
sights.json) and with other pictures. Pure Python, nothing sent anywhere.
"""
import base64
import hashlib
import json
import math
import os
from array import array
from operator import mul

MODEL = 'clip-vit-base-patch32'
VERSION = 1  # bump when the browser's way of making the numbers changes
SCALE = 100.0  # CLIP's own sharpness for turning likeness into chances


def unpack(text):
    """base64 of signed bytes -> unit-length list of floats (or None)."""
    try:
        raw = base64.b64decode(text)
    except (ValueError, TypeError):
        return None
    if len(raw) != 512:
        return None
    v = array('b', raw)
    norm = math.sqrt(sum(x * x for x in v)) or 1.0
    return array('f', (x / norm for x in v))  # compact: thousands of these stay in memory


def _load():
    path = os.path.join(os.path.dirname(__file__), 'sights.json')
    try:
        with open(path, 'rb') as f:
            raw = f.read()
        data = json.loads(raw)
    except (OSError, ValueError):
        return {}, {}, ''
    return ({k: unpack(v) for k, v in data.get('mediums', {}).items()},
            {k: unpack(v) for k, v in data.get('sights', {}).items()},
            hashlib.sha1(raw).hexdigest()[:10])


MEDIUM_VECS, SIGHT_VECS, KEY = _load()  # KEY changes whenever the descriptions do


def dot(a, b):
    return sum(map(mul, a, b))


def chances(vec, table):
    """Softmax over a table of descriptions: {name: chance}."""
    if not table:
        return {}
    scores = {k: SCALE * dot(vec, v) for k, v in table.items() if v}
    top = max(scores.values())
    exps = {k: math.exp(s - top) for k, s in scores.items()}
    total = sum(exps.values())
    return {k: e / total for k, e in exps.items()}


def labels(vec):
    """What a picture is and shows, as the few likely answers: ({medium: chance}, {sight: chance})."""
    mediums = chances(vec, MEDIUM_VECS)
    sights = chances(vec, SIGHT_VECS)
    return ({k: round(p, 3) for k, p in mediums.items() if p >= 0.05},
            {k: round(p, 3) for k, p in sights.items() if p >= 0.04})


def remember(see):
    """Add the readings to a meta['see'] the browser sent, so they're worked out once."""
    vec = unpack(see.get('e', ''))
    if vec:
        see['m'], see['s'] = labels(vec)
        see['k'] = KEY
    return see


def read(see):
    """meta['see'] -> (vector, {medium: chance}, {sight: chance}), or (None, {}, {})."""
    if not isinstance(see, dict) or see.get('v') != VERSION or not see.get('e'):
        return None, {}, {}
    vec = unpack(see['e'])
    if not vec:
        return None, {}, {}
    if see.get('k') == KEY and isinstance(see.get('m'), dict) and isinstance(see.get('s'), dict):
        return vec, see['m'], see['s']
    mediums, sights = labels(vec)
    return vec, mediums, sights


# ---------------------------------------------------------------- searching by what pictures show
SHOWS_AT = 0.25  # how sure a reading must be for search to say a picture shows something


def _picture_words():
    from .lexicon import MEDIUMS, PICTURE_WORDS, SIGHTS
    words = {}
    for name, extra in PICTURE_WORDS.items():
        if name not in MEDIUMS and name not in SIGHTS:
            continue
        for w in [name, *extra.split('|')]:
            if w:
                words.setdefault(w, name)
    return words


PICTURE_WORDS = _picture_words()
LONGEST_WORD = max((len(w.split()) for w in PICTURE_WORDS), default=1)


def _word(token):
    """A typed word as a picture word, plurals included ("beaches", "puppies")."""
    for w in (token, token[:-3] + 'y' if token.endswith('ies') else None,
              token[:-2] if token.endswith('es') else None, token[:-1] if token.endswith('s') else None):
        if w and w in PICTURE_WORDS:
            return PICTURE_WORDS[w]
    return None


def asked(text):
    """The kinds of picture and subjects that typed words ask for, when every
    word means one ("dogs", "a cat on the beach", "linocut"), else an empty set."""
    from .lexicon import PICTURE_FILLER
    tokens = [t for t in text.lower().replace(',', ' ').split() if t not in PICTURE_FILLER]
    names, i = set(), 0
    while i < len(tokens):
        for n in range(min(LONGEST_WORD, len(tokens) - i), 0, -1):
            name = _word(' '.join(tokens[i:i + n]))
            if name:
                names.add(name)
                i += n
                break
        else:
            return set()
    return names


def shows(see, names, kind=None):
    """Whether a picture's reading says it is or shows every one of `names`.
    A link's picture is a web page's preview: what it shows counts half, as in sorting."""
    vec, mediums, sights = read(see)
    if vec is None:
        return False
    if kind == 'link':
        mediums, sights = {}, {k: p * 0.5 for k, p in sights.items()}
    return all(max(mediums.get(n, 0), sights.get(n, 0)) >= SHOWS_AT for n in names)


def likeness(similarity):
    """How alike two pictures look (from dot() of their numbers), 0..1. CLIP
    puts unrelated pictures at about 0.45 and the same kind of subject at 0.75 and above."""
    return max(0.0, min(1.0, (similarity - 0.5) / 0.35))


# ---------------------------------------------------------------- the model the browser runs
# OpenAI's CLIP ViT-B/32 picture half (MIT licence), as converted for browsers
# by Xenova, with its weights squeezed to 4 bits (64 MB). Mutt fetches it once
# into the data folder and serves it itself, so browsers only ever talk to Mutt
# for it; pictures are read in the browser and never leave the device.
MODEL_URL = ('https://huggingface.co/Xenova/clip-vit-base-patch32/resolve/'
             '6b7c523703ae26e39be4b03774966f8571c7f523/onnx/vision_model_q4.onnx')
MODEL_SHA256 = '0769eb1d2f6f68927bbfa6e5330df4c4c3c112f89cd43eae28baafa9e6bd34b4'
MODEL_SIZE = 63642858
_fetching = {'state': 'idle', 'error': None}


def model_path():
    from . import db
    return os.path.join(db.DATA_DIR, 'models', 'clip-vit-b32-vision-q4.onnx')


def model_ready():
    path = model_path()
    return os.path.exists(path) and os.path.getsize(path) == MODEL_SIZE


def fetch_model():
    """Download the model in the background, once. Safe to call often."""
    import threading
    if os.environ.get('MUTT_SEE', '1') == '0' or model_ready() or _fetching['state'] == 'fetching':
        return
    _fetching['state'] = 'fetching'
    threading.Thread(target=_download, name='see-model', daemon=True).start()


def _download():
    import shutil
    import subprocess
    import urllib.request
    path = model_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    part = path + '.part'
    try:
        local = os.environ.get('MUTT_SEE_MODEL')  # a copy already on disk (for testing)
        if local:
            shutil.copyfile(local, part)
        else:
            try:
                req = urllib.request.Request(MODEL_URL, headers={'User-Agent': 'Mutt'})
                with urllib.request.urlopen(req, timeout=60) as r, open(part, 'wb') as f:
                    shutil.copyfileobj(r, f, 1 << 20)
            except Exception:  # some Pythons lack certificates; curl usually has them
                subprocess.run(['curl', '-sfL', '--max-time', '900', '-o', part, MODEL_URL], check=True)
        digest = hashlib.sha256()
        with open(part, 'rb') as f:
            for chunk in iter(lambda: f.read(1 << 20), b''):
                digest.update(chunk)
        if digest.hexdigest() != MODEL_SHA256:
            raise ValueError('the downloaded model is not the one expected')
        os.replace(part, path)
        _fetching.update(state='idle', error=None)
    except Exception as err:  # try again next time something asks for it
        _fetching.update(state='failed', error=str(err)[:200])
        try:
            os.remove(part)
        except OSError:
            pass
