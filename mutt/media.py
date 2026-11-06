"""What a file says about itself: the details stored inside photos, videos,
music, PDFs and office files (camera, date, place, app, artist, album,
author, keywords). Only headers are read; pictures and sound are never decoded.

read(path, ext) returns a small dict for meta['media'] (empty when there's
nothing), which sorting and search use alongside the file's name and text.
"""
import calendar
import re
import struct
import time
import zipfile

HEAD = 1 << 20  # most details sit in the first megabyte
TAIL = 1 << 16


def read(path, ext):
    try:
        with open(path, 'rb') as f:
            head = f.read(HEAD)
            f.seek(0, 2)
            size = f.tell()
            tail = b''
            if size > HEAD:
                f.seek(max(HEAD, size - TAIL))
                tail = f.read()
            info = {}
            if ext in ('mp4', 'm4v', 'mov', '3gp', 'm4a', 'aac', 'heic', 'heif', 'avif') or head[4:8] == b'ftyp':
                info.update(_bmff(f, size, head))
            if head[:3] == b'ID3' or ext == 'mp3':
                info.update(_id3(head, tail))
            if head[:4] == b'fLaC':
                info.update(_vorbis_block(head))
            if head[:4] == b'OggS':
                info.update(_ogg(head))
            if head[:4] == b'RIFF' and head[8:12] in (b'WAVE', b'AVI '):
                info.update(_riff(head))
            if head[:4] == b'FORM' and head[8:12] in (b'AIFF', b'AIFC'):
                info.update(_aiff(head))
            if head[:8] == b'\x89PNG\r\n\x1a\n':
                info.update(_png(head))
            if head[:5] == b'%PDF-':
                info.update(_pdf(head + tail))
        if ext in ('docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp', 'pages', 'numbers', 'key', 'epub'):
            info.update(_office(path))
        tiff = _find_tiff(head)
        if tiff is not None:
            info = {**_exif(tiff), **info}
        xmp = _xmp(head + tail)
        for k, v in xmp.items():
            info.setdefault(k, v)
        return finish(info)
    except Exception:  # a broken or unusual file just tells us nothing
        return {}


# ---------------------------------------------------------------- tidying up

PHONES = re.compile(r'iphone|ipad|pixel|galaxy|\bsm-[a-z]\d|oneplus|xiaomi|redmi|huawei|honor|oppo|vivo|'
                    r'motorola|moto |nokia|nothing phone|fairphone|lg-|htc', re.I)
CAMERAS = re.compile(r'canon|nikon|sony|fujifilm|olympus|om digital|panasonic|leica|pentax|ricoh|hasselblad|'
                     r'sigma|kodak|phase one|minolta|zeiss', re.I)
DRONES = re.compile(r'\bdji\b|mavic|phantom|^fc\d{4}', re.I)
ACTION = re.compile(r'gopro|insta360|hero\d', re.I)
SCANNERS = re.compile(r'scan|epson perfection|canoscan|fujitsu|fi-\d|doxie|vuescan|scansnap|adobe scan|'
                      r'microsoft lens|office lens|genius scan|camscanner|tiny ?scanner|swiftscan', re.I)
DRAWING_APPS = re.compile(r'procreate|krita|clip studio|paint tool sai|medibang|ibis|fresco|sketchbook|'
                          r'artrage|rebelle|corel painter|infinite painter|concepts|tayasui|paintstorm|mypaint|'
                          r'illustrator|affinity designer|inkscape|vectornator|linearity|aseprite|pixaki|'
                          r'blender|zbrush|nomad sculpt|cinema 4d|maya|substance|houdini|sketchup|rhino', re.I)
DESIGN_APPS = re.compile(r'figma|sketch\b|canva|indesign|affinity publisher|quarkxpress|framer|adobe xd|'
                         r'keynote|powerpoint', re.I)
PHOTO_APPS = re.compile(r'lightroom|photoshop|capture one|darktable|rawtherapee|snapseed|vsco|luminar|'
                        r'dxo|affinity photo|pixelmator|photos \d|on1|apple photos|hipstamatic|polarr', re.I)
GENERATORS = re.compile(r'midjourney|dall.?e|stable diffusion|comfyui|automatic1111|novelai|firefly|'
                        r'imagen|flux|leonardo', re.I)
SCREEN_APPS = re.compile(r'screenshot|screen shot|snipping|greenshot|sharex|cleanshot|lightshot|snagit|'
                         r'skitch|gnome-screenshot|spectacle', re.I)
MUSIC_APPS = re.compile(r'logic pro|garageband|ableton|live \d|pro tools|cubase|fl studio|reaper|bitwig|'
                        r'studio one|reason \d|maschine|ardour|nuendo|reaktor|serato|traktor|auria|beatmaker|'
                        r'koala sampler|bandlab|soundtrap|adobe audition|izotope|isotope', re.I)
VOICE_APPS = re.compile(r'voice ?memos?|voice recorder|just press record|otter|recorder|zoom h\d|tascam|'
                        r'olympus ws|sony icd', re.I)
VIDEO_APPS = re.compile(r'premiere|final cut|davinci|resolve|imovie|capcut|after effects|vegas|'
                        r'kdenlive|shotcut|lumafusion|filmora|handbrake|ffmpeg|lavf|obs', re.I)
WRITING_APPS = re.compile(r'microsoft word|word for|pages|google docs|libreoffice writer|openoffice|'
                          r'scrivener|ulysses|latex|pdftex|xetex|luatex|overleaf|typora|bear|notion|'
                          r'obsidian|ia writer|markdown', re.I)
SHEET_APPS = re.compile(r'excel|numbers|google sheets|libreoffice calc', re.I)
NOTATION_APPS = re.compile(r'musescore|sibelius|finale|dorico|lilypond|noteflight|guitar pro|flat\.io', re.I)
DOC_SYSTEMS = re.compile(r'quickbooks|xero|freeagent|sage|wave|stripe|paypal|square|shopify|zoho|'
                         r'invoice|receipt|crystal reports|jasperreports|docusign|adobe sign|hellosign', re.I)


def made_with(software):
    """What an app tells us about how a file came about."""
    s = software or ''
    for pattern, how in ((SCREEN_APPS, 'screenshot'), (GENERATORS, 'generated'), (SCANNERS, 'scanned'),
                         (NOTATION_APPS, 'notation'), (DRAWING_APPS, 'drawn'), (DESIGN_APPS, 'designed'),
                         (MUSIC_APPS, 'produced'), (VOICE_APPS, 'voice memo'), (VIDEO_APPS, 'edited video'), (PHOTO_APPS, 'edited'),
                         (SHEET_APPS, 'spreadsheet'), (DOC_SYSTEMS, 'business'), (WRITING_APPS, 'written')):
        if pattern.search(s):
            return how
    return None


def device_of(make, model):
    both = f'{make or ""} {model or ""}'.strip()
    if not both:
        return None
    for pattern, kind in ((DRONES, 'drone'), (ACTION, 'action camera'), (SCANNERS, 'scanner'),
                          (PHONES, 'phone'), (re.compile(r'^apple\b', re.I), 'phone'), (CAMERAS, 'camera')):
        if pattern.search(both):
            return kind
    return 'camera'


def finish(info):
    out = {}
    make, model = clean(info.get('make')), clean(info.get('model'))
    if make or model:
        camera = model if model and make and model.lower().startswith(make.split()[0].lower()) else \
            ' '.join(filter(None, [make, model]))
        out['camera'] = camera[:80]
        out['device'] = device_of(make, model)
    software = clean(info.get('software')) or clean(info.get('creator')) or clean(info.get('producer'))
    if software:
        out['software'] = software[:80]
    how = made_with(' '.join(filter(None, [info.get('software'), info.get('creator'), info.get('producer'),
                                           info.get('template'), info.get('comment')])))
    if info.get('generated'):
        how = 'generated'
    if info.get('screenshot'):
        how = 'screenshot'
    if how:
        out['made'] = how
    for key in ('lens', 'title', 'artist', 'album', 'genre', 'author', 'subject', 'template', 'location'):
        value = clean(info.get(key))
        if value:
            out[key] = value[:160]
    words = ' '.join(filter(None, [clean(info.get('caption')), clean(info.get('comment')) if not how else '']))
    if words:
        out['caption'] = words[:400]
    keywords = [clean(k) for k in info.get('keywords', []) if clean(k)]
    if keywords:
        out['keywords'] = list(dict.fromkeys(keywords))[:30]
    for key in ('focal', 'iso', 'year', 'bpm', 'pages', 'words', 'duration', 'w', 'h'):
        if isinstance(info.get(key), (int, float)) and info[key] > 0:
            out[key] = round(info[key], 2) if isinstance(info[key], float) else info[key]
    if info.get('taken'):
        out['taken'] = int(info['taken'])
    if info.get('gps'):
        lat, lon = info['gps']
        if -90 <= lat <= 90 and -180 <= lon <= 180 and (lat, lon) != (0, 0):
            out['gps'] = [round(lat, 5), round(lon, 5)]
    if info.get('kinds'):
        out['tracks'] = sorted(info['kinds'])
    return out


def clean(value):
    if value is None:
        return ''
    if isinstance(value, bytes):
        value = value.decode('utf-8', 'replace')
    value = re.sub(r'[\x00-\x1f�]+', ' ', str(value)).strip()
    return '' if value.lower() in ('', 'unknown', 'none', 'untitled', 'default') else value


def when(text):
    """'2024:06:01 14:22:05' and friends -> seconds (treated as UTC; only gaps matter)."""
    m = re.match(r'(\d{4})[:\-](\d{2})[:\-](\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?', clean(text))
    if not m:
        return None
    y, mo, d = int(m[1]), int(m[2]), int(m[3])
    if not (1970 <= y <= 2100 and 1 <= mo <= 12 and 1 <= d <= 31):
        return None
    return calendar.timegm((y, mo, d, int(m[4] or 0), int(m[5] or 0), int(m[6] or 0)))


# ---------------------------------------------------------------- EXIF (JPEG, HEIC, TIFF, PNG, WebP, raw)

def _find_tiff(head):
    if head[:4] in (b'II*\x00', b'MM\x00*'):
        return head
    at = head.find(b'Exif\x00\x00')
    while at != -1:
        start = head[at + 6:at + 10]
        if start in (b'II*\x00', b'MM\x00*'):
            return head[at + 6:]
        at = head.find(b'Exif\x00\x00', at + 6)
    return None


TAGS = {0x010F: 'make', 0x0110: 'model', 0x0131: 'software', 0x0132: 'datetime', 0x013B: 'artist',
        0x010E: 'caption', 0x9003: 'taken', 0x9004: 'digitized', 0xA434: 'lens', 0xA405: 'focal',
        0x920A: 'focal_raw', 0x8827: 'iso', 0x9286: 'comment', 0x9C9B: 'xp_title', 0x9C9C: 'xp_comment',
        0x9C9E: 'xp_keywords', 0x9C9F: 'xp_subject', 0xA002: 'w', 0xA003: 'h'}


def _exif(t):
    order = '<' if t[:2] == b'II' else '>'

    def u16(o):
        return struct.unpack_from(order + 'H', t, o)[0]

    def u32(o):
        return struct.unpack_from(order + 'I', t, o)[0]

    sizes = {1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8}

    def value(typ, count, at):
        size = sizes.get(typ, 1) * count
        off = at if size <= 4 else u32(at)
        if off + size > len(t):
            return None
        raw = t[off:off + size]
        if typ == 2:
            return raw.split(b'\x00')[0].decode('utf-8', 'replace')
        if typ == 3:
            return [struct.unpack_from(order + 'H', raw, i * 2)[0] for i in range(count)]
        if typ in (4, 9):
            return [struct.unpack_from(order + ('I' if typ == 4 else 'i'), raw, i * 4)[0] for i in range(count)]
        if typ in (5, 10):
            out = []
            for i in range(count):
                a, b = struct.unpack_from(order + ('II' if typ == 5 else 'ii'), raw, i * 8)
                out.append(a / b if b else 0.0)
            return out
        return raw

    def ifd(off, depth=0):
        found = {}
        if off <= 0 or off + 2 > len(t) or depth > 3:
            return found
        for i in range(min(u16(off), 400)):
            at = off + 2 + i * 12
            if at + 12 > len(t):
                break
            tag, typ, count = u16(at), u16(at + 2), u32(at + 4)
            if count > 100000:
                continue
            if tag in (0x8769, 0x8825):
                found[tag] = ifd(u32(at + 8), depth + 1)
                continue
            found[tag] = value(typ, count, at + 8)
        return found

    info = {}
    top = ifd(u32(4))
    exif = top.pop(0x8769, {})
    gps = top.pop(0x8825, {})
    for tag, v in {**top, **exif}.items():
        name = TAGS.get(tag)
        if not name or v is None:
            continue
        if name.startswith('xp_'):
            v = bytes(v).decode('utf-16-le', 'replace').rstrip('\x00') if isinstance(v, (bytes, list)) else v
            if name == 'xp_keywords':
                info.setdefault('keywords', []).extend(k.strip() for k in v.split(';') if k.strip())
            else:
                info.setdefault('caption', v)
            continue
        if name == 'comment' and isinstance(v, bytes):
            v = v[8:].decode('utf-16' if v[:8] == b'UNICODE\x00' else 'utf-8', 'replace').strip('\x00 ')
        if isinstance(v, list):
            v = v[0] if v else None
        info[name] = v
    for key in ('taken', 'digitized', 'datetime'):
        stamp = when(info.pop(key, None) or '')
        if stamp and not info.get('taken_at'):
            info['taken_at'] = stamp
    if info.get('taken_at'):
        info['taken'] = info.pop('taken_at')
    if info.get('focal_raw') and not info.get('focal'):
        info['focal'] = info['focal_raw']
    info.pop('focal_raw', None)
    if isinstance(info.get('caption'), str) and re.fullmatch(r'\s*(?:OLYMPUS DIGITAL CAMERA|SONY DSC|'
                                                              r'DCIM|Exif_JPEG_PICTURE|\s*)\s*', info['caption']):
        info.pop('caption')
    if isinstance(info.get('comment'), str) and SCREEN_APPS.search(info['comment']):
        info['screenshot'] = True
    try:
        lat, lon = gps.get(2), gps.get(4)
        if lat and lon and len(lat) == 3 and len(lon) == 3:
            la = lat[0] + lat[1] / 60 + lat[2] / 3600
            lo = lon[0] + lon[1] / 60 + lon[2] / 3600
            if (gps.get(1) or 'N').upper().startswith('S'):
                la = -la
            if (gps.get(3) or 'E').upper().startswith('W'):
                lo = -lo
            info['gps'] = (la, lo)
    except Exception:
        pass
    return info


# ---------------------------------------------------------------- XMP (embedded XML in most formats)

def _xmp(data):
    start = data.find(b'<x:xmpmeta')
    if start == -1:
        start = data.find(b'<rdf:RDF')
    if start == -1:
        return {}
    end = data.find(b'</x:xmpmeta>', start)
    if end == -1:
        end = data.find(b'</rdf:RDF>', start)
    xml = data[start:end if end != -1 else start + 200000].decode('utf-8', 'replace')
    info = {}

    def bag(tag):
        m = re.search(r'<%s\b[^>]*>(.*?)</%s>' % (tag, tag), xml, re.S)
        return [unescape(x) for x in re.findall(r'<rdf:li\b[^>]*>(.*?)</rdf:li>', m[1], re.S)] if m else []

    def one(*tags):
        for tag in tags:
            m = re.search(r'<%s\b[^>]*>(.*?)</%s>' % (tag, tag), xml, re.S)
            if m:
                items = re.findall(r'<rdf:li\b[^>]*>(.*?)</rdf:li>', m[1], re.S)
                return unescape(items[0] if items else m[1])
            m = re.search(r'\b%s="([^"]*)"' % tag, xml)
            if m:
                return unescape(m[1])
        return None

    keywords = bag('dc:subject') + [k.split('|')[-1] for k in bag('lr:hierarchicalSubject')]
    if keywords:
        info['keywords'] = keywords
    for key, tags in (('caption', ('dc:description', 'photoshop:Headline', 'exif:UserComment')),
                      ('title', ('dc:title',)), ('creator', ('xmp:CreatorTool',)),
                      ('author', ('dc:creator',)), ('location', ('Iptc4xmpCore:Location', 'photoshop:City')),
                      ('taken', ('photoshop:DateCreated', 'exif:DateTimeOriginal', 'xmp:CreateDate'))):
        v = one(*tags)
        if v:
            info[key] = when(v) if key == 'taken' else v
    country = one('photoshop:Country')
    if country:
        info['location'] = ', '.join(filter(None, [info.get('location'), country]))
    if info.get('caption') and SCREEN_APPS.search(info['caption']):
        info['screenshot'] = True
        info.pop('caption')
    if not info.get('taken'):
        info.pop('taken', None)
    return info


def unescape(s):
    s = re.sub(r'<[^>]+>', ' ', s)
    return (s.replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>').replace('&quot;', '"')
            .replace('&apos;', "'").replace('&#xA;', ' ').strip())


# ---------------------------------------------------------------- PNG

def _png(data):
    info = {}
    at = 8
    while at + 8 <= len(data):
        length, typ = struct.unpack_from('>I4s', data, at)
        body = data[at + 8:at + 8 + length]
        if typ in (b'tEXt', b'iTXt', b'zTXt'):
            key, _, rest = body.partition(b'\x00')
            key = key.decode('latin-1')
            if typ == b'iTXt':
                rest = rest[2:].split(b'\x00', 2)[-1]
            elif typ == b'zTXt':
                try:
                    import zlib
                    rest = zlib.decompress(rest[1:])
                except Exception:
                    rest = b''
            text = rest.decode('utf-8', 'replace')
            low = key.lower()
            if low == 'software':
                info['software'] = text
            elif low in ('description', 'comment', 'title'):
                info['caption' if low != 'title' else 'title'] = text
            elif low in ('parameters', 'prompt', 'workflow', 'dream', 'sd-metadata'):
                info['generated'] = True
            elif low == 'author':
                info['author'] = text
        elif typ == b'eXIf':
            info.update({k: v for k, v in _exif(body).items() if k not in info})
        elif typ == b'IHDR':
            info['w'], info['h'] = struct.unpack_from('>II', body)
        elif typ == b'IEND':
            break
        at += 12 + length
    return info


# ---------------------------------------------------------------- MP4 / MOV / M4A / HEIC (ISO boxes)

def _boxes(data, start=0, end=None):
    end = len(data) if end is None else end
    at = start
    while at + 8 <= end:
        size, typ = struct.unpack_from('>I4s', data, at)
        head = 8
        if size == 1 and at + 16 <= end:
            size = struct.unpack_from('>Q', data, at + 8)[0]
            head = 16
        elif size == 0:
            size = end - at
        if size < head:
            break
        yield typ, at + head, min(at + size, end)
        at += size


ILST = {b'\xa9nam': 'title', b'\xa9ART': 'artist', b'aART': 'artist', b'\xa9alb': 'album', b'\xa9gen': 'genre',
        b'\xa9day': 'year', b'\xa9cmt': 'comment', b'\xa9too': 'software', b'\xa9swr': 'software',
        b'\xa9mak': 'make', b'\xa9mod': 'model', b'\xa9xyz': 'place', b'desc': 'caption', b'\xa9des': 'caption',
        b'keyw': 'keywords', b'\xa9wrt': 'author', b'tmpo': 'bpm'}
QT_KEYS = {'com.apple.quicktime.make': 'make', 'com.apple.quicktime.model': 'model',
           'com.apple.quicktime.software': 'software', 'com.apple.quicktime.location.ISO6709': 'place',
           'com.apple.quicktime.creationdate': 'created', 'com.apple.quicktime.title': 'title',
           'com.apple.quicktime.description': 'caption', 'com.apple.quicktime.keywords': 'keywords',
           'com.apple.quicktime.author': 'author', 'com.android.manufacturer': 'make',
           'com.android.model': 'model', 'com.apple.quicktime.artist': 'artist'}
EPOCH_1904 = 2082844800


def _bmff(f, size, head):
    info = {}
    moov = None
    at = 0
    for _ in range(64):  # walk the top level by seeking, so moov at the end costs nothing extra
        if at + 8 > size:
            break
        f.seek(at)
        top = f.read(16)
        if len(top) < 8:
            break
        box, typ = struct.unpack_from('>I4s', top)
        if box == 1:
            box = struct.unpack_from('>Q', top, 8)[0]
        elif box == 0:
            box = size - at
        if box < 8:
            break
        if typ == b'moov' and box <= 16 << 20:
            f.seek(at)
            moov = f.read(box)
        elif typ == b'meta' and box <= 4 << 20 and moov is None:  # HEIC keeps its details here
            f.seek(at)
            moov = f.read(box)
        at += box
    if moov is None:
        return info
    kinds = set()

    def walk(data, start, end, path=()):
        for typ, s, e in _boxes(data, start, end):
            if typ in (b'moov', b'trak', b'mdia', b'udta', b'minf', b'stbl'):
                walk(data, s, e, path + (typ,))
            elif typ == b'meta':
                s2 = s + 4 if data[s + 4:s + 8] in (b'hdlr',) or data[s:s + 4] == b'\x00\x00\x00\x00' else s
                keys = []
                for t2, a, b in _boxes(data, s2, e):
                    if t2 == b'keys':
                        count = struct.unpack_from('>I', data, a + 4)[0]
                        p = a + 8
                        for _ in range(min(count, 200)):
                            n = struct.unpack_from('>I', data, p)[0]
                            keys.append(data[p + 8:p + n].decode('utf-8', 'replace'))
                            p += n
                    elif t2 == b'ilst':
                        for t3, c, d in _boxes(data, a, b):
                            name = ILST.get(t3)
                            if not name and keys:
                                index = struct.unpack('>I', t3)[0]
                                if 1 <= index <= len(keys):
                                    name = QT_KEYS.get(keys[index - 1])
                            if not name:
                                continue
                            for t4, g, h in _boxes(data, c, d):
                                if t4 == b'data':
                                    kind = struct.unpack_from('>I', data, g)[0] & 0xffffff
                                    raw = data[g + 8:h]
                                    if name == 'bpm' and len(raw) >= 2:
                                        info['bpm'] = struct.unpack_from('>H', raw)[0]
                                    elif kind in (1, 0):
                                        set_box(info, name, raw.decode('utf-8', 'replace'))
            elif typ == b'mvhd':
                version = data[s]
                if version == 1:
                    created, _, scale, length = struct.unpack_from('>QQIQ', data, s + 4)
                else:
                    created, _, scale, length = struct.unpack_from('>IIII', data, s + 4)
                if scale:
                    info['duration'] = length / scale
                if created > EPOCH_1904 + 86400 * 365:
                    info.setdefault('taken', created - EPOCH_1904)
            elif typ == b'tkhd':
                version = data[s]
                o = s + (84 if version == 1 else 72)
                if o + 8 <= e:
                    w, h = struct.unpack_from('>II', data, o)
                    if w >> 16 and h >> 16:
                        info['w'], info['h'] = w >> 16, h >> 16
            elif typ == b'hdlr':
                kinds.add(data[s + 8:s + 12].decode('latin-1'))
            elif typ in ILST and b'udta' in path:
                n = struct.unpack_from('>H', data, s)[0] if e - s >= 4 else 0
                set_box(info, ILST[typ], data[s + 4:s + 4 + n].decode('utf-8', 'replace'))

    walk(moov, 0, len(moov))
    tracks = {k for k in kinds if k in ('vide', 'soun')}
    if tracks:
        info['kinds'] = {'video' if k == 'vide' else 'sound' for k in tracks}
    if info.get('created'):
        stamp = when(info.pop('created'))
        if stamp:
            info['taken'] = stamp
    place = info.pop('place', None)
    if place:
        m = re.match(r'([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)', place)
        if m:
            info['gps'] = (float(m[1]), float(m[2]))
    if isinstance(info.get('year'), str):
        m = re.match(r'(\d{4})', info['year'])
        info['year'] = int(m[1]) if m else None
    return info


def set_box(info, name, text):
    text = text.strip('\x00 ')
    if not text:
        return
    if name == 'keywords':
        info.setdefault('keywords', []).extend(k.strip() for k in re.split(r'[,;]', text) if k.strip())
    else:
        info.setdefault(name, text)


# ---------------------------------------------------------------- MP3 (ID3)

GENRES = ('Blues Classic Rock|Country|Dance|Disco|Funk|Grunge|Hip-Hop|Jazz|Metal|New Age|Oldies|Other|Pop|R&B|'
          'Rap|Reggae|Rock|Techno|Industrial|Alternative|Ska|Death Metal|Pranks|Soundtrack|Euro-Techno|Ambient|'
          'Trip-Hop|Vocal|Jazz+Funk|Fusion|Trance|Classical|Instrumental|Acid|House|Game|Sound Clip|Gospel|Noise|'
          'Alternative Rock|Bass|Soul|Punk|Space|Meditative|Instrumental Pop|Instrumental Rock|Ethnic|Gothic|'
          'Darkwave|Techno-Industrial|Electronic|Pop-Folk|Eurodance|Dream|Southern Rock|Comedy|Cult|Gangsta|'
          'Top 40|Christian Rap|Pop/Funk|Jungle|Native American|Cabaret|New Wave|Psychedelic|Rave|Showtunes|'
          'Trailer|Lo-Fi|Tribal|Acid Punk|Acid Jazz|Polka|Retro|Musical|Rock & Roll|Hard Rock').split('|')
GENRES[0:1] = ['Blues', 'Classic Rock']
ID3_FRAMES = {'TIT2': 'title', 'TT2': 'title', 'TPE1': 'artist', 'TP1': 'artist', 'TPE2': 'artist',
              'TALB': 'album', 'TAL': 'album', 'TCON': 'genre', 'TCO': 'genre', 'TYER': 'year', 'TDRC': 'year',
              'TYE': 'year', 'COMM': 'comment', 'COM': 'comment', 'TSSE': 'software', 'TENC': 'software',
              'TBPM': 'bpm', 'TKEY': 'key', 'TCOM': 'author', 'TIT1': 'subject', 'TIT3': 'caption'}


def _id3(head, tail):
    info = {}
    if head[:3] == b'ID3':
        version = head[3]
        size = (head[6] << 21) | (head[7] << 14) | (head[8] << 7) | head[9]
        data = head[10:10 + size]
        at = 0
        wide = version >= 3
        while at + (10 if wide else 6) <= len(data):
            if wide:
                fid = data[at:at + 4].decode('latin-1')
                n = struct.unpack_from('>I', data, at + 4)[0]
                if version == 4:
                    n = (data[at + 4] << 21) | (data[at + 5] << 14) | (data[at + 6] << 7) | data[at + 7]
                body = data[at + 10:at + 10 + n]
                at += 10 + n
            else:
                fid = data[at:at + 3].decode('latin-1')
                n = int.from_bytes(data[at + 3:at + 6], 'big')
                body = data[at + 6:at + 6 + n]
                at += 6 + n
            if not fid.strip('\x00') or n <= 0:
                break
            name = ID3_FRAMES.get(fid)
            if not name or not body:
                continue
            enc = body[0]
            raw = body[4:] if fid in ('COMM', 'COM') else body[1:]
            text = decode_id3(raw, enc)
            if fid in ('COMM', 'COM'):
                text = text.split('\x00', 1)[-1]
            text = text.replace('\x00', ' / ').strip(' /')
            if name == 'genre':
                text = re.sub(r'\((\d+)\)', lambda m: GENRES[int(m[1])] if int(m[1]) < len(GENRES) else '', text)
                if text.isdigit() and int(text) < len(GENRES):
                    text = GENRES[int(text)]
            if name in ('bpm', 'year'):
                m = re.match(r'\d+', text)
                if m:
                    info.setdefault(name, int(m[0]))
                continue
            if text and not (name == 'comment' and re.fullmatch(r'[0-9A-F ]{20,}', text)):  # iTunes junk
                info.setdefault(name, text)
    if tail[-128:-125] == b'TAG' and not info.get('title'):
        t = tail[-128:]
        for name, (a, b) in (('title', (3, 33)), ('artist', (33, 63)), ('album', (63, 93))):
            v = t[a:b].split(b'\x00')[0].decode('latin-1').strip()
            if v:
                info.setdefault(name, v)
        if t[127] < len(GENRES):
            info.setdefault('genre', GENRES[t[127]])
    return info


def decode_id3(raw, enc):
    try:
        if enc == 1:
            return raw.decode('utf-16')
        if enc == 2:
            return raw.decode('utf-16-be')
        if enc == 3:
            return raw.decode('utf-8')
        return raw.decode('latin-1')
    except UnicodeDecodeError:
        return raw.decode('latin-1', 'replace')


# ---------------------------------------------------------------- FLAC / Ogg / Opus (Vorbis comments)

VORBIS = {'title': 'title', 'artist': 'artist', 'albumartist': 'artist', 'album': 'album', 'genre': 'genre',
          'date': 'year', 'comment': 'comment', 'description': 'caption', 'encoder': 'software',
          'bpm': 'bpm', 'composer': 'author'}


def _comments(data, at):
    info = {}
    n = struct.unpack_from('<I', data, at)[0]
    at += 4 + n
    count = struct.unpack_from('<I', data, at)[0]
    at += 4
    for _ in range(min(count, 500)):
        n = struct.unpack_from('<I', data, at)[0]
        key, _, value = data[at + 4:at + 4 + n].decode('utf-8', 'replace').partition('=')
        at += 4 + n
        name = VORBIS.get(key.lower())
        if name in ('year', 'bpm'):
            m = re.match(r'\d+', value)
            if m:
                info.setdefault(name, int(m[0]))
        elif name and value:
            info.setdefault(name, value)
    return info


def _vorbis_block(data):
    info = {}
    at = 4
    while at + 4 <= len(data):
        last, kind = data[at] & 0x80, data[at] & 0x7f
        n = int.from_bytes(data[at + 1:at + 4], 'big')
        if kind == 0 and n >= 18:
            bits = int.from_bytes(data[at + 14:at + 22], 'big')
            rate, samples = bits >> 44, bits & ((1 << 36) - 1)
            if rate:
                info['duration'] = samples / rate
        elif kind == 4:
            info.update(_comments(data, at + 4))
        at += 4 + n
        if last:
            break
    return info


def _ogg(data):
    for marker, skip in ((b'\x03vorbis', 7), (b'OpusTags', 8)):
        at = data.find(marker)
        if at != -1:
            return _comments(data, at + skip)
    return {}


# ---------------------------------------------------------------- WAV / AIFF

RIFF_INFO = {b'INAM': 'title', b'IART': 'artist', b'IPRD': 'album', b'IGNR': 'genre', b'ICMT': 'comment',
             b'ISFT': 'software', b'ICRD': 'year', b'IKEY': 'keywords', b'ISBJ': 'subject'}


def _riff(data):
    info = {}
    at = 12
    while at + 8 <= len(data):
        typ, n = struct.unpack_from('<4sI', data, at)
        body = data[at + 8:at + 8 + n]
        if typ == b'LIST' and body[:4] == b'INFO':
            p = 4
            while p + 8 <= len(body):
                t2, m = struct.unpack_from('<4sI', body, p)
                name = RIFF_INFO.get(t2)
                text = body[p + 8:p + 8 + m].split(b'\x00')[0].decode('utf-8', 'replace').strip()
                if name and text:
                    if name == 'year':
                        y = re.match(r'\d{4}', text)
                        if y:
                            info['year'] = int(y[0])
                    elif name == 'keywords':
                        info['keywords'] = [k.strip() for k in re.split(r'[;,]', text) if k.strip()]
                    else:
                        info.setdefault(name, text)
                p += 8 + m + (m & 1)
        elif typ == b'bext' and len(body) >= 346:
            description = body[:256].split(b'\x00')[0].decode('latin-1').strip()
            originator = body[256:288].split(b'\x00')[0].decode('latin-1').strip()
            if description:
                info.setdefault('caption', description)
            if originator:
                info.setdefault('software', originator)
        elif typ == b'fmt ' and n >= 16:
            rate, per_second = struct.unpack_from('<II', body, 4)
            info['_rate'] = per_second
        elif typ == b'data' and info.get('_rate'):
            info['duration'] = n / info['_rate']
            if at + 8 + n > len(data):
                break
        at += 8 + n + (n & 1)
    info.pop('_rate', None)
    return info


def _aiff(data):
    info = {}
    names = {b'NAME': 'title', b'AUTH': 'artist', b'ANNO': 'comment', b'(c) ': 'author'}
    for typ, s, e in _boxes_big(data, 12):
        if typ in names:
            info.setdefault(names[typ], data[s:e].decode('latin-1', 'replace').strip('\x00 '))
    return info


def _boxes_big(data, at):
    while at + 8 <= len(data):
        typ, n = struct.unpack_from('>4sI', data, at)
        yield typ, at + 8, min(at + 8 + n, len(data))
        at += 8 + n + (n & 1)


# ---------------------------------------------------------------- PDF

PDF_KEYS = {'Title': 'title', 'Author': 'author', 'Subject': 'subject', 'Keywords': 'keywords',
            'Creator': 'creator', 'Producer': 'producer'}


def _pdf(data):
    info = {}
    for key, name in PDF_KEYS.items():
        for m in re.finditer(rb'/' + key.encode() + rb'\s*(\((?:\\.|[^\\)])*\)|<[0-9A-Fa-f\s]*>)', data):
            text = pdf_string(m[1])
            if text.strip():
                if name == 'keywords':
                    info['keywords'] = [k.strip() for k in re.split(r'[;,]', text) if k.strip()]
                else:
                    info[name] = text.strip()
                break
    pages = re.findall(rb'/Type\s*/Pages\b[^>]*?/Count\s+(\d+)', data)
    if pages:
        info['pages'] = max(int(p) for p in pages)
    m = re.search(rb'/CreationDate\s*\(D:(\d{8})', data)
    if m:
        d = m[1].decode()
        info['made_at'] = when(f'{d[:4]}:{d[4:6]}:{d[6:8]}')
    info.pop('made_at', None)  # when a PDF was made says little about what's in it
    return info


def pdf_string(raw):
    if raw[:1] == b'<':
        hexed = re.sub(rb'\s', b'', raw[1:-1])
        try:
            b = bytes.fromhex(hexed.decode())
        except ValueError:
            return ''
    else:
        b = raw[1:-1]
        b = re.sub(rb'\\([nrtbf()\\])', lambda m: {b'n': b'\n', b'r': b'\r', b't': b'\t', b'b': b'',
                                                   b'f': b''}.get(m[1], m[1]), b)
        b = re.sub(rb'\\([0-7]{1,3})', lambda m: bytes([int(m[1], 8) & 0xff]), b)
    if b[:2] == b'\xfe\xff':
        return b[2:].decode('utf-16-be', 'replace')
    return b.decode('latin-1')


# ---------------------------------------------------------------- Office / OpenDocument / ePub

def _office(path):
    info = {}
    try:
        with zipfile.ZipFile(path) as z:
            names = set(z.namelist())
            for part in ('docProps/core.xml', 'meta.xml', 'OEBPS/content.opf', 'content.opf'):
                if part in names:
                    xml = z.read(part)[:200000].decode('utf-8', 'replace')
                    for tag, name in (('dc:title', 'title'), ('dc:creator', 'author'), ('dc:subject', 'subject'),
                                      ('cp:keywords', 'keywords'), ('meta:keyword', 'keywords'),
                                      ('dc:description', 'caption'), ('meta:generator', 'software')):
                        for m in re.finditer(r'<%s\b[^>]*>(.*?)</%s>' % (tag, tag), xml, re.S):
                            text = unescape(m[1])
                            if not text:
                                continue
                            if name == 'keywords':
                                info.setdefault('keywords', []).extend(
                                    k.strip() for k in re.split(r'[;,]', text) if k.strip())
                            else:
                                info.setdefault(name, text)
            if 'docProps/app.xml' in names:
                xml = z.read('docProps/app.xml')[:100000].decode('utf-8', 'replace')
                for tag, name in (('Application', 'software'), ('Template', 'template'), ('Pages', 'pages'),
                                  ('Words', 'words'), ('Slides', 'pages')):
                    m = re.search(r'<%s>(.*?)</%s>' % (tag, tag), xml, re.S)
                    if m and m[1].strip():
                        v = unescape(m[1])
                        if name in ('pages', 'words'):
                            if v.isdigit():
                                info[name] = int(v)
                        elif name == 'template' and v.lower() in ('normal.dotm', 'normal', 'normal.dot'):
                            continue
                        else:
                            info.setdefault(name, v)
    except (zipfile.BadZipFile, KeyError, OSError):
        pass
    return info


# ---------------------------------------------------------------- words for sorting and search

def words(media):
    """The details that are worth reading as words (not numbers or gear)."""
    if not media:
        return ''
    parts = [media.get(k) for k in ('title', 'caption', 'album', 'genre', 'subject', 'location', 'template')]
    parts += media.get('keywords') or []
    return ' '.join(p for p in parts if isinstance(p, str))


def now():
    return int(time.time())


# ---------------------------------------------------------------- files uploaded before this existed

def start_backfill():
    """Read the details of files uploaded before Mutt read them, slowly, in the background."""
    import threading
    threading.Thread(target=_backfill, name='media-backfill', daemon=True).start()


def _backfill():
    import json
    import os
    from . import db
    try:
        conn = db.connect()
        rows = conn.execute(
            "SELECT id, user_id, file_key, ext, meta FROM blocks WHERE file_key IS NOT NULL "
            "AND kind IN ('image', 'video', 'audio', 'pdf', 'doc') AND json_extract(meta, '$.media') IS NULL "
            "ORDER BY created_at DESC LIMIT 20000").fetchall()
        for row in rows:
            path = os.path.join(db.user_files_dir(row['user_id']), row['file_key'])
            found = read(path, row['ext'] or '') if os.path.exists(path) else {}
            current = conn.execute('SELECT meta FROM blocks WHERE id = ?', (row['id'],)).fetchone()
            if current is None:
                continue
            meta = json.loads(current['meta'] or '{}')
            meta['media'] = found  # {} means "looked, nothing there"
            conn.execute('UPDATE blocks SET meta = ? WHERE id = ?', (json.dumps(meta, ensure_ascii=False), row['id']))
            time.sleep(0.01)
        conn.close()
    except Exception:  # never take the server down over this
        import traceback
        traceback.print_exc()
