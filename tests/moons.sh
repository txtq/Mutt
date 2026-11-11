#!/bin/bash
# Moons: small planets that belong to a planet.
SP="$1"; B=localhost:8099
J=(-H Content-Type:application/json -H X-Mutt:1)
A=(-b "$SP/ma.txt" -c "$SP/ma.txt"); U=(-b "$SP/mb.txt" -c "$SP/mb.txt")
rm -f "$SP/ma.txt" "$SP/mb.txt"
j() { python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"; }
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
curl -s "${A[@]}" "${J[@]}" -X POST $B/api/auth/signup -d '{"username":"mira","pin":"135793"}' > /dev/null
curl -s "${U[@]}" "${J[@]}" -X POST $B/api/auth/signup -d '{"username":"oto","pin":"246893"}' > /dev/null
mk() { curl -s "${A[@]}" "${J[@]}" -X POST $B/api/drawers -d "$1" | j "d['drawer']['id']"; }
add() { curl -s "${A[@]}" "${J[@]}" -X POST $B/api/blocks -d "{\"content\":\"$1\",\"drawer\":\"$2\"}" | j "d['block']['id']"; }

TRIP=$(mk '{"title":"Japan trip","visibility":"public"}')
FOOD=$(curl -s "${A[@]}" "${J[@]}" -X POST $B/api/drawers -d "{\"title\":\"Food\",\"parent\":\"$TRIP\"}" | tee "$SP/moon.json" | j "d['drawer']['id']")
echo "moon made: $(j "d['drawer']['title'], d['drawer']['parentId'] == '$TRIP', d['drawer']['visibility'], 'moons' in d['drawer']" < "$SP/moon.json")"
M2=$(mk "{\"title\":\"Temples\",\"parent\":\"$TRIP\",\"visibility\":\"private\"}")
M3=$(mk "{\"title\":\"Trains\",\"parent\":\"$TRIP\",\"visibility\":\"pin\"}")
M4=$(mk "{\"title\":\"Words\",\"parent\":\"$TRIP\"}")
BODY="{\"title\":\"Too many\",\"parent\":\"$TRIP\"}"; echo "5th moon: $(curl -s "${A[@]}" "${J[@]}" -X POST $B/api/drawers -d "$BODY" | j "d['error']")"
BODY="{\"title\":\"Tiny\",\"parent\":\"$FOOD\"}"; echo "moon of moon: $(curl -s "${A[@]}" "${J[@]}" -X POST $B/api/drawers -d "$BODY" | j "d['error']")"
echo "community moon: $(curl -s "${A[@]}" "${J[@]}" -X PATCH $B/api/drawers/$FOOD -d '{"community":true}' | j "d['error']")"
BODY="{\"title\":\"x\",\"parent\":\"$TRIP\"}"; echo "oto can't add moon to mira's: $(code "${U[@]}" "${J[@]}" -X POST $B/api/drawers -d "$BODY")"

echo "moon look io: $(curl -s "${A[@]}" "${J[@]}" -X PATCH $B/api/drawers/$FOOD -d '{"look":"io"}' | j "d['drawer']['look']")"
echo "moon look lava (planet kind): $(curl -s "${A[@]}" "${J[@]}" -X PATCH $B/api/drawers/$FOOD -d '{"look":"lava"}' | j "d['error']")"
echo "planet look io: $(curl -s "${A[@]}" "${J[@]}" -X PATCH $B/api/drawers/$TRIP -d '{"look":"io"}' | j "d['error']")"

N1=$(add "ramen in Fukuoka" $FOOD); N2=$(add "Kyoto itinerary" $TRIP)
echo "own galaxy: $(curl -s "${A[@]}" $B/api/galaxy | j "[(p['title'], p['count'], [(m['title'], m['count'], m['look'], m['locked']) for m in p['moons']]) for p in d['planets']], [s['content'] for s in d['stars']], d['stats']")"
echo "drawers list: $(curl -s "${A[@]}" "$B/api/drawers?lite=1" | j "[x['title'] for x in d['drawers']]")"
echo "moon page: $(curl -s "${A[@]}" $B/api/drawers/$FOOD | j "d['drawer']['title'], d['drawer']['parent']['title'], [b['content'] for b in d['blocks']], 'moons' in d['drawer']")"
echo "planet page moons: $(curl -s "${A[@]}" $B/api/drawers/$TRIP | j "[m['title'] for m in d['drawer']['moons']], [b['content'] for b in d['blocks']]")"

echo "oto sees: $(curl -s "${U[@]}" $B/api/galaxy/mira | j "[(p['title'], [(m['title'], m['locked']) for m in p['moons']]) for p in d['planets']]")"
echo "oto reads: public moon $(code "${U[@]}" $B/api/drawers/$FOOD) private moon $(code "${U[@]}" $B/api/drawers/$M2) pin moon $(code "${U[@]}" $B/api/drawers/$M3) file $(code "${U[@]}" $B/api/blocks/$N1)"
echo "universe: $(curl -s "${U[@]}" $B/api/galaxies | j "[(w['look'], w['moons']) for g in d['galaxies'] if g['username'] == 'mira' for w in g['worlds']]")"
curl -s "${A[@]}" "${J[@]}" -X PATCH $B/api/drawers/$TRIP -d '{"visibility":"private"}' > /dev/null
echo "planet made private, oto reads public moon: $(code "${U[@]}" $B/api/drawers/$FOOD) file $(code "${U[@]}" $B/api/blocks/$N1) galaxy $(curl -s "${U[@]}" $B/api/galaxy/mira | j "len(d['planets'])")"
echo "moons follow it to private: $(curl -s "${A[@]}" $B/api/drawers/$TRIP | j "[(m['title'], m['visibility']) for m in d['drawer']['moons']]")"
curl -s "${A[@]}" "${J[@]}" -X PATCH $B/api/drawers/$TRIP -d '{"visibility":"public"}' > /dev/null
curl -s "${A[@]}" "${J[@]}" -X PATCH $B/api/drawers/$M4 -d '{"visibility":"private"}' > /dev/null
curl -s "${A[@]}" "${J[@]}" -X PATCH $B/api/drawers/$TRIP -d '{"visibility":"people","people":["oto"]}' > /dev/null
echo "moons follow it to people, unless set by hand: $(curl -s "${A[@]}" $B/api/drawers/$TRIP | j "[(m['title'], m['visibility']) for m in d['drawer']['moons']]") oto reads Food $(code "${U[@]}" $B/api/drawers/$FOOD)"
curl -s "${A[@]}" "${J[@]}" -X PATCH $B/api/drawers/$TRIP -d '{"visibility":"public"}' > /dev/null

BODY="{\"planets\":[{\"id\":\"$FOOD\",\"x\":1,\"y\":1}]}"; echo "layout with moon id: $(code "${A[@]}" "${J[@]}" -X PUT $B/api/galaxy/layout -d "$BODY")"
echo "autosort never a moon: $(curl -s "${A[@]}" "${J[@]}" -X POST $B/api/blocks -d '{"content":"ramen in Fukuoka again, ramen","autosort":true}' | j "d['sortedInto']['planet']['title'], d['sortedInto']['planet'].get('parentId')")"

N3=$(add "Nara deer" $M2)
BODY="{\"drawer\":\"$M2\"}"; echo "move file to moon: $(curl -s "${A[@]}" "${J[@]}" -X POST $B/api/blocks/$N2/connections -d "$BODY" > /dev/null; code "${A[@]}" -H X-Mutt:1 -X DELETE $B/api/blocks/$N2/connections/$TRIP)"
echo "delete moon: $(curl -s "${A[@]}" -H X-Mutt:1 -X DELETE $B/api/drawers/$M2 | j "d")"
echo "planet after: $(curl -s "${A[@]}" $B/api/drawers/$TRIP | j "[m['title'] for m in d['drawer']['moons']], sorted(b['content'] for b in d['blocks'])")"
echo "orphans of planet (planet + moons): $(curl -s "${A[@]}" $B/api/drawers/$TRIP/orphans | j "d['count']")"
echo "delete planet: $(curl -s "${A[@]}" -H X-Mutt:1 -X DELETE "$B/api/drawers/$TRIP?blocks=orphans" | j "d")"
echo "after: $(curl -s "${A[@]}" $B/api/galaxy | j "[p['title'] for p in d['planets']], [s['content'] for s in d['stars']]") moon gone $(code "${A[@]}" $B/api/drawers/$FOOD) file gone $(code "${A[@]}" $B/api/blocks/$N1)"

# A list planet's moons are lists too, and can be turned back into files.
SHOP=$(mk '{"title":"Shopping"}')
for x in milk eggs bread jam; do add $x $SHOP > /dev/null; done
OLD=$(mk "{\"title\":\"Old moon\",\"parent\":\"$SHOP\"}")
PICS=$(mk "{\"title\":\"Pictures\",\"parent\":\"$SHOP\"}")
printf '\x89PNG\r\n\x1a\n' > "$SP/a.png"
curl -s "${A[@]}" -H X-Mutt:1 -H "Content-Type: image/png" --data-binary @"$SP/a.png" "$B/api/upload?name=a.png&drawer=$PICS" > /dev/null
curl -s "${A[@]}" "${J[@]}" -X PATCH $B/api/drawers/$SHOP -d '{"modes":{"list":{"marker":"dash"}}}' > /dev/null
echo "listify: $(curl -s "${A[@]}" "${J[@]}" -X POST $B/api/drawers/$SHOP/listify -d '{}' | j "d['drawer']['modes']['list']['on'], d['drawer']['modes']['list']['type']")"
echo "existing moons after (empty one on, pictures one off): $(curl -s "${A[@]}" $B/api/drawers/$OLD | j "d['drawer']['modes'].get('list', {}).get('on'), d['drawer']['modes'].get('list', {}).get('marker')") $(curl -s "${A[@]}" $B/api/drawers/$PICS | j "d['drawer']['modes'].get('list')")"
NEW=$(curl -s "${A[@]}" "${J[@]}" -X POST $B/api/drawers -d "{\"title\":\"Next week\",\"parent\":\"$SHOP\"}" | tee "$SP/lmoon.json" | j "d['drawer']['id']")
echo "new moon is a list: $(j "d['drawer']['modes']['list']['on'], d['drawer']['modes']['list']['marker'], d['drawer']['modes']['list']['type']" < "$SP/lmoon.json")"
echo "its signs: $(curl -s "${A[@]}" $B/api/drawers/$NEW/modes | j "d['list']['fits'], d['list']['signs']")"
echo "turn off: $(curl -s "${A[@]}" "${J[@]}" -X PATCH $B/api/drawers/$NEW -d '{"modes":{"list":{"on":false,"dismissed":true}}}' | j "d['drawer']['modes']['list']['on']") still offered in menu: $(curl -s "${A[@]}" $B/api/drawers/$NEW/modes | j "d['list']['fits']")"
echo "pictures moon signs: $(curl -s "${A[@]}" $B/api/drawers/$PICS/modes | j "d['list']['fits']")"
PLAIN=$(mk '{"title":"Plain"}'); BODY="{\"title\":\"x\",\"parent\":\"$PLAIN\"}"
echo "moon of a plain planet: $(curl -s "${A[@]}" "${J[@]}" -X POST $B/api/drawers -d "$BODY" | j "d['drawer']['modes']")"
