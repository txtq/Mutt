"""Everything of yours in one download: a zip holding a folder called
"<username>'s galaxy", with a folder for each planet (its moons inside it),
"Stars" for files on no planet, and "Your data.json" for everything Mutt
keeps about you (account, settings, planets, each file's details, comments,
reading places and highlights, document versions).

Only your own files go in. A file on several planets is in each planet's
folder. The zip is packed into a temporary file (already unlinked on most
systems) and streamed from it, so a big galaxy never sits in memory.
"""
import json
import os
import re
import tempfile
import time
import zipfile

from . import db

CHUNK = 256 * 1024
# Already squeezed: packing them again only costs time.
PACKED = {'image', 'video', 'audio', 'pdf', 'archive'}
DOC_IMAGE_EXT = {'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif'}
STARS = 'Stars'
OTHERS = 'On other people’s planets'
DELETED = 'Recently deleted'
README = 'Read me.txt'
DATA = 'Your data.json'


def iso(t):
    return time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(t)) if t else None


def safe_name(text, fallback, limit=80):
    """A name every computer accepts for a file or folder."""
    text = re.sub(r'[\\/:*?"<>|\x00-\x1f\x7f]', ' ', text or '')
    text = re.sub(r'\s+', ' ', text).strip().strip('.').strip()
    return text[:limit].strip() or fallback


class Folder:
    """Hands out names that don't clash inside one folder ("a.jpg", "a (2).jpg")."""

    def __init__(self, path, taken=()):
        self.path = path
        self.taken = {t.lower() for t in taken}

    def name(self, wanted, folder=False):
        stem, dot, ext = wanted.rpartition('.')
        if folder or not dot or not stem or len(ext) > 10:
            stem, ext = wanted, ''
        n, name = 1, wanted
        while name.lower() in self.taken:
            n += 1
            name = f'{stem} ({n})' + (f'.{ext}' if ext else '')
        self.taken.add(name.lower())
        return f'{self.path}/{name}'


def first_line(text):
    for line in (text or '').splitlines():
        line = re.sub(r'^[#>*\-\s\[\]xX]+', '', line).strip()
        if line:
            return line[:60]
    return ''


def loads(raw, empty):
    try:
        value = json.loads(raw or '')
    except ValueError:
        return empty
    return value if isinstance(value, type(empty)) else empty


def build(conn, user_id):
    """Write the zip to a temporary file; returns (open file, size, download name)."""
    uid = user_id
    user = conn.execute('SELECT * FROM users WHERE id = ?', (uid,)).fetchone()
    root = f"{user['username']}'s galaxy"
    files_dir = db.user_files_dir(uid)

    drawers = conn.execute('SELECT * FROM drawers WHERE user_id = ? ORDER BY created_at', (uid,)).fetchall()
    blocks = conn.execute('SELECT * FROM blocks WHERE user_id = ? ORDER BY created_at', (uid,)).fetchall()
    links = conn.execute(
        'SELECT c.block_id, c.drawer_id, c.position, c.checked, c.placed, d.title, d.user_id, d.parent_id, u.username '
        'FROM connections c JOIN blocks b ON b.id = c.block_id JOIN drawers d ON d.id = c.drawer_id '
        'JOIN users u ON u.id = d.user_id WHERE b.user_id = ? ORDER BY c.position', (uid,)).fetchall()

    # One folder per planet, its moons inside it.
    top = Folder(root, taken=[README, DATA, STARS, OTHERS, DELETED])
    folder_of = {}
    planets = [d for d in drawers if not d['parent_id']]
    for d in planets:
        folder_of[d['id']] = Folder(top.name(safe_name(d['title'], 'Untitled planet'), folder=True))
    for d in drawers:
        parent = folder_of.get(d['parent_id']) if d['parent_id'] else None
        if parent:
            folder_of[d['id']] = Folder(parent.name(safe_name(d['title'], 'Untitled moon'), folder=True))
    others = {}   # someone else's planet you put files on: its folder, made when first needed
    stars = Folder(f'{root}/{STARS}')
    deleted = Folder(f'{root}/{DELETED}')
    other_root = Folder(f'{root}/{OTHERS}')

    on = {}
    for c in links:
        on.setdefault(c['block_id'], []).append(c)

    tmp = tempfile.TemporaryFile(dir=db.DATA_DIR)
    data_files = []
    try:
        with zipfile.ZipFile(tmp, 'w', allowZip64=True) as z:
            def put_bytes(path, data, packed=False, when=None):
                info = zipfile.ZipInfo(path, time.localtime(when or time.time())[:6])
                info.compress_type = zipfile.ZIP_STORED if packed else zipfile.ZIP_DEFLATED
                info.external_attr = 0o644 << 16
                z.writestr(info, data)

            def put_file(path, src, packed, when):
                info = zipfile.ZipInfo(path, time.localtime(when)[:6])
                info.compress_type = zipfile.ZIP_STORED if packed else zipfile.ZIP_DEFLATED
                info.external_attr = 0o644 << 16
                with open(src, 'rb') as f, z.open(info, 'w', force_zip64=True) as out:
                    while chunk := f.read(CHUNK):
                        out.write(chunk)

            for b in blocks:
                where = on.get(b['id'], [])
                if b['deleted_at']:
                    homes = [deleted]
                elif not where:
                    homes = [stars]
                else:
                    homes = []
                    for c in where:
                        if c['drawer_id'] in folder_of:
                            homes.append(folder_of[c['drawer_id']])
                        else:
                            if c['drawer_id'] not in others:
                                label = safe_name(f"{c['title']} (@{c['username']})", 'A planet')
                                others[c['drawer_id']] = Folder(other_root.name(label, folder=True))
                            homes.append(others[c['drawer_id']])
                paths = []
                for home in homes:
                    paths += write_block(conn, b, home, files_dir, put_bytes, put_file)
                data_files.append(file_data(conn, b, where, folder_of, others, paths, root))

            put_bytes(f'{root}/{DATA}', json.dumps(
                everything(conn, user, drawers, folder_of, data_files, root),
                ensure_ascii=False, indent=2).encode('utf-8'))
            put_bytes(f'{root}/{README}', readme(user, len(planets), sum(1 for b in blocks if not b['deleted_at'])).encode('utf-8'))
        size = tmp.tell()
        tmp.seek(0)
    except BaseException:
        tmp.close()
        raise
    return tmp, size, f'{root}.zip'


def write_block(conn, b, home, files_dir, put_bytes, put_file):
    """Put one file in one folder; returns the paths it got there."""
    when = b['updated_at']
    title = b['title'] or ''
    if b['file_key']:
        src = os.path.join(files_dir, b['file_key'])
        if not os.path.exists(src):
            return []
        name = safe_name(b['file_name'] or title, 'file', 150)
        if b['ext'] and not name.lower().endswith('.' + b['ext']):
            name += '.' + b['ext']
        path = home.name(name)
        put_file(path, src, b['kind'] in PACKED, b['created_at'])
        return [path]
    if b['kind'] == 'link':
        url = (b['content'] or '').strip()
        path = home.name(safe_name(title, 'Link') + '.url')
        put_bytes(path, f'[InternetShortcut]\r\nURL={url}\r\n'.encode('utf-8'), when=when)
        return [path]
    if b['kind'] == 'text':
        stem = safe_name(title or first_line(b['content']), 'Note')
        path = home.name(stem + '.txt')
        put_bytes(path, (b['content'] or '').encode('utf-8'), when=when)
        paths = [path]
        # Pictures placed inside a document.
        pics = conn.execute('SELECT mime, data, created_at FROM doc_images WHERE block_id = ? ORDER BY created_at',
                            (b['id'],)).fetchall()
        for i, pic in enumerate(pics, 1):
            ext = DOC_IMAGE_EXT.get(pic['mime'], 'img')
            p = home.name(f'{stem} picture {i}.{ext}')
            put_bytes(p, pic['data'], packed=True, when=pic['created_at'])
            paths.append(p)
        return paths
    return []


def file_data(conn, b, where, folder_of, others, paths, root):
    meta = loads(b['meta'], {})
    meta.pop('see', None)   # a picture's reading: numbers only Mutt can use
    item = {
        'id': b['id'],
        'kind': b['kind'],
        'title': b['title'],
        'description': b['description'] or None,
        'inThisDownload': [p[len(root) + 1:] for p in paths],
        'fileName': b['file_name'],
        'type': b['mime'],
        'size': b['size'],
        'width': b['width'],
        'height': b['height'],
        'seconds': b['duration'],
        'link': (b['content'] or '').strip() if b['kind'] == 'link' else None,
        'details': meta or None,
        'added': iso(b['created_at']),
        'changed': iso(b['updated_at']),
        'sharedWithEveryone': iso(b['shared_at']),
        'deleted': iso(b['deleted_at']),
        'planets': [{
            'planet': c['title'],
            'folder': folder_of[c['drawer_id']].path[len(root) + 1:] if c['drawer_id'] in folder_of
            else others[c['drawer_id']].path[len(root) + 1:] if c['drawer_id'] in others else None,
            'owner': None if c['drawer_id'] in folder_of else c['username'],
            'ticked': iso(c['checked']),
            'placedBy': {'hand': 'you', 'auto': 'autosort'}.get(c['placed']),
        } for c in where],
    }
    comments = conn.execute(
        'SELECT u.username, f.body, f.created_at FROM file_comments f JOIN users u ON u.id = f.user_id '
        'WHERE f.block_id = ? ORDER BY f.created_at', (b['id'],)).fetchall()
    if comments:
        item['comments'] = [{'by': r['username'], 'said': r['body'], 'when': iso(r['created_at'])} for r in comments]
    if b['kind'] == 'text':
        doc = conn.execute('SELECT settings FROM docs WHERE block_id = ?', (b['id'],)).fetchone()
        if doc:
            versions = conn.execute(
                'SELECT title, text, name, created_at FROM doc_versions WHERE block_id = ? ORDER BY created_at',
                (b['id'],)).fetchall()
            notes = conn.execute(
                'SELECT u.username, d.quote, d.body, d.resolved, d.created_at FROM doc_comments d '
                'JOIN users u ON u.id = d.user_id WHERE d.block_id = ? ORDER BY d.created_at', (b['id'],)).fetchall()
            item['document'] = {
                'pageSetup': loads(doc['settings'], {}),
                'versions': [{'name': v['name'] or None, 'title': v['title'], 'text': v['text'],
                              'when': iso(v['created_at'])} for v in versions],
                'marginComments': [{'by': n['username'], 'on': n['quote'], 'said': n['body'],
                                    'resolved': bool(n['resolved']), 'when': iso(n['created_at'])} for n in notes],
            }
    return item


def everything(conn, user, drawers, folder_of, files, root):
    uid = user['id']
    names = {d['id']: d['title'] for d in drawers}
    people = {}
    for r in conn.execute('SELECT a.drawer_id, u.username FROM drawer_access a JOIN users u ON u.id = a.user_id '
                          'JOIN drawers d ON d.id = a.drawer_id WHERE d.user_id = ?', (uid,)):
        people.setdefault(r['drawer_id'], []).append(r['username'])
    # What autosort learned matters on each planet from where you moved files.
    attention = {r['drawer_id']: {'weights': loads(r['weights'], {}), 'lessons': r['lessons']} for r in conn.execute(
        'SELECT a.drawer_id, a.weights, a.lessons FROM planet_attention a JOIN drawers d ON d.id = a.drawer_id '
        'WHERE d.user_id = ?', (uid,))}
    planets = [{
        'id': d['id'],
        'name': d['title'],
        'description': d['description'] or None,
        'folder': folder_of[d['id']].path[len(root) + 1:] if d['id'] in folder_of else None,
        'moonOf': names.get(d['parent_id']),
        'whoCanSee': {'private': 'only you', 'pin': 'people with the code', 'people': 'chosen people',
                      'public': 'everyone'}.get(d['visibility'], d['visibility']),
        'chosenPeople': people.get(d['id'], []),
        'othersCanAdd': bool(d['community']),
        'kindOfWorld': d['look'],
        'modes': loads(d['modes'], {}),
        'autosortLearned': attention.get(d['id']),
        'made': iso(d['created_at']),
        'changed': iso(d['updated_at']),
    } for d in drawers]

    yours = conn.execute(
        'SELECT f.body, f.created_at, b.title, b.kind, u.username FROM file_comments f '
        'JOIN blocks b ON b.id = f.block_id JOIN users u ON u.id = b.user_id '
        'WHERE f.user_id = ? AND b.user_id != ? ORDER BY f.created_at', (uid, uid)).fetchall()
    progress = conn.execute(
        'SELECT b.title, p.loc, p.percent, p.updated_at, u.username FROM book_progress p JOIN blocks b ON b.id = p.block_id '
        'JOIN users u ON u.id = b.user_id WHERE p.user_id = ? ORDER BY p.updated_at', (uid,)).fetchall()
    marks = conn.execute(
        'SELECT b.title, m.kind, m.loc, m.text, m.color, m.note, m.percent, m.created_at FROM book_marks m '
        'JOIN blocks b ON b.id = m.block_id WHERE m.user_id = ? ORDER BY m.block_id, m.percent', (uid,)).fetchall()
    others_notes = conn.execute(
        'SELECT d.quote, d.body, d.created_at, b.title, u.username FROM doc_comments d '
        'JOIN blocks b ON b.id = d.block_id JOIN users u ON u.id = b.user_id '
        'WHERE d.user_id = ? AND b.user_id != ? ORDER BY d.created_at', (uid, uid)).fetchall()

    return {
        'about': 'Everything Mutt keeps about you, as of the time below.',
        'downloaded': iso(time.time()),
        'account': {
            'username': user['username'],
            'joined': iso(user['created_at']),
            'settings': loads(user['prefs'], {}),
        },
        'planets': planets,
        'files': files,
        'commentsYouLeftOnOthersFiles': [
            {'on': r['title'] or r['kind'], 'owner': r['username'], 'said': r['body'], 'when': iso(r['created_at'])}
            for r in yours],
        'commentsYouLeftInOthersDocuments': [
            {'document': r['title'], 'owner': r['username'], 'on': r['quote'], 'said': r['body'],
             'when': iso(r['created_at'])} for r in others_notes],
        'reading': {
            'whereYouAre': [{'book': r['title'], 'owner': r['username'], 'place': r['loc'],
                             'percent': round(r['percent'], 1), 'when': iso(r['updated_at'])} for r in progress],
            'highlightsAndBookmarks': [{'book': r['title'], 'kind': r['kind'], 'place': r['loc'],
                                        'text': r['text'] or None, 'colour': r['color'], 'note': r['note'] or None,
                                        'when': iso(r['created_at'])} for r in marks],
        },
    }


def readme(user, planets, files):
    return f"""{user['username']}'s galaxy
Downloaded from Mutt on {time.localtime().tm_mday} {time.strftime('%B %Y')}.

Each folder here is one of your planets, holding the files on it. A planet's
moons are folders inside it. A file that sits on more than one planet is in
each of their folders.

  {STARS}                       files that aren't on any planet
  {OTHERS}   files you put on someone else's planet
  {DELETED}             files you deleted in the last week
  {DATA}               everything else Mutt keeps about you: your
                                account and settings, your planets and who
                                can see them, each file's details, comments,
                                where you are in your books and your highlights,
                                and the earlier versions of your documents

Notes are plain text (.txt). Links are shortcuts (.url) that open in a browser.
Only your own files are here: files other people added to your planets are theirs.

{planets} planet{"" if planets == 1 else "s"}, {files} file{"" if files == 1 else "s"}.
"""


def stream(tmp):
    try:
        while chunk := tmp.read(CHUNK):
            yield chunk
    finally:
        tmp.close()
