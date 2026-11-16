"""Speak to the Void: the model that writes out what was said, run in the browser.

Moonshine Tiny (Useful Sensors, MIT licence), English, as converted for browsers
by onnx-community, its weights squeezed to 8 bits: an encoder (8 MB) that reads
the sound and a decoder (20 MB) that writes the words. Mutt fetches it once into
the data folder, checks it, and serves it itself, so browsers only ever talk to
Mutt for it. The recording is read on the device; only the words are saved
(`meta.heard` on the file). MUTT_HEAR=0 turns it off; MUTT_HEAR_DIR points at a
folder that already holds the three files (for offline or test servers).
"""
import hashlib
import json
import os
import threading

VERSION = 1   # matches public/assets/js/hear.js HEAR_VERSION
LONGEST = 20_000   # characters of words kept for one recording

REVISION = 'a6da1241cd305dcd64eab1edbd615f2bb9aabb95'
BASE = f'https://huggingface.co/onnx-community/moonshine-tiny-ONNX/resolve/{REVISION}/'
# name served at /api/hear/<name>: (path in the repository, file kept as, sha256, size)
FILES = {
    'encoder': ('onnx/encoder_model_quantized.onnx', 'moonshine-tiny-encoder-q8.onnx',
                'c6fc4b7bc5af75c0591fd157a1f3829b533d18e9769a888fd95a62e470dd4f4a', 7937661),
    'decoder': ('onnx/decoder_model_merged_quantized.onnx', 'moonshine-tiny-decoder-q8.onnx',
                'eed87831c3a6103534aae7d47a5d485025c659a1323901513961c39fe8a1a367', 20243286),
    'tokenizer': ('tokenizer.json', 'moonshine-tiny-tokenizer.json',
                  '7b913404bdd039af4756783218af4440bc07fb7d6d8258d677e34f95b3ec416f', 3761754),
}
_state = {'state': 'idle', 'error': None}
_lock = threading.Lock()
_vocab = {}


def enabled():
    return os.environ.get('MUTT_HEAR', '1') != '0'


def path_of(name):
    from . import db
    return os.path.join(db.DATA_DIR, 'models', FILES[name][1])


def ready():
    return all(os.path.exists(path_of(n)) and os.path.getsize(path_of(n)) == FILES[n][3] for n in FILES)


def fetch():
    """Download the model in the background, once. Safe to call often."""
    if not enabled() or ready():
        return
    with _lock:
        if _state['state'] == 'fetching':
            return
        _state['state'] = 'fetching'
    threading.Thread(target=_download, name='hear-model', daemon=True).start()


def _download():
    import shutil
    import subprocess
    import urllib.request
    try:
        for name, (remote, _kept, sha, size) in FILES.items():
            path = path_of(name)
            if os.path.exists(path) and os.path.getsize(path) == size:
                continue
            os.makedirs(os.path.dirname(path), exist_ok=True)
            part = path + '.part'
            local = os.environ.get('MUTT_HEAR_DIR')
            if local:
                shutil.copyfile(os.path.join(local, os.path.basename(remote)), part)
            else:
                url = BASE + remote
                try:
                    req = urllib.request.Request(url, headers={'User-Agent': 'Mutt'})
                    with urllib.request.urlopen(req, timeout=60) as r, open(part, 'wb') as f:
                        shutil.copyfileobj(r, f, 1 << 20)
                except Exception:  # some Pythons lack certificates; curl usually has them
                    subprocess.run(['curl', '-sfL', '--max-time', '900', '-o', part, url], check=True)
            digest = hashlib.sha256()
            with open(part, 'rb') as f:
                for chunk in iter(lambda: f.read(1 << 20), b''):
                    digest.update(chunk)
            if digest.hexdigest() != sha:
                os.remove(part)
                raise ValueError(f'the downloaded {name} is not the one expected')
            os.replace(part, path)
        _state.update(state='idle', error=None)
    except Exception as err:  # try again next time something asks for it
        _state.update(state='failed', error=str(err)[:200])


def vocab():
    """The tokenizer's pieces in id order, all the browser needs to turn the
    model's numbers into words (a tenth of the size of the whole tokenizer)."""
    if 'bytes' not in _vocab:
        with open(path_of('tokenizer'), encoding='utf-8') as f:
            tok = json.load(f)
        pieces = [''] * (max(tok['model']['vocab'].values()) + 1)
        for piece, i in tok['model']['vocab'].items():
            pieces[i] = piece
        for added in tok.get('added_tokens', []):
            if added['id'] >= len(pieces):
                pieces += [''] * (added['id'] + 1 - len(pieces))
            pieces[added['id']] = ''   # special tokens are never written out
        _vocab['bytes'] = json.dumps(pieces, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    return _vocab['bytes']


def clean_heard(value):
    """What the browser read from a recording: {'v', 'text'}; the words trimmed and capped."""
    if not isinstance(value, dict):
        return None
    text = value.get('text')
    if not isinstance(text, str):
        return None
    text = ' '.join(text.split())[:LONGEST]
    v = value.get('v') if isinstance(value.get('v'), int) else VERSION
    return {'v': v, 'text': text}


def clean_voice(value):
    """A recording made in Mutt: its sound's shape as 64 levels (0 to 100)."""
    if not isinstance(value, dict):
        return None
    wave = value.get('wave')
    if not isinstance(wave, list) or not 8 <= len(wave) <= 128:
        return None
    try:
        wave = [max(0, min(100, int(round(float(x))))) for x in wave]
    except (TypeError, ValueError):
        return None
    return {'wave': wave}
