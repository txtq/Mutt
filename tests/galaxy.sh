#!/bin/bash
SP="$1"; B=localhost:8099
J=(-H Content-Type:application/json -H X-Mutt:1)
A=(-b "$SP/ga.txt" -c "$SP/ga.txt"); U=(-b "$SP/gb.txt" -c "$SP/gb.txt"); W=(-b "$SP/gc.txt" -c "$SP/gc.txt")
rm -f "$SP/ga.txt" "$SP/gb.txt" "$SP/gc.txt"
j() { python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"; }
curl -s "${A[@]}" "${J[@]}" -X POST $B/api/auth/signup -d '{"username":"alma","pin":"1357"}' > /dev/null
curl -s "${U[@]}" "${J[@]}" -X POST $B/api/auth/signup -d '{"username":"bo","pin":"2468"}' > /dev/null
curl -s "${W[@]}" "${J[@]}" -X POST $B/api/auth/signup -d '{"username":"cy","pin":"1111"}' > /dev/null
mk() { curl -s "${A[@]}" "${J[@]}" -X POST $B/api/drawers -d "$1" | j "d['drawer']['id']"; }
PRIV=$(mk '{"title":"Diary","visibility":"private"}')
PIN=$(mk '{"title":"Recipes"}')
PUB=$(mk '{"title":"Zines","visibility":"public"}')
PPL=$(mk '{"title":"Gifts","visibility":"people"}')
add() { curl -s "${A[@]}" "${J[@]}" -X POST $B/api/blocks -d "{\"content\":\"$1\",\"drawer\":\"$2\"}" | j "d['block']['id']"; }
NPRIV=$(add "secret" $PRIV); NPIN=$(add "soup" $PIN); NPUB=$(add "zine one" $PUB); NPPL=$(add "a scarf" $PPL)
echo "people set: $(curl -s "${A[@]}" "${J[@]}" -X PATCH $B/api/drawers/$PPL -d '{"people":["Bo"]}' | j "d['drawer']['people']")"
echo "bad person: $(curl -s "${A[@]}" "${J[@]}" -X PATCH $B/api/drawers/$PPL -d '{"people":["nobody"]}' | j "d['error']")"
echo "bad visibility: $(curl -s -o /dev/null -w '%{http_code}' "${A[@]}" "${J[@]}" -X PATCH $B/api/drawers/$PPL -d '{"visibility":"lol"}')"
STAR=$(curl -s "${A[@]}" "${J[@]}" -X POST $B/api/blocks -d '{"content":"loose thought"}' | j "d['block']['id']")
echo "own galaxy: $(curl -s "${A[@]}" $B/api/galaxy | j "[(p['title'], p['visibility'], p['count']) for p in d['planets']], [s['content'] for s in d['stars']], d['user']")"
echo "bo sees alma: $(curl -s "${U[@]}" $B/api/galaxy/alma | j "[(p['title'], p.get('locked', False), len(p.get('previews') or [])) for p in d['planets']], 'stars' in d")"
echo "cy sees alma: $(curl -s "${W[@]}" $B/api/galaxy/alma | j "[(p['title'], p.get('locked', False)) for p in d['planets']]")"
echo "bo galaxies: $(curl -s "${U[@]}" $B/api/galaxies | j "[(g['username'], g['you'], g['planets']) for g in d['galaxies']]")"
echo "bo reads: pub $(curl -s -o /dev/null -w '%{http_code}' "${U[@]}" $B/api/drawers/$PUB) ppl $(curl -s -o /dev/null -w '%{http_code}' "${U[@]}" $B/api/drawers/$PPL) pin $(curl -s -o /dev/null -w '%{http_code}' "${U[@]}" $B/api/drawers/$PIN) priv $(curl -s -o /dev/null -w '%{http_code}' "${U[@]}" $B/api/drawers/$PRIV)"
echo "cy reads ppl: $(curl -s -o /dev/null -w '%{http_code}' "${W[@]}" $B/api/drawers/$PPL)  blocks: pub $(curl -s -o /dev/null -w '%{http_code}' "${W[@]}" $B/api/blocks/$NPUB) ppl $(curl -s -o /dev/null -w '%{http_code}' "${W[@]}" $B/api/blocks/$NPPL) star $(curl -s -o /dev/null -w '%{http_code}' "${W[@]}" $B/api/blocks/$STAR)"
echo "locked body: $(curl -s "${U[@]}" $B/api/drawers/$PIN | j "d.get('locked'), d.get('owner'), d['drawer']['title']")"
echo "wrong code: $(curl -s -o /dev/null -w '%{http_code}' "${U[@]}" "${J[@]}" -X POST $B/api/galaxy/alma/unlock -d '{"pin":"0000"}')"
echo "unlock: $(curl -s "${U[@]}" "${J[@]}" -X POST $B/api/galaxy/alma/unlock -d '{"pin":"1357"}' | j "d['unlocked'], [(p['title'], p.get('locked', False)) for p in d['planets']]")"
echo "after unlock: pin $(curl -s -o /dev/null -w '%{http_code}' "${U[@]}" $B/api/drawers/$PIN) priv $(curl -s -o /dev/null -w '%{http_code}' "${U[@]}" $B/api/drawers/$PRIV) privblock $(curl -s -o /dev/null -w '%{http_code}' "${U[@]}" $B/api/blocks/$NPRIV)"
echo "bo saves public file: $(curl -s "${U[@]}" "${J[@]}" -X POST $B/api/blocks/$NPUB/save -d '{}' | j "d['block']['content'], d['block']['meta']['savedFrom']['username']")"
echo "connections bo sees: $(curl -s "${U[@]}" $B/api/blocks/$NPUB | j "[c['title'] for c in d['connections']]")"
# autosort
srt() { curl -s "${A[@]}" "${J[@]}" -X POST $B/api/blocks -d "$1" | j "(d['block']['kind'], d['sortedInto'] and (d['sortedInto']['planet']['title'], d['sortedInto']['created'], d['sortedInto']['planet']['count']))"; }
echo "sort recipe: $(srt '{"content":"best recipe for bread","autosort":true}')"
echo "sort note: $(srt '{"content":"just a thought","autosort":true}')"
echo "sort note2: $(srt '{"content":"another thought","autosort":true}')"
echo "sort no flag: $(srt '{"content":"stays a star"}')"
printf 'x' > "$SP/x.txt"
ICON='{"px":"000000000000000000001111100001111100001211100001111100001111100000000000000000000","c":"#2F6BFF"}'
EI=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$ICON")
echo "upload sort: $(curl -s "${A[@]}" -H X-Mutt:1 -H 'Content-Type: image/png' --data-binary @"$SP/x.txt" "$B/api/upload?name=holiday.png&autosort=1&icon=$EI" | j "d['block']['kind'], d['sortedInto']['planet']['title'], d['sortedInto']['created'], d['sortedInto']['planet']['icon']['c']")"
echo "upload sort 2: $(curl -s "${A[@]}" -H X-Mutt:1 -H 'Content-Type: image/png' --data-binary @"$SP/x.txt" "$B/api/upload?name=beach.png&autosort=1" | j "d['sortedInto']['planet']['title'], d['sortedInto']['created']")"
echo "stars now: $(curl -s "${A[@]}" $B/api/galaxy | j "[s['content'] for s in d['stars']], len(d['planets'])")"
echo "connect star: $(curl -s "${A[@]}" "${J[@]}" -X POST $B/api/blocks/$STAR/connections -d "{\"drawer\":\"$PUB\"}" | j "[c['title'] for c in d['connections']]")"
echo "stars after: $(curl -s "${A[@]}" $B/api/galaxy | j "[s['content'] for s in d['stars']]")"
echo "bo universe: $(curl -s "${U[@]}" $B/api/galaxies | j "[(g['username'], g['open'], g['locked'], g['files'], len(g['worlds'])) for g in d['galaxies']]")"
echo "mode pref gone: $(curl -s "${A[@]}" "${J[@]}" -X POST $B/api/me/prefs -d '{"mode":"light"}' | j "d['prefs'].get('mode')")"
echo "stats: $(curl -s "${A[@]}" $B/api/me | j "d['stats']")"
# planet looks
echo "look set: $(curl -s "${A[@]}" "${J[@]}" -X PATCH $B/api/drawers/$PUB -d '{"look":"lava"}' | j "d['drawer']['look']")"
echo "look bad: $(curl -s -o /dev/null -w '%{http_code}' "${A[@]}" "${J[@]}" -X PATCH $B/api/drawers/$PUB -d '{"look":"cheese"}')"
echo "look auto: $(curl -s "${A[@]}" "${J[@]}" -X PATCH $B/api/drawers/$PIN -d '{"look":null}' | j "d['drawer']['look']")"
# arranging planets
L() { curl -s -o /dev/null -w '%{http_code}' "$@" "${J[@]}" -X PUT $B/api/galaxy/layout -d "$LAY"; }
LAY="{\"planets\":[{\"id\":\"$PUB\",\"x\":-320.44,\"y\":180},{\"id\":\"$PIN\",\"x\":99999,\"y\":-12}]}"; echo "layout save: $(L "${A[@]}")"
echo "own layout: $(curl -s "${A[@]}" $B/api/galaxy | j "[(p['title'], p['x'], p['y'], p['look']) for p in d['planets']]")"
echo "bo sees layout: $(curl -s "${U[@]}" $B/api/galaxy/alma | j "[(p['title'], p['x'], p['y']) for p in d['planets']]")"
echo "universe layout: $(curl -s "${U[@]}" $B/api/galaxies | j "[(w['x'], w['y'], w['look']) for g in d['galaxies'] if g['username'] == 'alma' for w in g['worlds']]")"
LAY="{\"planets\":[{\"id\":\"$PUB\",\"x\":5,\"y\":5}]}"; echo "bo moves alma's: $(L "${U[@]}")"
LAY="{\"planets\":[{\"id\":\"$PUB\",\"x\":\"far\",\"y\":5}]}"; echo "bad number: $(L "${A[@]}")"
LAY='{"planets":[]}'; echo "empty list: $(L "${A[@]}")"
echo "after bad: $(curl -s "${A[@]}" $B/api/galaxy | j "[(p['x'], p['y']) for p in d['planets'] if p['x'] is not None]")"
LAY='{"reset":true}'; echo "reset: $(L "${A[@]}")"
echo "after reset: $(curl -s "${A[@]}" $B/api/galaxy | j "[(p['x'], p['y']) for p in d['planets']]")"
