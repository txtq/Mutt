#!/bin/bash
# Search filters: kind, extension, dates, colour, vibes, sort, paging, and the
# list of pictures still to be measured.
SP="$1"; B=localhost:${MUTT_TEST_PORT:-8099}
J=(-H Content-Type:application/json -H X-Mutt:1); C=(-b "$SP/c.txt" -c "$SP/c.txt")
rm -f "$SP/c.txt"
j() { python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"; }
names="[b.get('title') or b.get('fileName') or b['content'][:20] for b in d['blocks']]"
curl -s "${C[@]}" "${J[@]}" -X POST $B/api/auth/signup -d '{"username":"Finder","pin":"482193"}' > /dev/null
D=$(curl -s "${C[@]}" "${J[@]}" -X POST $B/api/drawers -d '{"title":"Beach trip"}' | j "d['drawer']['id']")
note() { curl -s "${C[@]}" "${J[@]}" -X POST $B/api/blocks -d "{\"content\":\"$1\"}" | j "d['block']['id']"; }
up() { printf '%s' "$2" > "$SP/$1"; curl -s "${C[@]}" -H X-Mutt:1 -H "Content-Type: $3" --data-binary @"$SP/$1" "$B/api/upload?name=$1" | j "d['block']['id']"; }
look() { curl -s -o /dev/null -w "look $1: %{http_code}\n" "${C[@]}" "${J[@]}" -X PATCH $B/api/blocks/$1 -d "{\"look\":$2}"; }
N1=$(note "sunset by the beach"); N2=$(note "shopping list"); sleep 1
P1=$(up red.png 'not really a png' image/png)
P2=$(up blue.jpg 'nor a jpg' image/jpeg)
P3=$(up grey.gif 'gif' image/gif)
F=$(up report.pdf '%PDF-1.4' application/pdf)
look $P1 '{"v":2,"hex":"#D04030","h":8,"s":0.6,"l":0.5,"c":0.3,"colors":{"red":0.62,"orange":0.2},"tags":["warm","vivid","busy","wide"]}'
look $P2 '{"v":2,"hex":"#3060D0","h":220,"s":0.5,"l":0.45,"c":0.2,"colors":{"blue":0.8,"red":0.1},"tags":["cool","vivid","minimal","tall"]}'
look $P3 '{"hex":"#808080","h":0,"s":0.01,"l":0.5,"c":0.1}'
look $P3 '{"v":2,"hex":"#808080","h":0,"s":0.01,"l":0.5,"c":0.1,"colors":{"chartreuse":1},"tags":[]}'
look $P3 '{"v":2,"hex":"#808080","h":0,"s":0.01,"l":0.5,"c":0.1,"tags":["sparkly"]}'
s() { echo "$1: $(curl -s "${C[@]}" "$B/api/search?$2" | j "$names")"; }
s "nothing (newest)" ""
s "words beach" "q=beach"
echo "planets for beach: $(curl -s "${C[@]}" "$B/api/search?q=beach" | j "[x['title'] for x in d['drawers']]")"
echo "planets without words: $(curl -s "${C[@]}" "$B/api/search?kind=image" | j "len(d['drawers'])")"
s "kind image" "kind=image"
s "kind image,pdf" "kind=image,pdf"
s "kind text" "kind=text"
s "ext png" "ext=png"
s "color red (strongest first)" "color=red"
s "color blue" "color=blue"
s "vibe warm" "vibe=warm"
s "vibe vivid" "vibe=vivid"
s "vibe vivid,tall" "vibe=vivid,tall"
s "colour words do not match looks" "q=vivid"
s "from now (nothing)" "from=$(($(date +%s) + 5))"
s "to the past (nothing)" "to=1000"
s "sort old" "sort=old"
s "sort az" "sort=az"
s "sort size" "sort=size"
echo "bad kind: $(curl -s -o /dev/null -w '%{http_code}' "${C[@]}" "$B/api/search?kind=spaceship")"
echo "bad colour: $(curl -s -o /dev/null -w '%{http_code}' "${C[@]}" "$B/api/search?color=chartreuse")"
echo "bad vibe: $(curl -s -o /dev/null -w '%{http_code}' "${C[@]}" "$B/api/search?vibe=sparkly")"
echo "todo (grey is old-style): $(curl -s "${C[@]}" "$B/api/looks/todo" | j "$names")"
# What pictures show: readings made to look like the descriptions themselves.
seen() { python3 -c "
import base64,json,sys
d=json.load(open('mutt/sights.json'))['sights']
v=[sum(x) for x in zip(*(__import__('array').array('b',base64.b64decode(d[n])) for n in sys.argv[1:]))]
m=max(abs(x) for x in v); print(json.dumps({'see':{'v':1,'e':base64.b64encode(bytes((round(x/m*127))&255 for x in v)).decode()}}))" "$@"; }
P4=$(up rex.jpg 'dog' image/jpeg); P5=$(up shore.jpg 'beach' image/jpeg); P6=$(up walk.jpg 'both' image/jpeg)
for pair in "$P4 dog" "$P5 beach" "$P6 dog beach"; do set -- $pair; id=$1; shift
  curl -s -o /dev/null "${C[@]}" "${J[@]}" -X PATCH $B/api/blocks/$id -d "$(seen "$@")"; done
s "pictures that show dogs" "q=puppies"
s "a dog on the beach" "q=a%20dog%20on%20the%20beach"
s "beach, in words and pictures" "q=beach"
s "a word that is not a subject" "q=rex%20dog"
for i in $(seq 1 62); do curl -s -o /dev/null "${C[@]}" "${J[@]}" -X POST $B/api/blocks -d "{\"content\":\"filler $i\"}"; done
echo "page 1: $(curl -s "${C[@]}" "$B/api/search?q=filler" | j "(len(d['blocks']), d['more'])")"
echo "page 2: $(curl -s "${C[@]}" "$B/api/search?q=filler&offset=60" | j "(len(d['blocks']), d['more'])")"
# Search on a galaxy: each file says which planets it is on (a moon counts as its planet), and
# on someone else's galaxy it finds only files on planets you may open, never by their details.
curl -s -o /dev/null "${C[@]}" "${J[@]}" -X POST $B/api/blocks/$N1/connections -d "{\"drawer\":\"$D\"}"
MOON=$(curl -s "${C[@]}" "${J[@]}" -X POST $B/api/drawers -d "{\"title\":\"Rock pools\",\"parent\":\"$D\"}" | j "d['drawer']['id']")
curl -s -o /dev/null "${C[@]}" "${J[@]}" -X POST $B/api/blocks -d "{\"content\":\"beach crabs in the pools\",\"drawer\":\"$MOON\"}"
SECRET=$(curl -s "${C[@]}" "${J[@]}" -X POST $B/api/drawers -d '{"title":"Secret beach","visibility":"private"}' | j "d['drawer']['id']")
curl -s -o /dev/null "${C[@]}" "${J[@]}" -X POST $B/api/blocks -d "{\"content\":\"beach hut key under the mat\",\"drawer\":\"$SECRET\"}"
on="[(b['content'][:12], [{'$D': 'Beach trip', '$SECRET': 'Secret beach'}.get(i, '?') for i in b['on']]) for b in d['blocks'] if b['kind'] == 'text']"
echo "your planets per file: $(curl -s "${C[@]}" "$B/api/search?q=beach" | j "$on")"
V=(-b "$SP/v.txt" -c "$SP/v.txt"); rm -f "$SP/v.txt"
curl -s -o /dev/null "${V[@]}" "${J[@]}" -X POST $B/api/auth/signup -d '{"username":"Visitor","pin":"582914"}'
echo "their galaxy, words: $(curl -s "${V[@]}" "$B/api/search?q=beach&of=Finder" | j "$on")"
echo "their galaxy, planets: $(curl -s "${V[@]}" "$B/api/search?q=beach&of=Finder" | j "[x['title'] for x in d['drawers']]")"
echo "their galaxy, not yours: $(curl -s "${V[@]}" "$B/api/search?q=shopping&of=Finder" | j "len(d['blocks'])")"
echo "their galaxy, files marked theirs: $(curl -s "${V[@]}" "$B/api/search?q=crabs&of=Finder" | j "[(b['mine'], b.get('owner')) for b in d['blocks']]")"
echo "no such person: $(curl -s -o /dev/null -w '%{http_code}' "${V[@]}" "$B/api/search?q=beach&of=nobody")"
echo "your own name is your own search: $(curl -s "${C[@]}" "$B/api/search?q=shopping&of=Finder" | j "len(d['blocks'])")"
# Speak to the Void: a voice note's shape and the words read on the device
VN=$(printf 'not really sound' > "$SP/v.m4a"; curl -s "${C[@]}" -H X-Mutt:1 -H 'Content-Type: audio/mp4' --data-binary @"$SP/v.m4a" "$B/api/upload?name=Voice%20note.m4a&drawer=$D" | j "d['block']['id']")
echo "voice note, shape and words kept: $(curl -s "${C[@]}" "${J[@]}" -X PATCH $B/api/blocks/$VN -d '{"voice":{"wave":[0,50,100,150,-3,20,30,40]},"heard":{"v":1,"text":"  pick up   more clay "}}' | j "(d['block']['kind'], d['block']['meta']['voice'], d['block']['meta']['heard'])")"
echo "voice note, a shape too short is refused: $(curl -s "${C[@]}" "${J[@]}" -X PATCH $B/api/blocks/$VN -d '{"voice":{"wave":[1,2]}}' | j "d['block']['meta']['voice']['wave'][:3]")"
echo "voice note, words on a note are ignored: $(curl -s "${C[@]}" "${J[@]}" -X PATCH $B/api/blocks/$N2 -d '{"heard":{"text":"x"}}' | j "'heard' in d['block'].get('meta', {})")"
echo "voice note, found by its words: $(curl -s "${C[@]}" "$B/api/search?q=clay" | j "$names")"
echo "voice note, found by its words in their galaxy: $(curl -s "${V[@]}" "$B/api/search?q=clay&of=Finder" | j "$names")"
echo "voice reader off: $(curl -s -o /dev/null -w '%{http_code}' "${C[@]}" $B/api/hear/encoder) $(curl -s "${C[@]}" $B/api/hear/todo | j "d['blocks']")"
