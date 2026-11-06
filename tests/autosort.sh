#!/bin/bash
# Autosort: typed notes, text files, Word, PDF and RTF uploads, links, stars, photos and songs
# find the planet that fits, or a new planet named after what they're about.
# Each line prints: what was added -> the planet (and "new" if one was made).
SP="$1"; B=localhost:8099
J=(-H Content-Type:application/json -H X-Mutt:1); A=(-b "$SP/a.txt" -c "$SP/a.txt")
rm -f "$SP/a.txt"
j() { python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"; }
curl -s "${A[@]}" "${J[@]}" -X POST $B/api/auth/signup -d '{"username":"sorter","pin":"4821"}' > /dev/null
planet() { curl -s "${A[@]}" "${J[@]}" -X POST $B/api/drawers -d "{\"title\":\"$1\"}" | j "d['drawer']['id']"; }
put() { curl -s "${A[@]}" "${J[@]}" -X POST $B/api/blocks -d "$(python3 -c 'import json,sys; print(json.dumps({"content": sys.argv[1], "drawer": sys.argv[2]}))' "$2" "$1")" > /dev/null; }
R=$(planet Recipes); T=$(planet "Japan trip"); W=$(planet Work); G=$(planet Garden)
put $R 'Lemon drizzle cake: 225g butter, 225g sugar, 4 eggs, 275g flour. Bake at 180C for 45 minutes.'
put $T 'Kyoto temples to see: Fushimi Inari, Kinkaku-ji'
put $W 'Q3 roadmap meeting: ship onboarding v2, hire two engineers, OKRs with Sam'
put $G 'Tomatoes need staking by June. Feed weekly with seaweed.'

shown='(d["sortedInto"]["planet"]["title"] + (" (new)" if d["sortedInto"]["created"] else ""))'
note() { echo "note '$1' -> $(curl -s "${A[@]}" "${J[@]}" -X POST $B/api/blocks -d "$(python3 -c 'import json,sys; print(json.dumps({"content": sys.argv[1], "autosort": True}))' "$1")" | j "$shown")"; }
up() { echo "file $1 -> $(curl -s "${A[@]}" -H X-Mutt:1 -H "Content-Type: $2" --data-binary @"$SP/$1" "$B/api/upload?name=$(python3 -c 'import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))' "$1")&autosort=1" | j "$shown + '  gist: ' + str(len(d['block']['meta'].get('gist', '')))")"; }

note 'Banana bread: 3 ripe bananas, 250g flour, 1 tsp baking soda. Bake 50 min.'
note 'Osaka day: Dotonbori street food, Kuromon market'
note 'Agenda for Monday standup: blockers, sprint review, hiring'
note '"Be yourself; everyone else is already taken." — Oscar Wilde'
note 'Buy milk, call the dentist, pick up dry cleaning'

# Files made here: plain text, Markdown, Word, PDF and RTF.
python3 - "$SP" <<'EOF'
import sys, zipfile, zlib
sp = sys.argv[1]
open(f'{sp}/notes.txt', 'w').write('Sunday roast\n\nIngredients\n1.5kg chicken\n1kg potatoes\n2 tbsp olive oil\n'
                                   'rosemary, garlic\n\nMethod\nPreheat oven to 200C. Roast for 90 minutes.')
open(f'{sp}/2026-10-12.md', 'w').write('# Weekly sync\n- Q4 roadmap agreed\n- Client proposal goes out Tuesday\n'
                                       '- Hiring: interviews next week\n\n## Actions\n- Sam: budget')
open(f'{sp}/Untitled 3.txt', 'w').write("Tomatoes: Gardener's Delight in the greenhouse, Sungold outside. Water every "
                                        'morning, pinch out side shoots, feed weekly once flowers set.')
open(f'{sp}/packing.txt', 'w').write('passport\nadapter\nsunscreen\nyen\nrail pass')
with zipfile.ZipFile(f'{sp}/Document1.docx', 'w') as z:
    z.writestr('[Content_Types].xml', '<Types/>')
    z.writestr('word/document.xml', '<w:document><w:body><w:p><w:r><w:t>Itinerary</w:t></w:r></w:p><w:p><w:r>'
               '<w:t>Day 1 Tokyo: Shibuya, Meiji shrine. Day 2 Shinkansen to Kyoto, Fushimi Inari. '
               'Day 3 Osaka, Dotonbori. Flight home from KIX.</w:t></w:r></w:p></w:body></w:document>')
text = zlib.compress(b'BT /F1 12 Tf 72 720 Td (Tonkotsu ramen) Tj T* (Simmer the pork bones 12 hours with garlic '
                     b'and ginger. Noodles, chashu, soy tare.) Tj ET')
pdf = (b'%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n'
       b'2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n'
       b'3 0 obj << /Type /Page /Parent 2 0 R /Contents 4 0 R >> endobj\n'
       b'4 0 obj << /Length ' + str(len(text)).encode() + b' /Filter /FlateDecode >>\nstream\n' + text +
       b'\nendstream\nendobj\ntrailer << /Root 1 0 R >>\n%%EOF\n')
open(f'{sp}/scan0042.pdf', 'wb').write(pdf)
open(f'{sp}/letter.rtf', 'w').write(r'{\rtf1\ansi{\fonttbl\f0 Helvetica;}\f0\fs24 Dear Sam,\par Following our '
                                    r'meeting, attached is the client proposal and timeline for the project.\par}')
EOF
up notes.txt text/plain
up 2026-10-12.md text/markdown
up 'Untitled 3.txt' text/plain
up packing.txt text/plain
up Document1.docx application/vnd.openxmlformats-officedocument.wordprocessingml.document
up scan0042.pdf application/pdf
up letter.rtf application/rtf

# A star dropped into the void later sorts the same way.
S=$(curl -s "${A[@]}" "${J[@]}" -X POST $B/api/blocks -d '{"content":"Prune the roses and repot the basil"}' | j "d['block']['id']")
echo "star -> $(curl -s "${A[@]}" "${J[@]}" -X POST $B/api/blocks/$S/autosort -d '{}' | j "$shown")"
echo "search finds the word inside the PDF: $(curl -s "${A[@]}" "$B/api/search?q=tonkotsu" | j "[b['title'] for b in d['blocks']]")"

# What each planet is for, as read from its name and files (summary, role, top topic and concept, own words).
for P in $R $T $W $G; do
  echo "purpose: $(curl -s "${A[@]}" "$B/api/drawers/$P/purpose" | j "(lambda p: p['title'] + ' -> ' + p['summary'] + ' | role ' + str(p['role']) + ' | ' + str(p['topics'][:1]) + ' ' + str(p['concepts'][:1]) + ' | ' + ', '.join(p['keywords'][:4]))(d['purpose'])")"
done
# A poem doesn't join diary entries; a sea bass recipe doesn't join a bass guitar planet.
D=$(planet "Morning pages"); BS=$(planet Bass)
put $D '6 Nov. Slept badly again. I keep circling the same worry about money. Wrote 400 words before the house woke up.'
put $D '7 Nov. Better today. I walked to the river and felt lighter.'
put $BS 'Practice: 20 min scales, 20 min slap, then the Jamerson line'
put $BS 'Strings: flatwounds on the P bass, 45-105'
note 'frost on the car
I write your name in it
and it stays
all morning'
note '8 Nov. Woke early and wrote for an hour. I felt calm.'
note 'Sea bass with lemon and capers: 2 fillets, 1 lemon, 1 tbsp capers. Pan fry 4 min each side.'
# Someone else can't read your planet's purpose.
curl -s -b /dev/null -c "$SP/b.txt" "${J[@]}" -X POST $B/api/auth/signup -d '{"username":"nosy","pin":"4822"}' > /dev/null
echo "someone else asking: $(curl -s -b "$SP/b.txt" "$B/api/drawers/$R/purpose" | j "d.get('error')")"

# Photos and songs: the camera, when and where, and song tags are read from the file itself.
python3 - "$SP" <<'PY'
import sys, struct
sp = sys.argv[1]
def exif_jpeg(path, make, model, taken, lat, lon):
    # A tiny JPEG holding only camera details (Exif): make, model, when, where.
    def ifd(entries, start, extra_at):
        out, extra = struct.pack('<H', len(entries)), b''
        for tag, typ, count, value in entries:
            if typ == 2 or typ == 5:
                data = value
                if len(data) <= 4:
                    out += struct.pack('<HHI', tag, typ, count) + data.ljust(4, b'\0')
                else:
                    out += struct.pack('<HHII', tag, typ, count, extra_at + len(extra))
                    extra += data + (b'\0' if len(data) % 2 else b'')
            else:
                out += struct.pack('<HHII', tag, typ, count, value)
        return out + struct.pack('<I', 0), extra
    rat = lambda *xs: b''.join(struct.pack('<II', int(x * 10000), 10000) for x in xs)
    dms = lambda v: rat(int(abs(v)), int(abs(v) * 60) % 60, (abs(v) * 3600) % 60)
    def block(entries, at):
        size = 2 + 12 * len(entries) + 4
        body, extra = ifd(entries, at, at + size)
        return body + extra
    # Layout: header(8) | IFD0 | Exif IFD | GPS IFD
    ifd0_n, exif_n, gps_n = 4, 1, 4
    s0 = 2 + 12 * ifd0_n + 4 + len(make) + 1 + (len(make) + 1) % 2 + len(model) + 1 + (len(model) + 1) % 2
    exif_at = 8 + s0
    s1 = 2 + 12 * exif_n + 4 + 20
    gps_at = exif_at + s1
    ifd0 = block([(0x010F, 2, len(make) + 1, make.encode() + b'\0'), (0x0110, 2, len(model) + 1, model.encode() + b'\0'),
                  (0x8769, 4, 1, exif_at), (0x8825, 4, 1, gps_at)], 8)
    exif = block([(0x9003, 2, 20, taken.encode() + b'\0')], exif_at)
    gps = block([(1, 2, 2, (b'N' if lat >= 0 else b'S') + b'\0'), (2, 5, 3, dms(lat)),
                 (3, 2, 2, (b'E' if lon >= 0 else b'W') + b'\0'), (4, 5, 3, dms(lon))], gps_at)
    tiff = b'II*\0' + struct.pack('<I', 8) + ifd0 + exif + gps
    app1 = b'Exif\0\0' + tiff
    open(path, 'wb').write(b'\xff\xd8\xff\xe1' + struct.pack('>H', len(app1) + 2) + app1 + b'\xff\xd9')

def id3_mp3(path, **tags):
    # A tiny MP3 with only its tags (ID3v2.3): title, artist, album, genre.
    names = {'title': 'TIT2', 'artist': 'TPE1', 'album': 'TALB', 'genre': 'TCON'}
    frames = b''.join(names[k].encode() + struct.pack('>I', len(v) + 1) + b'\0\0' + b'\0' + v.encode()
                      for k, v in tags.items())
    size = len(frames)
    syncsafe = bytes([(size >> 21) & 127, (size >> 14) & 127, (size >> 7) & 127, size & 127])
    open(path, 'wb').write(b'ID3\x03\x00\x00' + syncsafe + frames + b'\xff\xfb\x90\x00' + b'\0' * 400)

exif_jpeg(f'{sp}/DSC_0412.jpg', 'SONY', 'ILCE-7M3', '2026:10:12 14:03:11', 35.0116, 135.7681)
exif_jpeg(f'{sp}/DSC_0413.jpg', 'SONY', 'ILCE-7M3', '2026:10:12 15:20:40', 35.0120, 135.7690)
id3_mp3(f'{sp}/01 So What.mp3', title='So What', artist='Miles Davis', album='Kind of Blue', genre='Jazz')
id3_mp3(f'{sp}/02 Blue in Green.mp3', title='Blue in Green', artist='Miles Davis', album='Kind of Blue', genre='Jazz')
PY
K=$(planet Kyoto); M=$(planet Records)
onto() { curl -s "${A[@]}" -H X-Mutt:1 -H "Content-Type: $3" --data-binary @"$SP/$1" "$B/api/upload?name=$(python3 -c 'import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))' "$1")&drawer=$2" | j "d['block']['id']"; }
P1=$(onto DSC_0412.jpg $K image/jpeg); onto '01 So What.mp3' $M audio/mpeg > /dev/null
echo "photo details: $(curl -s "${A[@]}" $B/api/blocks/$P1 | j "d['block']['meta'].get('media')")"
up DSC_0413.jpg image/jpeg
up '02 Blue in Green.mp3' audio/mpeg
for P in $K $M; do
  echo "purpose: $(curl -s "${A[@]}" "$B/api/drawers/$P/purpose" | j "(lambda p: p['title'] + ' -> ' + p['summary'] + ' | contains ' + str(p['contains']) + ' | cameras ' + str(p['cameras']) + ' | music ' + str(p['music']))(d['purpose'])")"
done
echo "sorting a file that's already on a planet: $(curl -s "${A[@]}" "${J[@]}" -X POST $B/api/blocks/$P1/autosort -d '{}' | j "d['sortedInto']")"
# What a picture shows (512 numbers, read on the device): a bad reading is refused, a good one is kept but not shown.
echo "bad reading: $(curl -s "${A[@]}" "${J[@]}" -X PATCH $B/api/blocks/$P1 -d '{"see":{"v":1,"e":"not numbers"}}' | j "d.get('error')")"
GOOD=$(python3 -c 'import base64,json,random; random.seed(1); print(json.dumps({"see": {"v": 1, "e": base64.b64encode(bytes(random.randrange(256) for _ in range(512))).decode()}}))')
echo "good reading, as the owner sees it: $(curl -s "${A[@]}" "${J[@]}" -X PATCH $B/api/blocks/$P1 -d "$GOOD" | j "d.get('error') or d['block']['meta'].get('see')")"
echo "pictures still to read: $(curl -s "${A[@]}" $B/api/see/todo | j "[b['title'] for b in d['blocks']]")"
# Someone else sees a shared photo, but not where or when it was taken, or the reading.
curl -s "${A[@]}" "${J[@]}" -X POST $B/api/blocks/$P1/share -d '{"shared":true}' > /dev/null
echo "someone else sees: $(curl -s -b "$SP/b.txt" $B/api/blocks/$P1 | j "d.get('error') or d['block']['meta']")"
