#!/bin/bash
SP="$1"; B=localhost:${MUTT_TEST_PORT:-8099}
J=(-H Content-Type:application/json -H X-Mutt:1); C=(-b "$SP/c.txt" -c "$SP/c.txt")
rm -f "$SP/c.txt" "$SP/x.txt"
j() { python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"; }
echo "signup: $(curl -s "${C[@]}" "${J[@]}" -X POST $B/api/auth/signup -d '{"username":"Tester","pin":"482193"}' | j "d['user']['username']")"
for p in 4821 123456 654321 111111 121212 199004 147258; do BODY='{"username":"weak'$p'","pin":"'$p'"}'; echo "signup with $p: $(curl -s "${J[@]}" -X POST $B/api/auth/signup -d "$BODY" | j "d.get('error')")"; done
echo "check a code: $(curl -s "${J[@]}" -X POST $B/api/auth/check-pin -d '{"pin":"123123"}' | j "d['problem']") / $(curl -s "${J[@]}" -X POST $B/api/auth/check-pin -d '{"pin":"482193"}' | j "d['problem']")"
D=$(curl -s "${C[@]}" "${J[@]}" -X POST $B/api/drawers -d '{"title":"Stuff"}' | j "d['drawer']['id']")
BODY="{\"content\":\"hello **world**\",\"drawer\":\"$D\"}"
TK=$(curl -s "${C[@]}" "${J[@]}" -X POST $B/api/blocks -d "$BODY" | j "d['block']['kind']")
echo "text: $TK"
printf 'print(1)\n' > "$SP/a.py"
F=$(curl -s "${C[@]}" -H X-Mutt:1 -H 'Content-Type: text/x-python' --data-binary @"$SP/a.py" "$B/api/upload?drawer=$D&name=a.py" | j "d['block']['id'] + ' ' + d['block']['kind'] + ' ' + d['block']['file']")
echo "upload: $F"
echo "range: $(curl -s "${C[@]}" -H 'Range: bytes=0-4' -o /dev/null -w '%{http_code} %{size_download}' "$B${F##* }")"
echo "link: $(curl -s "${C[@]}" "${J[@]}" -X POST $B/api/blocks -d '{"content":"https://example.com"}' | j "d['block']['kind'] + ' ' + d['block']['title']")"
echo "drawer has: $(curl -s "${C[@]}" $B/api/drawers/$D | j "[b['kind'] for b in d['blocks']]")"
FID=${F%% *}
echo "delete keeps it a week: $(curl -s "${C[@]}" -H X-Mutt:1 -X DELETE $B/api/blocks/$FID | j "len(d['positions'])") $(curl -s "${C[@]}" $B/api/drawers/$D | j "[b['kind'] for b in d['blocks']]") $(curl -s "${C[@]}" $B/api/deleted | j "([b['kind'] for b in d['blocks']], d['keepDays'], d['blocks'][0]['goneAt'] - d['blocks'][0]['deletedAt'])")"
echo "deleted file shows to its owner, can't be edited: $(curl -s "${C[@]}" -o /dev/null -w '%{http_code}' "$B${F##* }") $(curl -s "${C[@]}" "${J[@]}" -X PATCH -o /dev/null -w '%{http_code}' $B/api/blocks/$FID -d '{"title":"x"}')"
echo "restore puts it back: $(curl -s "${C[@]}" -H X-Mutt:1 -X POST $B/api/blocks/$FID/restore | j "len(d['drawers'])") $(curl -s "${C[@]}" $B/api/drawers/$D | j "[b['kind'] for b in d['blocks']]") $(curl -s "${C[@]}" $B/api/deleted | j "len(d['blocks'])")"
curl -s -o /dev/null "${C[@]}" -H X-Mutt:1 -X DELETE $B/api/blocks/$FID
echo "delete it again from recently deleted: $(curl -s "${C[@]}" -H X-Mutt:1 -X DELETE $B/api/blocks/$FID | j "d['ok']") $(curl -s "${C[@]}" $B/api/deleted | j "len(d['blocks'])") $(curl -s "${C[@]}" -o /dev/null -w '%{http_code}' "$B${F##* }")"
curl -s "${C[@]}" -D "$SP/exp.h" -o "$SP/exp.zip" "$B/api/me/export?mark=t1"
echo "download everything: $(grep -o 'mutt-export=t1;' "$SP/exp.h") $(python3 -c "import zipfile,sys,json; z=zipfile.ZipFile(sys.argv[1]); n=sorted(z.namelist()); print(n, json.loads(z.read(\"tester's galaxy/Your data.json\"))['account']['username'])" "$SP/exp.zip") signed out $(curl -s -o /dev/null -w "%{http_code}" $B/api/me/export)"
# a constellation's stars go in a folder of its name inside Stars, and it's listed in Your data.json
CS=$(for t in "night sky" "comet"; do curl -s "${C[@]}" "${J[@]}" -X POST $B/api/blocks -d "{\"content\":\"$t\"}" | j "d['block']['id']"; done | python3 -c "import sys,json; print(json.dumps({'stars': sys.stdin.read().split(), 'title': 'Trip'}))")
curl -s -o /dev/null "${C[@]}" "${J[@]}" -X POST $B/api/constellations -d "$CS"
curl -s "${C[@]}" -o "$SP/exp2.zip" "$B/api/me/export"
echo "download, a constellation: $(python3 -c "import zipfile,sys,json; z=zipfile.ZipFile(sys.argv[1]); r=\"tester's galaxy/\"; print(sorted(n[len(r):] for n in z.namelist() if n.startswith(r+'Stars/')), [(c['name'], c['folder'], len(c['stars'])) for c in json.loads(z.read(r+'Your data.json'))['constellations']])" "$SP/exp2.zip")"
python3 -c "
import struct, sys, zlib
def png(w, h, path):
    chunk = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d))
    rows = b''.join(b'\0' + b'\x80\x40\x20' * w for _ in range(h))
    open(path, 'wb').write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(rows)) + chunk(b'IEND', b''))
png(4, 4, sys.argv[1] + '/p.png'); png(2, 2, sys.argv[1] + '/e.png')" "$SP"
PID=$(curl -s "${C[@]}" -H X-Mutt:1 -H 'Content-Type: image/png' --data-binary @"$SP/p.png" "$B/api/upload?drawer=$D&name=p.png" | j "d['block']['id']")
echo "edit a picture, original kept: $(curl -s "${C[@]}" -H X-Mutt:1 -H 'Content-Type: image/png' --data-binary @"$SP/e.png" "$B/api/blocks/$PID/picture?w=2&h=2" | j "('?e=' in d['block']['file'], d['block']['meta']['original'])")"
echo "the original shows to its owner only: $(curl -s "${C[@]}" -o /dev/null -w '%{http_code}' $B/api/blocks/$PID/original) $(curl -s -o /dev/null -w '%{http_code}' $B/api/blocks/$PID/original)"
echo "start over brings the original back: $(curl -s "${C[@]}" -H X-Mutt:1 -X POST $B/api/blocks/$PID/original | j "('?e=' in d['block']['file'], 'original' in d['block']['meta'], d['block']['meta'].get('width'))")"
echo "no csrf header: $(curl -s -o /dev/null -w '%{http_code}' "${C[@]}" -H Content-Type:application/json -X POST $B/api/drawers -d '{"title":"x"}')"
echo "spa route: $(curl -s -o /dev/null -w '%{http_code}' $B/d/whatever)"
X=(-b "$SP/x.txt" -c "$SP/x.txt")
for i in 1 2 3 4; do curl -s "${X[@]}" "${J[@]}" -X POST $B/api/auth/login -d '{"username":"tester","pin":"0000"}'; echo; done
echo "right code while locked: $(curl -s -o /dev/null -w '%{http_code}' "${X[@]}" "${J[@]}" -X POST $B/api/auth/login -d '{"username":"tester","pin":"482193"}')"
