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


def likeness(similarity):
    """How alike two pictures look (from dot() of their numbers), 0..1. CLIP
    puts unrelated pictures at about 0.45 and the same kind of subject at 0.75 and above."""
    return max(0.0, min(1.0, (similarity - 0.5) / 0.35))
