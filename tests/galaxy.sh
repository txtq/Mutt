#!/bin/bash
SP="$1"; B=localhost:8099
. "$(dirname "$0")/lib.sh"
J=(-H Content-Type:application/json -H X-Mutt:1)
A=(-b "$SP/ga.txt" -c "$SP/ga.txt"); U=(-b "$SP/gb.txt" -c "$SP/gb.txt"); W=(-b "$SP/gc.txt" -c "$SP/gc.txt")
rm -f "$SP/ga.txt" "$SP/gb.txt" "$SP/gc.txt"
j() { python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"; }
curl -s "${A[@]}" "${J[@]}" -X POST $B/api/auth/signup -d '{"username":"alma","pin":"1357"}' > /dev/null
curl -s "${U[@]}" "${J[@]}" -X POST $B/api/auth/signup -d '{"username":"bo","pin":"2468"}' > /dev/null
curl -s "${W[@]}" "${J[@]}" -X POST $B/api/auth/signup -d '{"username":"cy","pin":"1111"}' > /dev/null
mk() { curl -s "${A[@]}" "${J[@]}" -X POST $B/api/drawers -d "$1" | j "d['drawer']['id']"; }
PRIV=$(mk '{"title":"Diary","visibility":"private"}')
PIN=$(mk '{"title":"Recipes","visibility":"pin"}')
NEW=$(curl -s "${A[@]}" "${J[@]}" -X POST $B/api/drawers -d '{"title":"Fresh"}')
echo "new planet default (expect public False True): $(echo "$NEW" | j "d['drawer']['visibility'], d['drawer']['community'], d['drawer']['modes'].get('shareTip')")"
NEWID=$(echo "$NEW" | j "d['drawer']['id']")
echo "tip put away: $(curl -s "${A[@]}" "${J[@]}" -X PATCH $B/api/drawers/$NEWID -d '{"modes":{"shareTip":false}}' | j "'shareTip' in d['drawer']['modes']")  tip back on (expect 400): $(curl -s -o /dev/null -w '%{http_code}' "${A[@]}" "${J[@]}" -X PATCH $B/api/drawers/$NEWID -d '{"modes":{"shareTip":true}}')"
curl -s -o /dev/null "${A[@]}" "${J[@]}" -X DELETE $B/api/drawers/$NEWID
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
echo "bo galaxies: $(curl -s "${U[@]}" $B/api/galaxies | j "[(g['username'], g['you'], g['planets'], g['open'], g['locked'], g['private']) for g in d['galaxies']]")"
echo "bo's universe worlds of alma (private ones blurred, no files): $(curl -s "${U[@]}" $B/api/galaxies | j "[(w['locked'], w['private'], w['n']) for g in d['galaxies'] if g['username'] == 'alma' for w in g['worlds']]")"
echo "bo reads: pub $(curl -s -o /dev/null -w '%{http_code}' "${U[@]}" $B/api/drawers/$PUB) ppl $(curl -s -o /dev/null -w '%{http_code}' "${U[@]}" $B/api/drawers/$PPL) pin $(curl -s -o /dev/null -w '%{http_code}' "${U[@]}" $B/api/drawers/$PIN) priv $(curl -s -o /dev/null -w '%{http_code}' "${U[@]}" $B/api/drawers/$PRIV)"
echo "cy reads ppl: $(curl -s -o /dev/null -w '%{http_code}' "${W[@]}" $B/api/drawers/$PPL)  blocks: pub $(curl -s -o /dev/null -w '%{http_code}' "${W[@]}" $B/api/blocks/$NPUB) ppl $(curl -s -o /dev/null -w '%{http_code}' "${W[@]}" $B/api/blocks/$NPPL) star $(curl -s -o /dev/null -w '%{http_code}' "${W[@]}" $B/api/blocks/$STAR)"
rule "a visitor could open a private planet" "$(status "${U[@]}" $B/api/drawers/$PRIV)" 404
rule "a visitor could read a file on a private planet" "$(status "${U[@]}" $B/api/blocks/$NPRIV)" 404
rule "a Code planet opened without its code" "$(status "${U[@]}" $B/api/drawers/$PIN)" 403
rule "someone not on a People planet's list could open it" "$(status "${W[@]}" $B/api/drawers/$PPL)" 404
rule "a visitor could read someone's star" "$(status "${W[@]}" $B/api/blocks/$STAR)" 404
rule "a private planet's name showed in a visitor's view of the galaxy" "$(curl -s "${U[@]}" $B/api/galaxy/alma | j "'Diary' in json.dumps(d)")" False
rule "someone signed out could read a galaxy" "$(status $B/api/galaxy/alma)" 401
echo "locked body: $(curl -s "${U[@]}" $B/api/drawers/$PIN | j "d.get('locked'), d.get('owner'), d['drawer']['title']")"
LOGIN_CODE="{\"pin\":\"1357\",\"drawer\":\"$PIN\"}"; RIGHT_CODE="{\"pin\":\"4242\",\"drawer\":\"$PIN\"}"
code() { curl -s -o /dev/null -w '%{http_code}' "${U[@]}" "${J[@]}" -X POST $B/api/galaxy/alma/unlock -d "$1"; }
echo "no planet code yet: $(curl -s "${U[@]}" "${J[@]}" -X POST $B/api/galaxy/alma/unlock -d "$LOGIN_CODE" | j "d['error'], d.get('noCode')")"
echo "sign-in code as planet code: $(curl -s "${A[@]}" "${J[@]}" -X PUT $B/api/drawers/$PIN/code -d '{"code":"1357"}' | j "d['error']")"
echo "bad planet code: $(curl -s -o /dev/null -w '%{http_code}' "${A[@]}" "${J[@]}" -X PUT $B/api/drawers/$PIN/code -d '{"code":"12a4"}')"
echo "bo sets alma's code: $(curl -s -o /dev/null -w '%{http_code}' "${U[@]}" "${J[@]}" -X PUT $B/api/drawers/$PIN/code -d '{"code":"4242"}')"
echo "set planet code: $(curl -s "${A[@]}" "${J[@]}" -X PUT $B/api/drawers/$PIN/code -d '{"code":"4242"}' | j "d['drawer']['hasCode'], 'shareHash' in d['drawer']")"
echo "sign-in code to a planet's: $(curl -s "${A[@]}" "${J[@]}" -X POST $B/api/me/pin -d '{"current":"1357","next":"4242"}' | j "d['error']")"
echo "bo sees hasCode: $(curl -s "${U[@]}" $B/api/galaxy/alma | j "[(p['title'], p.get('locked', False), p['hasCode']) for p in d['planets']]")"
echo "wrong code: $(code '{"pin":"0000"}')"
echo "alma's sign-in code no longer opens it: $(code "$LOGIN_CODE") then pin $(curl -s -o /dev/null -w '%{http_code}' "${U[@]}" $B/api/drawers/$PIN)"
echo "unlock: $(curl -s "${U[@]}" "${J[@]}" -X POST $B/api/galaxy/alma/unlock -d "$RIGHT_CODE" | j "d['opened'] == ['$PIN'], [(p['title'], p.get('locked', False)) for p in d['planets']]")"
echo "cy still locked: $(curl -s -o /dev/null -w '%{http_code}' "${W[@]}" $B/api/drawers/$PIN)"
curl -s -o /dev/null "${A[@]}" "${J[@]}" -X PUT $B/api/drawers/$PIN/code -d '{"code":"8080"}'
echo "after code change: pin $(curl -s -o /dev/null -w '%{http_code}' "${U[@]}" $B/api/drawers/$PIN) old code $(code '{"pin":"4242"}') new code $(code '{"pin":"8080"}')"
echo "alma signs in still: $(curl -s -o /dev/null -w '%{http_code}' -c "$SP/gx.txt" "${J[@]}" -X POST $B/api/auth/login -d '{"username":"alma","pin":"1357"}')"
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
