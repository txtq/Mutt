# Makes two small EPUBs and a book-like PDF for tests/books.sh (and for trying the reader by hand).
# Usage: python3 tests/make_books.py <folder>
import random, zipfile, zlib, struct, sys, os
out = sys.argv[1]
random.seed(4)
WORDS = ("the lighthouse keeper walked along the harbour wall and counted boats as evening came down over the water "
         "she remembered her mother's kitchen the smell of bread and the radio murmuring about storms far to the north "
         "every winter the village grew quieter until only the gulls and the bell of the church spoke at all "
         "he wrote letters he never sent folding them into the drawer beneath the window where the light was best").split()
def sentence():
    n = random.randint(8, 22)
    s = ' '.join(random.choice(WORDS) for _ in range(n))
    return s[0].upper() + s[1:] + random.choice(['.', '.', '.', '?', '!'])
def para():
    return ' '.join(sentence() for _ in range(random.randint(3, 7)))

# a PNG cover
def png(w, h, color):
    raw = b''.join(b'\x00' + bytes(color) * w for _ in range(h))
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b'')

def epub(path, title, author, chapters, cover_color):
    with zipfile.ZipFile(path, 'w') as z:
        z.writestr(zipfile.ZipInfo('mimetype'), 'application/epub+zip')
        z.writestr('META-INF/container.xml', '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>')
        items = ['<item id="cover" href="images/cover.png" media-type="image/png" properties="cover-image"/>',
                 '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
                 '<item id="coverpage" href="text/cover.xhtml" media-type="application/xhtml+xml"/>']
        spine = ['<itemref idref="coverpage"/>']
        navs = []
        z.writestr('OEBPS/images/cover.png', png(400, 600, cover_color))
        z.writestr('OEBPS/text/cover.xhtml', '<?xml version="1.0" encoding="utf-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Cover</title></head><body><div><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 400 600"><image xlink:href="../images/cover.png" width="400" height="600"/></svg></div></body></html>')
        for i in range(chapters):
            ps = ''.join(f'<p>{para()}</p>' for _ in range(random.randint(14, 28)))
            note = '<p>See the <a href="ch1.xhtml#start">first chapter</a> again.<script>alert(1)</script></p>' if i == 2 else ''
            body = f'<h1 id="start">Chapter {i+1}</h1><h2>The {random.choice(["harbour","winter","letters","storm"])}</h2>{ps}{note}'
            z.writestr(f'OEBPS/text/ch{i+1}.xhtml', f'<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Chapter {i+1}</title><style>p{{color:red}}</style></head><body onload="alert(2)">{body}</body></html>')
            items.append(f'<item id="c{i+1}" href="text/ch{i+1}.xhtml" media-type="application/xhtml+xml"/>')
            spine.append(f'<itemref idref="c{i+1}"/>')
            navs.append(f'<li><a href="text/ch{i+1}.xhtml">Chapter {i+1}</a></li>')
        z.writestr('OEBPS/nav.xhtml', '<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol>' + ''.join(navs) + '</ol></nav></body></html>')
        z.writestr('OEBPS/content.opf', f'<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">x</dc:identifier><dc:title>{title}</dc:title><dc:creator>{author}</dc:creator><dc:language>en</dc:language></metadata><manifest>{"".join(items)}</manifest><spine>{"".join(spine)}</spine></package>')

epub(os.path.join(out, 'The Harbour Light.epub'), 'The Harbour Light', 'Mara Ellison', 8, (40, 70, 110))
epub(os.path.join(out, 'Winter Letters.epub'), 'Winter Letters', 'Tom Arden', 5, (120, 50, 40))

# A book-like PDF: 60 pages, running head, page numbers, chapters at 20pt.
def pdf(path, title, author, pages=60):
    objs = []
    def add(s): objs.append(s); return len(objs)
    font = add(b'<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>')
    bold = add(b'<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold >>')
    kids = []
    pages_id_placeholder = len(objs) + 1
    add(b'')  # pages, filled later
    ch = 0
    for p in range(pages):
        lines = []
        def text(x, y, size, s, f='F1'):
            s = s.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')
            lines.append(f'BT /{f} {size} Tf {x} {y} Td ({s}) Tj ET')
        text(240, 760, 9, title.upper())
        text(300, 40, 9, str(p + 1))
        y = 720
        if p == 0:
            text(160, 560, 28, title, 'F2'); text(220, 520, 14, author)
            text(72, 120, 9, 'Copyright (c) 2021 ' + author + '. All rights reserved. ISBN 978-0-00-000000-0')
        else:
            if p % 8 == 1:
                ch += 1
                text(72, y - 20, 20, f'Chapter {ch}', 'F2'); y -= 70
            while y > 80:
                words = para().split()
                first = True
                line = ''
                for w in words:
                    if len(line) + len(w) + 1 > 88:
                        text(72 + (18 if first else 0), y, 11, line.strip()); y -= 14; first = False; line = ''
                        if y < 80: break
                    line += ' ' + w
                if y >= 80 and line.strip():
                    text(72 + (18 if first else 0), y, 11, line.strip()); y -= 14
                y -= 4
        stream = '\n'.join(lines).encode('latin-1')
        c = add(b'<< /Length %d >>\nstream\n' % len(stream) + stream + b'\nendstream')
        pg = add(b'<< /Type /Page /Parent %d 0 R /MediaBox [0 0 612 792] /Contents %d 0 R /Resources << /Font << /F1 %d 0 R /F2 %d 0 R >> >> >>' % (pages_id_placeholder, c, font, bold))
        kids.append(pg)
    objs[pages_id_placeholder - 1] = b'<< /Type /Pages /Kids [' + b' '.join(b'%d 0 R' % k for k in kids) + b'] /Count %d >>' % len(kids)
    info = add(b'<< /Title (%s) /Author (%s) >>' % (title.encode(), author.encode()))
    catalog = add(b'<< /Type /Catalog /Pages %d 0 R >>' % pages_id_placeholder)
    data = b'%PDF-1.4\n'
    offsets = []
    for i, o in enumerate(objs):
        offsets.append(len(data))
        data += b'%d 0 obj\n' % (i + 1) + o + b'\nendobj\n'
    xref = len(data)
    data += b'xref\n0 %d\n0000000000 65535 f \n' % (len(objs) + 1) + b''.join(b'%010d 00000 n \n' % o for o in offsets)
    data += b'trailer\n<< /Size %d /Root %d 0 R /Info %d 0 R >>\nstartxref\n%d\n%%%%EOF\n' % (len(objs) + 1, catalog, info, xref)
    open(path, 'wb').write(data)

pdf(os.path.join(out, 'The Quiet Coast.pdf'), 'The Quiet Coast', 'June Alder')
