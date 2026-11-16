"""The sound and video converter, served by Mutt itself.

Downloading a song or a video as another format happens in the browser, with
ffmpeg built for the web (ffmpeg.wasm, its single-threaded core, LGPL). Its
engine is a 32 MB file that cdnjs doesn't carry, so Mutt fetches it once into
the data folder, checks it, and serves it, the way the picture reader's model
is (`sight.py`). The browser only ever talks to Mutt for it, and only the
first time someone converts a song or a video.

MUTT_CONVERT=0 turns it off; MUTT_CONVERT_DIR points at a folder that already
holds the two files (for testing without the network).
"""

import hashlib
import os
import threading

VERSION = '0.12.10'
BASE = f'https://cdn.jsdelivr.net/npm/@ffmpeg/core@{VERSION}/dist/umd/'
FILES = {
    'core.js': ('ffmpeg-core.js', 'b266ab5b952555881dd6310663986994a182acb2b7ff25cf10a25f7a37ac2b21', 112059,
                'text/javascript; charset=utf-8'),
    'core.wasm': ('ffmpeg-core.wasm', '9f57947a5bd530d8f00c5b3f2cb2a3492faa7e5d823315342d6a8656d0a6b7b7', 32232419,
                  'application/wasm'),
}
_state = {'fetching': False, 'error': None}
_lock = threading.Lock()


def enabled():
    return os.environ.get('MUTT_CONVERT', '1') != '0'


def path_of(name):
    from . import db
    return os.path.join(db.DATA_DIR, 'models', f'ffmpeg-{VERSION}-{FILES[name][0]}')


def ready():
    return all(os.path.exists(path_of(n)) and os.path.getsize(path_of(n)) == FILES[n][2] for n in FILES)


def content_type(name):
    return FILES[name][3]


def fetch():
    """Fetch both files in the background, once. Safe to call often."""
    if not enabled() or ready():
        return
    with _lock:
        if _state['fetching']:
            return
        _state['fetching'] = True
    threading.Thread(target=_download_all, name='convert-core', daemon=True).start()


def _download_all():
    try:
        for name in FILES:
            if not (os.path.exists(path_of(name)) and os.path.getsize(path_of(name)) == FILES[name][2]):
                _download(name)
        _state['error'] = None
    except Exception as err:  # try again next time something asks for it
        _state['error'] = str(err)[:200]
    finally:
        _state['fetching'] = False


def _download(name):
    import shutil
    import subprocess
    import urllib.request
    source, sha, _, _ = FILES[name]
    path = path_of(name)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    part = path + '.part'
    try:
        local = os.environ.get('MUTT_CONVERT_DIR')
        if local:
            shutil.copyfile(os.path.join(local, source), part)
        else:
            url = BASE + source
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
            raise ValueError(f'the downloaded {source} is not the one expected')
        os.replace(part, path)
    finally:
        try:
            os.remove(part)
        except OSError:
            pass
