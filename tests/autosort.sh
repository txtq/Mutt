#!/bin/bash
# Autosort: typed notes, text files, Word, PDF and RTF uploads, links and stars
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
