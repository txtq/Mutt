# Makes a small Word file, an OpenDocument file and an RTF for tests/docs.sh
# (making Mutt documents from them), and for trying it by hand.
# Usage: python3 tests/make_docs.py <folder>
import os, struct, sys, zipfile, zlib

out = sys.argv[1]
os.makedirs(out, exist_ok=True)


def png(w, h, color):
    raw = b''.join(b'\x00' + bytes(color) * w for _ in range(h))
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b''))


W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' \
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' \
    'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' \
    'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"'


def para(text, style=None, num=None, bold=False):
    ppr = ''
    if style or num:
        ppr = '<w:pPr>' + (f'<w:pStyle w:val="{style}"/>' if style else '') + \
              (f'<w:numPr><w:ilvl w:val="0"/><w:numId w:val="{num}"/></w:numPr>' if num else '') + '</w:pPr>'
    rpr = '<w:rPr><w:b/></w:rPr>' if bold else ''
    return f'<w:p>{ppr}<w:r>{rpr}<w:t xml:space="preserve">{text}</w:t></w:r></w:p>'


body = ''.join([
    para('Harbour notes', 'Title'),
    para('The first winter', 'Heading1'),
    '<w:p><w:r><w:t xml:space="preserve">The keeper walked the wall at </w:t></w:r>'
    '<w:r><w:rPr><w:b/></w:rPr><w:t>dusk</w:t></w:r><w:r><w:t xml:space="preserve"> and </w:t></w:r>'
    '<w:r><w:rPr><w:i/></w:rPr><w:t>counted</w:t></w:r><w:r><w:t xml:space="preserve"> the boats &amp; gulls.</w:t></w:r></w:p>',
    para('Rope', num=1), para('Lamp oil', num=1), para('Bread', num=1),
    para('Wind first', num=2), para('Then tide', num=2),
    '<w:p><w:r><w:drawing><wp:inline><a:graphic><a:graphicData><a:blip r:embed="rId9"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>',
    '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Boat</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Count</w:t></w:r></w:p></w:tc></w:tr>'
    '<w:tr><w:tc><w:p><w:r><w:t>Skiff</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>4</w:t></w:r></w:p></w:tc></w:tr></w:tbl>',
    para('&lt;script&gt;alert(1)&lt;/script&gt; stays words'),
])
numbering = (f'<w:numbering {W}>'
             '<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum>'
             '<w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum>'
             '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>'
             '</w:numbering>')
styles = (f'<w:styles {W}><w:style w:styleId="Title"><w:name w:val="Title"/></w:style>'
          '<w:style w:styleId="Heading1"><w:name w:val="heading 1"/></w:style></w:styles>')
with zipfile.ZipFile(os.path.join(out, 'harbour.docx'), 'w') as z:
    z.writestr('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>')
    z.writestr('word/document.xml', f'<?xml version="1.0"?><w:document {W}><w:body>{body}</w:body></w:document>')
    z.writestr('word/numbering.xml', numbering)
    z.writestr('word/styles.xml', styles)
    z.writestr('word/_rels/document.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
               '<Relationship Id="rId9" Type="image" Target="media/image1.png"/></Relationships>')
    z.writestr('word/media/image1.png', png(8, 6, (200, 120, 40)))

odt = ('<?xml version="1.0"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" '
       'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" '
       'xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0">'
       '<office:automatic-styles><style:style style:name="T1" style:family="text"><style:text-properties fo:font-weight="bold"/></style:style>'
       '<text:list-style style:name="L1"><text:list-level-style-number text:level="1"/></text:list-style></office:automatic-styles>'
       '<office:body><office:text><text:h text:outline-level="1">Field journal</text:h>'
       '<text:p>Rain at noon, <text:span text:style-name="T1">heavy</text:span> by four.</text:p>'
       '<text:list text:style-name="L1"><text:list-item><text:p>Pack the tent</text:p></text:list-item>'
       '<text:list-item><text:p>Walk out</text:p></text:list-item></text:list>'
       '</office:text></office:body></office:document-content>')
with zipfile.ZipFile(os.path.join(out, 'journal.odt'), 'w') as z:
    z.writestr('mimetype', 'application/vnd.oasis.opendocument.text')
    z.writestr('content.xml', odt)

with open(os.path.join(out, 'letter.rtf'), 'w') as f:
    f.write(r'{\rtf1\ansi{\fonttbl{\f0 Times;}}{\*\generator Test{\*\nested x}}\f0 Dear Sam,\par '
            r'Thank you for the {\b map} and the caf\'e9 tip.\par\par Yours,\line Ana\par}')
