#!/bin/bash
# Keeping a planet together (binary planets) and beaming files to people.
SP="$1"; B=localhost:${MUTT_TEST_PORT:-8099}
. "$(dirname "$0")/lib.sh"
J=(-H Content-Type:application/json -H X-Mutt:1)
S=(-b "$SP/ts.txt" -c "$SP/ts.txt"); R=(-b "$SP/tr.txt" -c "$SP/tr.txt"); C=(-b "$SP/tc.txt" -c "$SP/tc.txt"); D=(-b "$SP/td.txt" -c "$SP/td.txt")
rm -f "$SP"/ts.txt "$SP"/tr.txt "$SP"/tc.txt "$SP"/td.txt
j() { python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"; }
curl -s "${S[@]}" "${J[@]}" -X POST $B/api/auth/signup -d '{"username":"sam","pin":"135793"}' > /dev/null
curl -s "${R[@]}" "${J[@]}" -X POST $B/api/auth/signup -d '{"username":"rae","pin":"246893"}' > /dev/null
curl -s "${C[@]}" "${J[@]}" -X POST $B/api/auth/signup -d '{"username":"cy","pin":"111193"}' > /dev/null
curl -s "${D[@]}" "${J[@]}" -X POST $B/api/auth/signup -d '{"username":"dee","pin":"975319"}' > /dev/null
curl -s -o /dev/null "${R[@]}" "${J[@]}" -X PUT $B/api/me/name -d '{"name":"Rae Okafor"}'
echo "a new account can beam once anyone else is here: $(curl -s "${C[@]}" $B/api/me | j "d['user']['canBeam']")"

# ---- keeping a planet together
TRIP=$(curl -s "${S[@]}" "${J[@]}" -X POST $B/api/drawers -d '{"title":"Japan trip","visibility":"people"}' | j "d['drawer']['id']")
MOON=$(curl -s "${S[@]}" "${J[@]}" -X POST $B/api/drawers -d "{\"title\":\"Kyoto\",\"parent\":\"$TRIP\"}" | j "d['drawer']['id']")
# add <S|R|C|D> <words> <planet>: a note by that person on that planet
add() { local a; eval "a=(\"\${$1[@]}\")"; curl -s "${a[@]}" "${J[@]}" -X POST $B/api/blocks -d "{\"content\":\"$2\",\"drawer\":\"$3\"}" | j "d['block']['id']"; }
SF=$(add S "ryokan two nights" $TRIP)
echo "no one to ask yet: $(curl -s "${S[@]}" $B/api/drawers/$TRIP | j "d['drawer']['keepWith'], 'keepAsk' in d['drawer']")"
curl -s -o /dev/null "${S[@]}" "${J[@]}" -X PATCH $B/api/drawers/$TRIP -d '{"people":["rae"]}'
echo "shared by name, rae can be asked: $(curl -s "${S[@]}" $B/api/drawers/$TRIP | j "[p['username'] for p in d['drawer']['keepWith']]")"
echo "ask cy, who doesn't share it (expect 400): $(status "${S[@]}" "${J[@]}" -X POST $B/api/drawers/$TRIP/keep -d '{"with":"cy"}')"
echo "ask rae: $(curl -s "${S[@]}" "${J[@]}" -X POST $B/api/drawers/$TRIP/keep -d '{"with":"rae"}' | j "d['drawer']['keepAsk']['to']")"
echo "asked again at once (expect 400): $(status "${S[@]}" "${J[@]}" -X POST $B/api/drawers/$TRIP/keep -d '{"with":"rae"}')"
echo "rae is asked: $(curl -s "${R[@]}" $B/api/keep | j "[(a['drawer']['title'], a['from']['username']) for a in d['asks']]")"
echo "cy is not: $(curl -s "${C[@]}" $B/api/keep | j "d['asks']")"
rule "someone answered an ask that wasn't theirs" "$(status "${C[@]}" "${J[@]}" -X POST $B/api/keep/$TRIP -d '{"answer":"yes"}')" 404
echo "rae says yes: $(curl -s "${R[@]}" "${J[@]}" -X POST $B/api/keep/$TRIP -d '{"answer":"yes"}' | j "d['drawer']['mine'], d['drawer']['keptWith']")"
echo "sam hears: $(curl -s "${S[@]}" $B/api/keep | j "[(n['what'], n['by'], n['title']) for n in d['news']]")  once: $(curl -s "${S[@]}" $B/api/keep | j "d['news']")"
echo "in rae's galaxy: $(curl -s "${R[@]}" $B/api/galaxy | j "[(p['title'], p['mine'], p['keptWith']['username'], [m['title'] for m in p['moons']]) for p in d['planets']]")"
echo "in rae's planet list (to add files to): $(curl -s "${R[@]}" "$B/api/drawers?lite=1" | j "[x['title'] for x in d['drawers']]")"
echo "keepers seen by a visitor: $(curl -s "${C[@]}" $B/api/galaxy/rae | j "[(p['title'], p.get('locked', False), p.get('private', False)) for p in d['planets']]")"
RF=$(add R "that udon place" $TRIP)
RM=$(add R "kiyomizu cups" $MOON)
NARA="{\"title\":\"Nara\",\"parent\":\"$TRIP\"}"
echo "rae renames, sets kind, makes a moon: $(curl -s "${R[@]}" "${J[@]}" -X PATCH $B/api/drawers/$TRIP -d '{"title":"Japan","look":"bloom"}' | j "d['drawer']['title'], d['drawer']['look']") $(curl -s "${R[@]}" "${J[@]}" -X POST $B/api/drawers -d "$NARA" | j "d['drawer']['mine']")"
echo "rae can't delete it: $(curl -s "${R[@]}" "${J[@]}" -X DELETE $B/api/drawers/$TRIP | j "d['error']")  nor can sam: $(status "${S[@]}" "${J[@]}" -X DELETE $B/api/drawers/$TRIP)"
rule "a keeper took the other keeper's file off their planet" "$(status "${R[@]}" "${J[@]}" -X DELETE $B/api/blocks/$SF/connections/$TRIP)" 404
rule "a keeper could change the other keeper's file" "$(status "${R[@]}" "${J[@]}" -X PATCH $B/api/blocks/$SF -d '{"content":"x"}')" 404
echo "rae makes it private, sam hears: $(curl -s "${R[@]}" "${J[@]}" -X PATCH $B/api/drawers/$TRIP -d '{"visibility":"private"}' | j "d['drawer']['visibility']") $(curl -s "${S[@]}" $B/api/keep | j "[(n['what'], n['by']) for n in d['news']]")"
rule "a planet kept together and private showed to a visitor" "$(status "${C[@]}" $B/api/drawers/$TRIP)" 404
rule "a private kept planet's name showed in a keeper's galaxy to a visitor" "$(curl -s "${C[@]}" $B/api/galaxy/rae | j "'Japan' in json.dumps(d)")" False
SPOT="{\"planets\":[{\"id\":\"$TRIP\",\"x\":120,\"y\":-40}]}"
echo "rae places it in her galaxy, sam's place stays: $(curl -s "${R[@]}" "${J[@]}" -X PUT $B/api/galaxy/layout -d "$SPOT" | j "d.get('ok') or d") $(curl -s "${R[@]}" $B/api/galaxy | j "[(p['x'], p['y']) for p in d['planets']]") $(curl -s "${S[@]}" $B/api/galaxy | j "[(p['x'], p['y']) for p in d['planets']]")"
echo "the two are joined in the universe (private: not for cy): $(curl -s "${S[@]}" $B/api/galaxies | j "[(l['a'], l['b'], len(l.get('kept', []))) for l in d['links']]") cy: $(curl -s "${C[@]}" $B/api/galaxies | j "d['links']")"
curl -s -o /dev/null "${R[@]}" "${J[@]}" -X PATCH $B/api/drawers/$TRIP -d '{"visibility":"public"}'
echo "public now, cy sees the pair and one kept world in each: $(curl -s "${C[@]}" $B/api/galaxies | j "[(l['a'], l['b'], len(l['kept'])) for l in d['links']], [(g['username'], sum(1 for w in g['worlds'] if w.get('kept'))) for g in d['galaxies']]")"
echo "autosort never picks it (a note about the ryokan goes elsewhere): $(curl -s "${S[@]}" "${J[@]}" -X POST $B/api/blocks -d '{"content":"ryokan two nights again","autosort":true}' | j "(d.get('sortedInto') or {}).get('planet', {}).get('title')")"
echo "download lists it for rae with sam's files: $(curl -s "${R[@]}" -o "$SP/rae.zip" -w '%{http_code}' $B/api/me/export) $(python3 -c "
import json,sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); d=json.loads(z.read([n for n in z.namelist() if n.endswith('Your data.json')][0]))
print([(p['name'], (p['keptTogetherWith'] or {}).get('with'), len((p['keptTogetherWith'] or {}).get('theirFiles') or [])) for p in d['planets'] if not p['moonOf']], sorted(n.split('/',1)[1] for n in z.namelist() if 'Japan' in n))" "$SP/rae.zip")"
echo "rae leaves: $(curl -s "${R[@]}" "${J[@]}" -X POST $B/api/drawers/$TRIP/leave | j "d['drawer']['title'], d['drawer']['visibility'], d['drawer']['count'], d['drawer'].get('keptWith')")"
echo "sam keeps it with copies of rae's: $(curl -s "${S[@]}" $B/api/drawers/$TRIP | j "sorted((b['content'], b['mine'], (b['meta'].get('savedFrom') or {}).get('username')) for b in d['blocks']), d['drawer'].get('keptWith')")"
echo "sam's moon too: $(curl -s "${S[@]}" $B/api/drawers/$MOON | j "[(b['content'], b['mine']) for b in d['blocks']]")"
echo "rae's own planet and moons: $(curl -s "${R[@]}" $B/api/galaxy | j "[(p['title'], p['count'], sorted(m['title'] for m in p['moons'])) for p in d['planets']]")"
echo "sam hears she left: $(curl -s "${S[@]}" $B/api/keep | j "[(n['what'], n['by']) for n in d['news']]")"
rule "after leaving, the leaver could still open a planet made private again" "$(curl -s -o /dev/null "${S[@]}" "${J[@]}" -X PATCH $B/api/drawers/$TRIP -d '{"visibility":"private"}'; status "${R[@]}" $B/api/drawers/$TRIP)" 404

# an account deleted while keeping: the other keeps the planet and copies
BAND=$(curl -s "${D[@]}" "${J[@]}" -X POST $B/api/drawers -d '{"title":"Band","community":true}' | j "d['drawer']['id']")
add D "setlist" $BAND > /dev/null
add C "a riff" $BAND > /dev/null
curl -s -o /dev/null "${D[@]}" "${J[@]}" -X POST $B/api/drawers/$BAND/keep -d '{"with":"cy"}'
curl -s -o /dev/null "${C[@]}" "${J[@]}" -X POST $B/api/keep/$BAND -d '{"answer":"yes"}'
curl -s -o /dev/null "${D[@]}" "${J[@]}" -X POST $B/api/me/delete -d '{"pin":"975319"}'
echo "dee's account gone, cy keeps the band: $(curl -s "${C[@]}" $B/api/drawers/$BAND | j "d['drawer']['mine'], d['drawer'].get('keptWith'), sorted((b['content'], b['mine']) for b in d['blocks'])")"

# ---- beaming
echo "and still can: $(curl -s "${C[@]}" $B/api/me | j "d['user']['canBeam']")"
NOTE=$(curl -s "${S[@]}" "${J[@]}" -X POST $B/api/blocks -d '{"content":"tea bowl, third firing"}' | j "d['block']['id']")
echo "people to beam to (everyone, met first): $(curl -s "${S[@]}" $B/api/beam/people | j "[(p['username'], p['known']) for p in d['people']]")  found by name: $(curl -s "${S[@]}" "$B/api/beam/people?q=c" | j "[(p['username'], p['known']) for p in d['people']]")"
RAE_FILES=$(curl -s "${R[@]}" $B/api/galaxy | j "d['stats']['files']")
BEAM=$(curl -s "${S[@]}" "${J[@]}" -X POST $B/api/blocks/$NOTE/beam -d '{"to":"rae","words":"the celadon one"}' | j "d['beam']['id']")
echo "beamed twice (expect 400): $(status "${S[@]}" "${J[@]}" -X POST $B/api/blocks/$NOTE/beam -d '{"to":"rae"}')  to yourself: $(status "${S[@]}" "${J[@]}" -X POST $B/api/blocks/$NOTE/beam -d '{"to":"sam"}')"
rule "someone beamed a file that isn't theirs" "$(status "${C[@]}" "${J[@]}" -X POST $B/api/blocks/$NOTE/beam -d '{"to":"cy"}')" 404
echo "rae sees it waiting: $(curl -s "${R[@]}" $B/api/beams | j "[(b['block']['content'], b['from']['username'], b['words'], b['quiet']) for b in d['beams']]")"
rule "a beamed file waiting could be read by someone else" "$(status "${C[@]}" $B/api/blocks/$NOTE)" 404
echo "rae can look at it: $(status "${R[@]}" $B/api/blocks/$NOTE)  not comment (expect 404): $(status "${R[@]}" "${J[@]}" -X POST $B/api/blocks/$NOTE/comments -d '{"body":"hi"}')"
echo "rae's galaxy counts it waiting: $(curl -s "${R[@]}" $B/api/galaxy | j "d['beams']")  a note under the clock: $(curl -s "${R[@]}" $B/api/comments/new | j "[(b['from']['username'], b['count'], b['words']) for b in d['beams']]")"
rule "a waiting beam counted as one of the receiver's files" "$(curl -s "${R[@]}" $B/api/galaxy | j "d['stats']['files'] - $RAE_FILES")" 0
COPY=$(curl -s "${R[@]}" "${J[@]}" -X POST $B/api/beams/$BEAM -d '{"answer":"keep"}' | j "d['block']['id']")
echo "kept: $(curl -s "${R[@]}" $B/api/blocks/$COPY | j "d['block']['content'], d['block']['mine'], d['block']['meta']['beamedBy']['username'], d['block']['meta']['beamedBy']['words'], d['block']['meta']['savedFrom']['username']")"
echo "no longer waiting: $(curl -s "${R[@]}" $B/api/beams | j "d['beams']")  answered twice: $(status "${R[@]}" "${J[@]}" -X POST $B/api/beams/$BEAM -d '{"answer":"gone"}')"
rule "a beamed file still readable by its receiver after it was answered (they have their copy)" "$(status "${R[@]}" $B/api/blocks/$NOTE)" 404
B2=$(curl -s "${S[@]}" "${J[@]}" -X POST $B/api/blocks -d '{"content":"a second one"}' | j "d['block']['id']")
BEAM2=$(curl -s "${S[@]}" "${J[@]}" -X POST $B/api/blocks/$B2/beam -d '{"to":"rae"}' | j "d['beam']['id']")
echo "let go, then undone: $(curl -s "${R[@]}" "${J[@]}" -X POST $B/api/beams/$BEAM2 -d '{"answer":"gone"}' | j "d['ok']") $(curl -s "${R[@]}" "${J[@]}" -X POST $B/api/beams/$BEAM2/undo | j "d['ok']") $(curl -s "${R[@]}" $B/api/beams | j "len(d['beams'])")"
echo "sam takes it back: $(curl -s "${S[@]}" "${J[@]}" -X DELETE $B/api/beams/$BEAM2 | j "d['ok']") $(curl -s "${R[@]}" $B/api/beams | j "len(d['beams'])")"

# from a stranger: quiet, and a few at most
for i in 1 2 3 4; do X=$(curl -s "${C[@]}" "${J[@]}" -X POST $B/api/blocks -d "{\"content\":\"hello $i\"}" | j "d['block']['id']"); echo "cy beams sam #$i: $(status "${C[@]}" "${J[@]}" -X POST $B/api/blocks/$X/beam -d '{"to":"sam"}')"; done
echo "sam's are quiet: $(curl -s "${S[@]}" $B/api/beams | j "[(b['from']['username'], b['quiet']) for b in d['beams']]")"
echo "sam stops cy: $(curl -s "${S[@]}" "${J[@]}" -X POST $B/api/beam-stops -d '{"username":"cy"}' | j "d['ok']") waiting: $(curl -s "${S[@]}" $B/api/beams | j "len(d['beams'])") stopped: $(curl -s "${S[@]}" $B/api/beam-stops | j "[p['username'] for p in d['people']]")"
X=$(curl -s "${C[@]}" "${J[@]}" -X POST $B/api/blocks -d '{"content":"one more"}' | j "d['block']['id']")
echo "cy beams again (looks sent, never arrives): $(status "${C[@]}" "${J[@]}" -X POST $B/api/blocks/$X/beam -d '{"to":"sam"}') $(curl -s "${S[@]}" $B/api/beams | j "len(d['beams'])")"
echo "sam lets cy back: $(curl -s "${S[@]}" "${J[@]}" -X DELETE $B/api/beam-stops/cy | j "d['ok']")"

# a deleted file waits no more; a photo's place never travels
B3=$(curl -s "${S[@]}" "${J[@]}" -X POST $B/api/blocks -d '{"content":"soon gone"}' | j "d['block']['id']")
curl -s -o /dev/null "${S[@]}" "${J[@]}" -X POST $B/api/blocks/$B3/beam -d '{"to":"rae"}'
curl -s -o /dev/null "${S[@]}" "${J[@]}" -X DELETE $B/api/blocks/$B3
echo "sender deleted it: $(curl -s "${R[@]}" $B/api/beams | j "len(d['beams'])")"
MUTT_DATA_DIR="$SP/data" python3 -c "
import json, sqlite3, sys; c = sqlite3.connect(sys.argv[1]); c.execute('UPDATE blocks SET meta = ? WHERE id = ?', (json.dumps({'media': {'gps': [1, 2], 'camera': 'X', 'taken': 5, 'location': 'Kyoto', 'kind': 'photo'}}), sys.argv[2])); c.commit()" "$SP/data/mutt.db" "$NOTE"
B4=$(curl -s "${S[@]}" "${J[@]}" -X POST $B/api/blocks/$NOTE/beam -d '{"to":"cy"}' | j "d['beam']['id']")
C4=$(curl -s "${C[@]}" "${J[@]}" -X POST $B/api/beams/$B4 -d '{"answer":"keep"}' | j "d['block']['id']")
rule "where a photo was taken travelled with a beamed copy" "$(curl -s "${C[@]}" $B/api/blocks/$C4 | j "sorted(d['block']['meta'].get('media', {}))")" "['kind']"
# ---- beamed as it was sent: a recipe card arrives as a card (its dish photo with it), a document as its pages
python3 -c "import zlib,struct,sys
c=lambda t,d: struct.pack('>I',len(d))+t+d+struct.pack('>I',zlib.crc32(t+d))
open(sys.argv[1],'wb').write(b'\x89PNG\r\n\x1a\n'+c(b'IHDR',struct.pack('>IIBBBBB',2,2,8,2,0,0,0))+c(b'IDAT',zlib.compress(b'\0'+b'\xc0\x80\x40'*2+b'\0'+b'\xc0\x80\x40'*2))+c(b'IEND',b''))" "$SP/dish.png"
REC=$(curl -s "${S[@]}" "${J[@]}" -X POST $B/api/blocks -d '{"content":"Miso soup\nServes 2\n\nIngredients\n- 1 tbsp miso\n- 500 ml dashi\n\nMethod\n1. Warm the dashi.\n2. Stir in the miso."}' | j "d['block']['id']")
DISH=$(curl -s "${S[@]}" -H X-Mutt:1 -H 'Content-Type: image/png' --data-binary @"$SP/dish.png" "$B/api/upload?name=dish.png" | j "d['block']['id']")
curl -s -o /dev/null "${S[@]}" "${J[@]}" -X PUT $B/api/blocks/$REC/recipe -d "{\"title\":\"Miso soup\",\"photo\":\"$DISH\"}"
RB=$(curl -s "${S[@]}" "${J[@]}" -X POST $B/api/blocks/$REC/beam -d '{"to":"rae","form":"recipe"}' | j "d['beam']['id']")
echo "a card arrives as a card: $(curl -s "${R[@]}" $B/api/beams | j "[(b['card']['title'], len(b['card']['ingredients']), bool(b['card']['photo'])) for b in d['beams'] if b['id'] == '$RB']")  its dish photo, rae: $(status "${R[@]}" $B/f/$DISH/dish.png) cy: $(status "${C[@]}" $B/f/$DISH/dish.png)"
RC=$(curl -s "${R[@]}" "${J[@]}" -X POST $B/api/beams/$RB -d '{"answer":"keep"}' | j "d['block']['id']")
RD=$(curl -s "${R[@]}" $B/api/blocks/$RC | j "d['block']['meta']['recipe']['photo']")
echo "kept as a card with its own photo: $(curl -s "${R[@]}" $B/api/blocks/$RC | j "d['block']['meta']['recipe']['title']") $(curl -s "${R[@]}" $B/api/blocks/$RD | j "d['block']['mine'], d['block']['meta']['dishOf'] == '$RC'")  stars: $(curl -s "${R[@]}" $B/api/galaxy | j "'$RC' in [b['id'] for b in d['stars']], '$RD' in [b['id'] for b in d['stars']]")"
DOC=$(curl -s "${S[@]}" "${J[@]}" -X POST $B/api/blocks -d '{"content":"Dear Rae"}' | j "d['block']['id']")
python3 -c "import base64,sys; open(sys.argv[1],'wb').write(open(sys.argv[2],'rb').read())" "$SP/page.png" "$SP/dish.png"
SRC=$(curl -s "${S[@]}" -H X-Mutt:1 -H Content-Type:image/png --data-binary @"$SP/page.png" $B/api/docs/$DOC/img | j "d['src']")
curl -s -o /dev/null "${S[@]}" "${J[@]}" -X PUT $B/api/docs/$DOC -d "{\"html\":\"<h2>A letter</h2><p>Dear Rae</p><p><img src=\\\"$SRC\\\"></p>\",\"text\":\"## A letter\n\nDear Rae\",\"title\":\"\"}"
DB=$(curl -s "${S[@]}" "${J[@]}" -X POST $B/api/blocks/$DOC/beam -d '{"to":"rae"}' | j "d['beam']['id']")
echo "a document arrives as its page: $(curl -s "${R[@]}" $B/api/beams | j "[('A letter' in b['page']['html'], '<img' in b['page']['html'], b['page']['kind']) for b in d['beams'] if b['id'] == '$DB']")"
DC=$(curl -s "${R[@]}" "${J[@]}" -X POST $B/api/beams/$DB -d '{"answer":"keep"}' | j "d['block']['id']")
IMG=$(curl -s "${R[@]}" $B/api/docs/$DC | j "__import__('re').search(r'/api/docs/[\w-]+/img/[\w-]+', d['doc']['html']).group(0)")
echo "kept with its pages and picture: $(curl -s "${R[@]}" $B/api/docs/$DC | j "'A letter' in d['doc']['html']") $([[ $IMG == /api/docs/$DC/* ]] && echo own) $(status "${R[@]}" $B$IMG)"
echo "beamed as a list (expect it plain): $(curl -s "${S[@]}" "${J[@]}" -X POST $B/api/blocks/$B2/beam -d '{"to":"rae","form":"list"}' | j "bool(d['beam']['id'])") $(curl -s "${R[@]}" $B/api/beams | j "[('card' in b, 'page' in b) for b in d['beams'] if b['block']['id'] == '$B2']")"
echo "sam's download lists what he beamed: $(curl -s "${S[@]}" -o "$SP/sam.zip" -w '%{http_code}' $B/api/me/export) $(python3 -c "
import json,sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); d=json.loads(z.read([n for n in z.namelist() if n.endswith('Your data.json')][0]))
print([(b['to'], b['words']) for b in d['beamedOut']], 'answer' in json.dumps(d['beamedOut']))" "$SP/sam.zip")"

# ---- live: an open page hears what changed elsewhere (mutt/live.py), never what it holds
LP=$(curl -s "${S[@]}" "${J[@]}" -X POST $B/api/drawers -d '{"title":"Live","visibility":"people"}' | j "d['drawer']['id']")
curl -s -o /dev/null "${S[@]}" "${J[@]}" -X PATCH $B/api/drawers/$LP -d '{"people":["rae"]}'
curl -s -N --max-time 3 "${R[@]}" "$B/api/live?tab=raelive0001" > "$SP/live-r.txt" &
curl -s -N --max-time 3 "${S[@]}" "$B/api/live?tab=samlive0001" > "$SP/live-s.txt" &
curl -s -N --max-time 3 "${C[@]}" "$B/api/live?tab=cylive00001" > "$SP/live-c.txt" &
sleep 0.5
# watch <who> <json>: what that person's page says it shows; prints what the server took
watch() { local a; eval "a=(\"\${$1[@]}\")"; curl -s "${a[@]}" "${J[@]}" -X POST $B/api/live/watch -d "$2" | j "d.get('planet'), d.get('galaxy', d.get('error'))"; }
RW=$(watch R '{"tab":"raelive0001","planet":"'$LP'"}')
echo "rae watches the planet shared with her: $([[ $RW == "$LP False" ]] && echo yes || echo "$RW")"
CW=$(watch C '{"tab":"cylive00001","planet":"'$LP'"}')
rule "cy could watch a planet he can't see" "$CW" "None False"
watch S '{"tab":"samlive0001","planet":"'$LP'"}' > /dev/null
CT=$(watch C '{"tab":"raelive0001","galaxy":"cy"}')
rule "cy took over rae's page" "$CT" "None False"
LB=$(curl -s "${S[@]}" "${J[@]}" -H X-Mutt-Tab:samlive0001 -X POST $B/api/blocks -d '{"content":"a secret plan","drawer":"'$LP'"}' | j "d['block']['id']")
curl -s -o /dev/null "${S[@]}" "${J[@]}" -H X-Mutt-Tab:samlive0001 -X POST $B/api/blocks/$LB/beam -d '{"to":"rae"}'
wait
echo "rae's page heard: $(grep -o '"t":"[a-z]*"' "$SP/live-r.txt" | sort -u | tr -d '"' | tr '\n' ' ')"
echo "sam's own page isn't told of his own change: $(grep -c '^data:' "$SP/live-s.txt")"
rule "a notice carried what a file holds" "$(cat "$SP/live-r.txt" "$SP/live-c.txt" | grep -c secret)" "0"
echo "cy's page heard nothing: $(grep -c '^data:' "$SP/live-c.txt")"
echo "a stream needs a page id (expect 400): $(status "${R[@]}" "$B/api/live?tab=x")"
# ---- a planet made with someone ("Make a planet with Rae"): shared by name at once, and they're asked
WITH=$(curl -s "${S[@]}" "${J[@]}" -X POST $B/api/drawers -d '{"title":"Recipes for two","with":"rae"}')
WR=$(echo "$WITH" | j "d['drawer']['id']")
echo "made with rae: $(echo "$WITH" | j "d['drawer']['visibility'], d['drawer']['people'], d['drawer']['keepAsk']['to']['username'], d['drawer']['modes'].get('shareTip')")"
echo "rae can open it and is asked: $(status "${R[@]}" $B/api/drawers/$WR) $(curl -s "${R[@]}" $B/api/keep | j "[a['drawer']['title'] for a in d['asks']]")"
echo "made with yourself (expect 400): $(status "${S[@]}" "${J[@]}" -X POST $B/api/drawers -d '{"title":"x","with":"sam"}')"
echo "made with nobody (expect 400): $(status "${S[@]}" "${J[@]}" -X POST $B/api/drawers -d '{"title":"x","with":"nobody"}')"
MOONWITH="{\"title\":\"x\",\"with\":\"rae\",\"parent\":\"$WR\"}"
echo "a moon made with someone (expect 400): $(status "${S[@]}" "${J[@]}" -X POST $B/api/drawers -d "$MOONWITH")"
for n in 2 3; do curl -s -o /dev/null "${S[@]}" "${J[@]}" -X POST $B/api/drawers -d "{\"title\":\"For two $n\",\"with\":\"rae\"}"; done
echo "a fourth waiting for rae (expect 400): $(curl -s "${S[@]}" "${J[@]}" -X POST $B/api/drawers -d '{"title":"For two 4","with":"rae"}' | j "d['error']")"
echo "rae says yes, it's both of theirs: $(curl -s "${R[@]}" "${J[@]}" -X POST $B/api/keep/$WR -d '{"answer":"yes"}' | j "d['drawer']['mine'], d['drawer']['keptWith']['username']")"
