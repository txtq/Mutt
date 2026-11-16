"""Taking where a photo or video was made out of the file itself.

Phones write the exact spot into every photo and video they make. Mutt reads
it once at upload (`media.read`, kept in meta.media and shown to the owner
only) and then blanks it in the stored file, so a download, a saved copy or
an export never carries it.

Nothing is decoded and nothing moves: the bytes that say where are
overwritten in place, so the file keeps its size and every offset inside it
still points where it did. What is blanked:

- the GPS part of EXIF (JPEG, HEIC/AVIF, PNG, WebP, TIFF and camera raws),
- place fields in XMP (any GPS / latitude / longitude / altitude, and the
  city, state, country and location names),
- place names in a JPEG's IPTC block,
- a video's or recording's location (QuickTime / MP4: the ©xyz and loci
  boxes, and Apple's com.apple.quicktime.location.* entries).
"""
import os
import re
import struct
import threading
import time
import zlib

WHOLE = 64 << 20   # files up to this size are read whole (uploads are capped well below)
BOX_LIMIT = 64 << 20
TIFF_MAGIC = (b'II*\x00', b'MM\x00*')
GPS_IFD = 0x8825
TYPE_SIZES = {1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8}

# ---------------------------------------------------------------- files and bytes


def forget_place(path):
    """Blank the place in a stored file. Returns True if anything changed."""
    try:
        size = os.path.getsize(path)
        with open(path, 'r+b') as f:
            if size <= WHOLE:
                buf = bytearray(f.read())
                if not forget_place_bytes(buf):
                    return False
                f.seek(0)
                f.write(buf)
                return True
            return _forget_big(f, size)
    except OSError:
        return False


def forget_place_bytes(buf):
    """Blank the place in a whole file held in a bytearray. Returns True if it changed."""
    try:
        changed = False
        if buf[4:8] == b'ftyp':
            changed |= _bmff(buf, 0, len(buf))
        for base in _tiff_starts(buf):
            changed |= _blank_gps(buf, base)
        changed |= _xmp(buf)
        if buf[:2] == b'\xff\xd8':
            changed |= _iptc(buf)
        if changed and buf[:8] == b'\x89PNG\r\n\x1a\n':
            _png_crcs(buf)
        return changed
    except Exception:  # an unusual file is left as it is rather than broken
        return False


def _forget_big(f, size):
    """A file too big to read whole (only older uploads): the boxes that hold a
    video's details, or the first few megabytes of anything else."""
    f.seek(0)
    head = f.read(16)
    changed = False
    if head[4:8] == b'ftyp':
        at = 0
        for _ in range(64):
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
            if typ in (b'moov', b'meta', b'udta') and box <= BOX_LIMIT:
                f.seek(at)
                buf = bytearray(f.read(box))
                if _bmff(buf, 0, len(buf)) | _xmp(buf):
                    f.seek(at)
                    f.write(buf)
                    changed = True
            at += box
    f.seek(0)
    buf = bytearray(f.read(4 << 20))
    if forget_place_bytes(buf):
        f.seek(0)
        f.write(buf)
        changed = True
    return changed


# ---------------------------------------------------------------- EXIF

def _tiff_starts(buf):
    """Where each EXIF block (a little TIFF) starts."""
    starts = []
    if bytes(buf[:4]) in TIFF_MAGIC:
        starts.append(0)
    at = buf.find(b'Exif\x00\x00')
    while at != -1:
        if bytes(buf[at + 6:at + 10]) in TIFF_MAGIC:
            starts.append(at + 6)
        at = buf.find(b'Exif\x00\x00', at + 6)
    if buf[:4] == b'RIFF' and buf[8:12] == b'WEBP':
        for typ, s, e in _riff_chunks(buf):
            if typ == b'EXIF' and bytes(buf[s:s + 4]) in TIFF_MAGIC:
                starts.append(s)
    if buf[:8] == b'\x89PNG\r\n\x1a\n':
        for typ, s, e in _png_chunks(buf):
            if typ == b'eXIf' and bytes(buf[s:s + 4]) in TIFF_MAGIC:
                starts.append(s)
    return sorted(set(starts))


def _blank_gps(buf, base):
    """Empty the GPS directory of the EXIF block at `base`: its entries and
    the values they point to are zeroed and it says it has none."""
    order = '<' if buf[base:base + 2] == b'II' else '>'
    end = len(buf)

    def u16(o):
        return struct.unpack_from(order + 'H', buf, base + o)[0] if base + o + 2 <= end else 0

    def u32(o):
        return struct.unpack_from(order + 'I', buf, base + o)[0] if base + o + 4 <= end else 0

    ifd0 = u32(4)
    if not ifd0:
        return False
    gps = 0
    for i in range(min(u16(ifd0), 400)):
        at = ifd0 + 2 + i * 12
        if u16(at) == GPS_IFD:
            gps = u32(at + 8)
            break
    if not gps or base + gps + 2 > end:
        return False
    count = min(u16(gps), 200)
    spans = []
    for i in range(count):
        at = gps + 2 + i * 12
        typ, n = u16(at + 2), u32(at + 4)
        size = TYPE_SIZES.get(typ, 1) * n
        if 4 < size <= 1 << 16:
            spans.append((u32(at + 8), size))
    spans.append((gps, 2 + count * 12 + 4))
    changed = False
    for off, size in spans:
        s, e = base + off, min(base + off + size, end)
        if s < e and any(buf[s:e]):
            buf[s:e] = bytes(e - s)
            changed = True
    return changed


# ---------------------------------------------------------------- XMP

_PLACE_NAMES = (rb'[\w-]+:\w*(?:GPS|Gps|Latitude|Longitude|Altitude)\w*'
                rb'|Iptc4xmpCore:(?:Location|CountryCode)'
                rb'|photoshop:(?:City|State|Country)'
                rb'|Iptc4xmpExt:(?:LocationCreated|LocationShown|City|CountryName|CountryCode|ProvinceState'
                rb'|Sublocation|WorldRegion)')
_XMP_ATTR = re.compile(rb'(?<![\w:-])(?:' + _PLACE_NAMES + rb')=(["\'])(.*?)\1', re.S)
_XMP_ELEM = re.compile(rb'<(' + _PLACE_NAMES + rb')\b[^>]*?(?<!/)>(.*?)</\1\s*>', re.S)


def _xmp_packets(buf):
    for opener, closer in ((b'<x:xmpmeta', b'</x:xmpmeta>'), (b'<rdf:RDF', b'</rdf:RDF>')):
        at = buf.find(opener)
        found = False
        while at != -1:
            stop = buf.find(closer, at)
            if stop == -1:
                break
            found = True
            yield at, stop + len(closer)
            at = buf.find(opener, stop)
        if found:
            return


def _xmp(buf):
    changed = False
    for s, e in list(_xmp_packets(buf)):
        packet = bytes(buf[s:e])
        spans = [m.span(2) for m in _XMP_ATTR.finditer(packet)] + [m.span(2) for m in _XMP_ELEM.finditer(packet)]
        for a, b in spans:
            if packet[a:b].strip():
                buf[s + a:s + b] = b' ' * (b - a)
                changed = True
    return changed


# ---------------------------------------------------------------- IPTC (JPEG)

IPTC_PLACES = {90, 92, 95, 100, 101}  # city, sublocation, state, country code, country


def _iptc(buf):
    changed = False
    at = 2
    while at + 4 <= len(buf) and buf[at] == 0xFF:
        marker = buf[at + 1]
        if marker == 0xDA:  # the picture itself starts here
            break
        length = struct.unpack_from('>H', buf, at + 2)[0]
        s, e = at + 4, min(at + 2 + length, len(buf))
        if marker == 0xED:
            p = buf.find(b'\x1c\x02', s, e)
            while p != -1 and p + 5 <= e:
                dataset, size = buf[p + 2], struct.unpack_from('>H', buf, p + 3)[0]
                if dataset in IPTC_PLACES and p + 5 + size <= e and buf[p + 5:p + 5 + size].strip():
                    buf[p + 5:p + 5 + size] = b' ' * size
                    changed = True
                p = buf.find(b'\x1c\x02', p + 5 + (size if size < 0x8000 else 0), e)
        at += 2 + length
    return changed


# ---------------------------------------------------------------- QuickTime / MP4 / HEIC boxes

CONTAINERS = {b'moov', b'trak', b'mdia', b'minf', b'udta', b'edts'}


def _boxes(buf, start, end):
    at = start
    while at + 8 <= end:
        size, typ = struct.unpack_from('>I4s', buf, at)
        head = 8
        if size == 1 and at + 16 <= end:
            size = struct.unpack_from('>Q', buf, at + 8)[0]
            head = 16
        elif size == 0:
            size = end - at
        if size < head:
            break
        yield typ, at, at + head, min(at + size, end)
        at += size


def _bmff(buf, start, end, depth=0):
    changed = False
    if depth > 8:
        return False
    for typ, box, s, e in _boxes(buf, start, end):
        if typ in CONTAINERS:
            changed |= _bmff(buf, s, e, depth + 1)
        elif typ == b'meta':
            first = s if buf[s + 4:s + 8] == b'hdlr' else s + 4  # QuickTime's meta has no version
            changed |= _meta(buf, first, e)
        elif typ == b'\xa9xyz' and e - s > 4 and buf[s + 4:e].strip(b' \x00'):
            buf[s + 4:e] = b' ' * (e - s - 4)
            changed = True
        elif typ == b'loci':
            buf[box + 4:box + 8] = b'free'
            buf[s:e] = bytes(e - s)
            changed = True
    return changed


def _meta(buf, start, end):
    changed = False
    keys = []
    for typ, box, s, e in _boxes(buf, start, end):
        if typ == b'keys' and s + 8 <= e:
            count = struct.unpack_from('>I', buf, s + 4)[0]
            p = s + 8
            for _ in range(min(count, 400)):
                if p + 8 > e:
                    break
                n = struct.unpack_from('>I', buf, p)[0]
                if n < 8:
                    break
                keys.append(bytes(buf[p + 8:p + n]).decode('utf-8', 'replace'))
                p += n
        elif typ == b'ilst':
            for item, _, a, b in _boxes(buf, s, e):
                name = ''
                index = struct.unpack('>I', item)[0]
                if 1 <= index <= len(keys):
                    name = keys[index - 1]
                if item != b'\xa9xyz' and not name.startswith('com.apple.quicktime.location'):
                    continue
                for t, _, c, d in _boxes(buf, a, b):
                    if t == b'data' and d - c > 8 and buf[c + 8:d].strip(b' \x00'):
                        buf[c + 8:d] = b' ' * (d - c - 8)
                        changed = True
        elif typ in CONTAINERS:
            changed |= _bmff(buf, s, e, 1)
    return changed


# ---------------------------------------------------------------- chunks

def _riff_chunks(buf):
    at = 12
    while at + 8 <= len(buf):
        typ, size = bytes(buf[at:at + 4]), struct.unpack_from('<I', buf, at + 4)[0]
        yield typ, at + 8, min(at + 8 + size, len(buf))
        at += 8 + size + (size & 1)


def _png_chunks(buf):
    at = 8
    while at + 12 <= len(buf):
        size, typ = struct.unpack_from('>I4s', buf, at)
        if at + 12 + size > len(buf):
            break
        yield typ, at + 8, at + 8 + size
        at += 12 + size


def _png_crcs(buf):
    """A PNG checks every chunk; the ones that were blanked get their check redone."""
    for typ, s, e in list(_png_chunks(buf)):
        crc = zlib.crc32(bytes(buf[s - 4:e])) & 0xffffffff
        if struct.unpack_from('>I', buf, e)[0] != crc:
            struct.pack_into('>I', buf, e, crc)


# ---------------------------------------------------------------- files stored before this existed

KINDS = ('image', 'video', 'audio')


def start_sweep():
    """Blank the place in files stored before Mutt did it at upload, slowly, in the background."""
    threading.Thread(target=_sweep, name='place-sweep', daemon=True).start()


def _sweep():
    import json
    from . import db
    try:
        conn = db.connect()
        rows = conn.execute(
            "SELECT id, user_id, file_key FROM blocks WHERE file_key IS NOT NULL AND kind IN ('image', 'video', 'audio') "
            "AND json_extract(meta, '$.unplaced') IS NULL "
            # Not before media.read has kept the place for its owner (its backfill runs alongside).
            "AND json_extract(meta, '$.media') IS NOT NULL ORDER BY created_at DESC").fetchall()
        for row in rows:
            path = os.path.join(db.user_files_dir(row['user_id']), row['file_key'])
            if os.path.exists(path):
                forget_place(path)
            current = conn.execute('SELECT meta FROM blocks WHERE id = ?', (row['id'],)).fetchone()
            if current is not None:
                meta = json.loads(current['meta'] or '{}')
                meta['unplaced'] = 1
                conn.execute('UPDATE blocks SET meta = ? WHERE id = ?', (json.dumps(meta, ensure_ascii=False), row['id']))
            time.sleep(0.01)
        for row in conn.execute('SELECT id FROM doc_images WHERE unplaced = 0').fetchall():
            image = conn.execute('SELECT data FROM doc_images WHERE id = ?', (row['id'],)).fetchone()
            buf = bytearray(image['data'] or b'')
            if forget_place_bytes(buf):
                conn.execute('UPDATE doc_images SET data = ?, unplaced = 1 WHERE id = ?', (bytes(buf), row['id']))
            else:
                conn.execute('UPDATE doc_images SET unplaced = 1 WHERE id = ?', (row['id'],))
            time.sleep(0.005)
        conn.close()
    except Exception:  # never take the server down over this
        import traceback
        traceback.print_exc()
