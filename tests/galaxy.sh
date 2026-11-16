#!/bin/bash
SP="$1"; B=localhost:${MUTT_TEST_PORT:-8099}
. "$(dirname "$0")/lib.sh"
J=(-H Content-Type:application/json -H X-Mutt:1)
A=(-b "$SP/ga.txt" -c "$SP/ga.txt"); U=(-b "$SP/gb.txt" -c "$SP/gb.txt"); W=(-b "$SP/gc.txt" -c "$SP/gc.txt")
rm -f "$SP/ga.txt" "$SP/gb.txt" "$SP/gc.txt"
j() { python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"; }
curl -s "${A[@]}" "${J[@]}" -X POST $B/api/auth/signup -d '{"username":"alma","pin":"135793"}' > /dev/null
old_code "$SP" alma 1357  # alma signed up before codes were 6 digits
curl -s "${U[@]}" "${J[@]}" -X POST $B/api/auth/signup -d '{"username":"bo","pin":"246893"}' > /dev/null
curl -s "${W[@]}" "${J[@]}" -X POST $B/api/auth/signup -d '{"username":"cy","pin":"111193"}' > /dev/null
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
# "Others can add files" only ever goes with Public.
echo "others can add, on a private planet (expect refused): $(curl -s "${A[@]}" "${J[@]}" -X PATCH $B/api/drawers/$PRIV -d '{"community":true}' | j "d.get('error')")  new: $(status "${A[@]}" "${J[@]}" -X POST $B/api/drawers -d '{"title":"No","visibility":"people","community":true}')"
SWAP=$(mk '{"title":"Swap","visibility":"public","community":true}')
curl -s -o /dev/null "${U[@]}" "${J[@]}" -X POST $B/api/blocks -d "{\"content\":\"bo's swap\",\"drawer\":\"$SWAP\"}"
echo "open planet made private: $(curl -s "${A[@]}" "${J[@]}" -X PATCH $B/api/drawers/$SWAP -d '{"visibility":"private"}' | j "d['drawer']['community'], d['drawer']['count']")"
rule "a planet stayed open to all after it was made private" "$(status "${U[@]}" $B/api/drawers/$SWAP)" 404
curl -s -o /dev/null "${A[@]}" "${J[@]}" -X DELETE $B/api/drawers/$SWAP
echo "locked body: $(curl -s "${U[@]}" $B/api/drawers/$PIN | j "d.get('locked'), d.get('owner'), d['drawer']['title']")"
LOGIN_CODE="{\"pin\":\"1357\",\"drawer\":\"$PIN\"}"; RIGHT_CODE="{\"pin\":\"4242\",\"drawer\":\"$PIN\"}"
code() { curl -s -o /dev/null -w '%{http_code}' "${U[@]}" "${J[@]}" -X POST $B/api/galaxy/alma/unlock -d "$1"; }
echo "no planet code yet: $(curl -s "${U[@]}" "${J[@]}" -X POST $B/api/galaxy/alma/unlock -d "$LOGIN_CODE" | j "d['error'], d.get('noCode')")"
echo "sign-in code as planet code: $(curl -s "${A[@]}" "${J[@]}" -X PUT $B/api/drawers/$PIN/code -d '{"code":"1357"}' | j "d['error']")"
echo "bad planet code: $(curl -s -o /dev/null -w '%{http_code}' "${A[@]}" "${J[@]}" -X PUT $B/api/drawers/$PIN/code -d '{"code":"12a4"}')"
echo "bo sets alma's code: $(curl -s -o /dev/null -w '%{http_code}' "${U[@]}" "${J[@]}" -X PUT $B/api/drawers/$PIN/code -d '{"code":"4242"}')"
echo "set planet code: $(curl -s "${A[@]}" "${J[@]}" -X PUT $B/api/drawers/$PIN/code -d '{"code":"4242"}' | j "d['drawer']['hasCode'], 'shareHash' in d['drawer']")"
echo "change to a 4-digit code: $(curl -s "${A[@]}" "${J[@]}" -X POST $B/api/me/pin -d '{"current":"1357","next":"4242"}' | j "d['error']")"
echo "change to an easy code: $(curl -s "${A[@]}" "${J[@]}" -X POST $B/api/me/pin -d '{"current":"1357","next":"121212"}' | j "d['error']")"
echo "bo sees hasCode: $(curl -s "${U[@]}" $B/api/galaxy/alma | j "[(p['title'], p.get('locked', False), p['hasCode']) for p in d['planets']]")"
echo "wrong code: $(code '{"pin":"0000"}')"
echo "alma's sign-in code no longer opens it: $(code "$LOGIN_CODE") then pin $(curl -s -o /dev/null -w '%{http_code}' "${U[@]}" $B/api/drawers/$PIN)"
echo "unlock: $(curl -s "${U[@]}" "${J[@]}" -X POST $B/api/galaxy/alma/unlock -d "$RIGHT_CODE" | j "d['opened'] == ['$PIN'], [(p['title'], p.get('locked', False)) for p in d['planets']]")"
echo "cy still locked: $(curl -s -o /dev/null -w '%{http_code}' "${W[@]}" $B/api/drawers/$PIN)"
curl -s -o /dev/null "${A[@]}" "${J[@]}" -X PUT $B/api/drawers/$PIN/code -d '{"code":"8080"}'
echo "after code change: pin $(curl -s -o /dev/null -w '%{http_code}' "${U[@]}" $B/api/drawers/$PIN) old code $(code '{"pin":"4242"}') new code $(code '{"pin":"8080"}')"
echo "alma signs in still: $(curl -s -o /dev/null -w '%{http_code}' -c "$SP/gx.txt" "${J[@]}" -X POST $B/api/auth/login -d '{"username":"alma","pin":"1357"}')"
echo "asked to pick a longer code: alma $(curl -s -b "$SP/gx.txt" $B/api/me | j "d['user']['oldCode']") bo $(curl -s "${J[@]}" -X POST $B/api/auth/login -d '{"username":"bo","pin":"246893"}' | j "d['user']['oldCode']")"
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
# how used a planet is: busy when just made or added to; someone who can't open it is told nothing
echo "use, own: $(curl -s "${A[@]}" $B/api/galaxy | j "sorted({p.get('use') for p in d['planets']})")"
echo "use for a visitor, as locked then told: $(curl -s "${U[@]}" $B/api/galaxy/alma | j "sorted([bool(p.get('locked')), 'use' in p] for p in d['planets'])")"
LAY="{\"planets\":[{\"id\":\"$PUB\",\"x\":5,\"y\":5}]}"; echo "bo moves alma's: $(L "${U[@]}")"
LAY="{\"planets\":[{\"id\":\"$PUB\",\"x\":\"far\",\"y\":5}]}"; echo "bad number: $(L "${A[@]}")"
LAY='{"planets":[]}'; echo "empty list: $(L "${A[@]}")"
echo "after bad: $(curl -s "${A[@]}" $B/api/galaxy | j "[(p['x'], p['y']) for p in d['planets'] if p['x'] is not None]")"
LAY='{"reset":true}'; echo "reset: $(L "${A[@]}")"
echo "after reset: $(curl -s "${A[@]}" $B/api/galaxy | j "[(p['x'], p['y']) for p in d['planets']]")"
# nearness: visits (once an hour) and saves pull a galaxy closer in your universe; only your own pulls show
echo "near, bo (visited alma, saved one file): $(curl -s "${U[@]}" $B/api/galaxies | j "[(g['username'], round(g['near'], 1)) for g in d['galaxies']]")"
echo "near, cy (visited alma): $(curl -s "${W[@]}" $B/api/galaxies | j "[(g['username'], round(g['near'], 1)) for g in d['galaxies']]")"
echo "near, alma (visited no one): $(curl -s "${A[@]}" $B/api/galaxies | j "[(g['username'], g['near']) for g in d['galaxies']]")"
# files on more than one planet: threads between planets, "also on", galaxies that share files
for d in $PRIV $PPL; do curl -s -o /dev/null "${A[@]}" "${J[@]}" -X POST $B/api/blocks/$NPUB/connections -d "{\"drawer\":\"$d\"}"; done
names() { j "sorted(tuple(sorted(({p['id']: p['title'] for p in d['planets']}[t['a']], {p['id']: p['title'] for p in d['planets']}[t['b']]))) + (t['n'],) for t in d['threads'])"; }
echo "threads, own: $(curl -s "${A[@]}" $B/api/galaxy | names)"
echo "threads bo sees (on Gifts' list, not Diary): $(curl -s "${U[@]}" $B/api/galaxy/alma | names)  cy: $(curl -s "${W[@]}" $B/api/galaxy/alma | j "d['threads']")"
rule "a thread led to a private planet a visitor can't see" "$(curl -s "${U[@]}" $B/api/galaxy/alma | j "'$PRIV' in json.dumps(d['threads'])")" False
also() { j "[(b['content'], [p['title'] for p in b.get('alsoOn', [])]) for b in d['blocks'] if b.get('alsoOn')]"; }
echo "also on, own: $(curl -s "${A[@]}" $B/api/drawers/$PUB | also)  bo: $(curl -s "${U[@]}" $B/api/drawers/$PUB | also)  cy: $(curl -s "${W[@]}" $B/api/drawers/$PUB | also)"
BOP=$(curl -s "${U[@]}" "${J[@]}" -X POST $B/api/drawers -d '{"title":"Kept"}' | j "d['drawer']['id']")
curl -s -o /dev/null "${U[@]}" "${J[@]}" -X POST $B/api/blocks/$NPUB/save -d "{\"drawer\":\"$BOP\"}"
echo "galaxies sharing files, as cy sees: $(curl -s "${W[@]}" $B/api/galaxies | j "d['links']")"
curl -s -o /dev/null "${U[@]}" "${J[@]}" -X PATCH $B/api/drawers/$BOP -d '{"visibility":"private"}'
echo "after bo's planet goes private, cy: $(curl -s "${W[@]}" $B/api/galaxies | j "d['links']")  bo: $(curl -s "${U[@]}" $B/api/galaxies | j "d['links']")"
# a new planet is a kind its owner's galaxy doesn't show yet; only after all twelve does one repeat
for n in 1 2 3 4 5 6 7 8 9 10 11 12 13 14; do curl -s -o /dev/null "${W[@]}" "${J[@]}" -X POST $B/api/drawers -d "{\"title\":\"World $n\"}"; done
echo "fresh kinds, cy: $(curl -s "${W[@]}" $B/api/galaxy | j "sorted([p['look'] for p in d['planets']])")"
# who made a file, who saved it and from whom, and whose planets its copies are on; the thread follows a save even to a star
curl -s -o /dev/null "${U[@]}" "${J[@]}" -X PATCH $B/api/drawers/$BOP -d '{"visibility":"public"}'
BOC=$(curl -s "${U[@]}" "${J[@]}" -X POST $B/api/blocks/$NPUB/save -d '{}' | j "d['block']['id']")
story() { j "(lambda s: (s.get('madeBy', {}).get('username'), s.get('savedBy', {}).get('username'), s.get('savedFrom', {}).get('username'), sorted((p['by']['username'], p.get('title') or 'star') for p in s['elsewhere'])))(d['block']['story'])"; }
echo "story, bo's copy as bo sees it: $(curl -s "${U[@]}" $B/api/blocks/$BOC | story)  as cy: $(curl -s "${W[@]}" $B/api/blocks/$BOC | story)"
CYC=$(curl -s "${W[@]}" "${J[@]}" -X POST $B/api/blocks/$BOC/save -d '{}' | j "d['block']['id']")
echo "cy saves bo's copy as a star, made by: $(curl -s "${W[@]}" $B/api/blocks/$CYC | j "d['block']['meta']['madeBy']['username']")  story: $(curl -s "${W[@]}" $B/api/blocks/$CYC | story)"
echo "story, the first as alma sees it: $(curl -s "${A[@]}" $B/api/blocks/$NPUB | story)  as cy: $(curl -s "${W[@]}" $B/api/blocks/$NPUB | story)"
rule "someone else's copy kept as a star showed to others" "$(curl -s "${A[@]}" $B/api/blocks/$NPUB | j "'$CYC' in json.dumps(d['block']['story'])")" False
echo "threads after cy saves as a star, cy sees: $(curl -s "${W[@]}" $B/api/galaxies | j "d['links']")  alma: $(curl -s "${A[@]}" $B/api/galaxies | j "d['links']")"
# constellations: a few stars joined in your sky, only ever yours; the files stay stars
st() { curl -s "${A[@]}" "${J[@]}" -X POST $B/api/blocks -d "{\"content\":\"$1\"}" | j "d['block']['id']"; }
S1=$(st "sky one"); S2=$(st "sky two"); S3=$(st "sky three"); S4=$(st "sky four")
cons() { curl -s "${A[@]}" $B/api/galaxy | j "[(c['title'], len(c['stars']), c['dismissed']) for c in d['constellations']]"; }
C=$(curl -s "${A[@]}" "${J[@]}" -X POST $B/api/constellations -d "{\"stars\":[\"$S1\",\"$S2\"],\"title\":\"  \"}" | j "d['constellation']['id']")
echo "constellation made, empty name: $(cons)  stars still stars: $(curl -s "${A[@]}" $B/api/galaxy | j "sorted(s['content'] for s in d['stars'] if s['content'].startswith('sky'))")"
echo "renamed: $(curl -s "${A[@]}" "${J[@]}" -X PATCH $B/api/constellations/$C -d '{"title":"Sailing"}' | j "d['constellation']['title']")  stars added: $(curl -s "${A[@]}" "${J[@]}" -X POST $B/api/constellations/$C/stars -d "{\"block\":\"$S3\"}" | j "len(d['constellation']['stars'])")"
echo "a planet's file can't join: $(status "${A[@]}" "${J[@]}" -X POST $B/api/constellations/$C/stars -d "{\"block\":\"$NPUB\"}")  one star alone: $(status "${A[@]}" "${J[@]}" -X POST $B/api/constellations -d "{\"stars\":[\"$S4\"]}")"
rule "someone else could add to a constellation" "$(status "${U[@]}" "${J[@]}" -X POST $B/api/constellations/$C/stars -d "{\"block\":\"$S4\"}")" 404
rule "a visitor's view of a galaxy showed its constellations" "$(curl -s "${U[@]}" $B/api/galaxy/alma | j "'constellations' in d or 'Sailing' in json.dumps(d)")" False
curl -s -o /dev/null "${A[@]}" "${J[@]}" -X DELETE $B/api/blocks/$S3
echo "a deleted star leaves: $(cons)"
curl -s -o /dev/null "${A[@]}" "${J[@]}" -X POST $B/api/blocks/$S3/restore
echo "restored, it's back: $(cons)  stats count them as stars: $(curl -s "${A[@]}" $B/api/galaxy | j "d['stats']['stars']")"
echo "one taken out: $(curl -s "${A[@]}" "${J[@]}" -X DELETE $B/api/constellations/$C/stars/$S3 | j "[len(c['stars']) for c in d['constellations']]")  waved the offer away: $(curl -s "${A[@]}" "${J[@]}" -X PATCH $B/api/constellations/$C -d '{"dismissed":true}' | j "d['constellation']['dismissed']")"
curl -s -o /dev/null "${A[@]}" "${J[@]}" -X POST $B/api/blocks/$S2/connections -d "{\"drawer\":\"$PUB\"}"
echo "a star put on a planet leaves, and one left alone ends it: $(cons)"
C=$(curl -s "${A[@]}" "${J[@]}" -X POST $B/api/constellations -d "{\"stars\":[\"$S1\",\"$S3\",\"$S4\"],\"title\":\"Boats\"}" | j "d['constellation']['id']")
P=$(curl -s "${A[@]}" "${J[@]}" -X POST $B/api/constellations/$C/planet -d '{}')
echo "became a planet: $(echo "$P" | j "d['drawer']['title'], d['drawer']['count'], d['drawer']['visibility'], d['constellations']")  its files, in order: $(curl -s "${A[@]}" $B/api/drawers/$(echo "$P" | j "d['drawer']['id']") | j "[b['content'] for b in d['blocks']]")"
echo "no longer stars: $(curl -s "${A[@]}" $B/api/galaxy | j "[s['content'] for s in d['stars'] if s['content'].startswith('sky')]")"
C=$(curl -s "${A[@]}" "${J[@]}" -X POST $B/api/constellations -d "{\"stars\":[\"$(st "x one")\",\"$(st "x two")\"]}" | j "d['constellation']['id']")
echo "broken up: $(curl -s "${A[@]}" "${J[@]}" -X DELETE $B/api/constellations/$C | j "d['constellations']")"
# Comets (DESIGN.md "Comets"): the days a note names, read from when it was written (a Monday, 10:00)
echo "comet days: $(python3 -c "
import sys; sys.path.insert(0, '$(dirname "$0")/..')
from datetime import datetime; from mutt import when
w = datetime(2026, 11, 16, 10, 0)
for t in ['Dentist Thursday 3pm', 'Rae birthday 24 Nov', 'flight 2 Dec 07:40', 'call the vet tomorrow at 4:30pm', 'today 4pm haircut',
          'Sat 10am parkrun', 'meeting Mon 23 Nov 9:30', 'renew passport by 3/2/2027', 'in 2 weeks: seedlings', 'Mum b-day 3 Jan',
          'May 3 garden show', 'next Monday notes', 'next Tuesday vet 10am', 'next Saturday market',
          'today I felt calm', 'Pilates every Tuesday 6pm', 'sat on the step in the sun', 'Sun cream', '16 Nov: ran 5k',
          '1/2 cup sugar, bake at 180', 'the light at 6pm on the bridge', 'Day 1: flour', 'Monday notes from the meeting', 'it may 3 times']:
    print(t + ' = ' + (', '.join(f['day'].isoformat() + (' ' + f['time'] if f['time'] else '') + (' yearly' if f['yearly'] else '') for f in when.read(t, w)) or '-'), end='; ')
")"
# A note doesn't become a comet by itself: writing a day offers it (a moment mode), and pressing it makes it one.
CN=$(curl -s "${A[@]}" "${J[@]}" -X POST $B/api/blocks -d '{"content":"Dentist tomorrow 3pm, ask about the crown"}' | j "d['block']['id']")
echo "no comet by itself: $(curl -s "${A[@]}" "$B/api/comets" | j "len(d['comets'])")  offered: $(curl -s "${A[@]}" "${J[@]}" -X POST $B/api/moment -d '{"text":"Dentist tomorrow 3pm","tz":0}' | j "(d['comet']['fits'], d['comet']['say'])")  not for a plain note: $(curl -s "${A[@]}" "${J[@]}" -X POST $B/api/moment -d '{"text":"the light on the bridge","tz":0}' | j "d['comet']['fits']")"
echo "made a comet: $(curl -s "${A[@]}" "${J[@]}" -X POST $B/api/blocks/$CN/comet -d '{"tz":0}' | j "(lambda c: (c['title'], c['time'], c['said'], c['due'], (c['at'] - c['ahead']) // 60000))(d['comet'])")  could: $(curl -s "${A[@]}" "$B/api/blocks/$CN/comet?tz=0" | j "(d['comet'] is not None, d['could']['said'])")"
LIST=$(mk '{"title":"Errands"}')
CL=$(add "post the parcel tomorrow" $LIST)
echo "a day alone: $(curl -s "${A[@]}" "${J[@]}" -X POST $B/api/blocks/$CL/comet -d '{"tz":60}' | j "(lambda c: (c['time'], (c['at'] - c['ahead']) // 3600000))(d['comet'])")"
echo "comets: $(curl -s "${A[@]}" "$B/api/comets" | j "[(c['title'], c['planet'] == '$LIST') for c in d['comets']]")"
# a list says which of its items are comets and which name a day and could be (each item's menu offers it)
add "milk" $LIST >/dev/null; CB=$(add "return the books Friday" $LIST)
echo "a list's comets: $(curl -s "${A[@]}" "$B/api/drawers/$LIST/comets?tz=0" | j "(list(d['comets']) == ['$CL'], d['could'] == ['$CB'])")"
rule "someone saw which of another's list items are comets" "$(status "${U[@]}" "$B/api/drawers/$LIST/comets?tz=0")" "404"
curl -s -o /dev/null "${A[@]}" "${J[@]}" -X POST $B/api/drawers/$LIST/check -d "{\"block\":\"$CL\",\"checked\":true}"
echo "ticked off, its comet gone: $(curl -s "${A[@]}" "$B/api/comets" | j "[c['title'] for c in d['comets']]")"
curl -s -o /dev/null "${A[@]}" "${J[@]}" -X PATCH $B/api/blocks/$CN -d '{"content":"Dentist in 3 days 4pm, ask about the crown"}'
echo "follows its words: $(curl -s "${A[@]}" "$B/api/comets" | j "(d['comets'][0]['time'], d['comets'][0]['said'])")"
WAS=$(curl -s "${A[@]}" "$B/api/comets" | j "json.dumps(d['comets'][0])")
echo "snoozed: $(curl -s "${A[@]}" "${J[@]}" -X POST $B/api/blocks/$CN/comet/snooze -d '{"for":"hour"}' | j "3500000 < d['comet']['at'] - $(date +%s)000 < 3700000")  done: $(curl -s "${A[@]}" "${J[@]}" -X POST $B/api/blocks/$CN/comet/done | j "d['comet']['done'] is not None")  back: $(curl -s "${A[@]}" "${J[@]}" -X POST $B/api/blocks/$CN/comet/back -d "{\"comet\":$WAS}" | j "(d['comet']['done'], d['comet']['time'])")"
echo "calendar: $(curl -s "${A[@]}" "$B/api/blocks/$CN/comet.ics" | python3 -c "import sys; t = sys.stdin.read(); print(t.count('BEGIN:VEVENT'), t.count('BEGIN:VALARM'), 'SUMMARY:Dentist in 3 days 4pm' in t)")"
PLAIN=$(curl -s "${A[@]}" "${J[@]}" -X POST $B/api/blocks -d '{"content":"the light on the bridge"}' | j "d['block']['id']")
echo "no day, no comet: $(status "${A[@]}" "${J[@]}" -X POST $B/api/blocks/$PLAIN/comet -d '{"tz":0}')  a made-up device: $(status "${A[@]}" "${J[@]}" -X POST $B/api/push -d '{"endpoint":"https://example.com/push"}')  a real push service: $(status "${A[@]}" "${J[@]}" -X POST $B/api/push -d '{"endpoint":"https://web.push.apple.com/QAbc"}')"
curl -s -o /dev/null "${A[@]}" "${J[@]}" -X DELETE $B/api/push -d '{"endpoint":"https://web.push.apple.com/QAbc"}'
rule "someone else's comets were shown" "$(curl -s "${U[@]}" "$B/api/comets" | j "len(d['comets'])")" "0"
rule "someone could make another's note a comet" "$(status "${U[@]}" "${J[@]}" -X POST $B/api/blocks/$CN/comet -d '{"tz":0}')" "404"
rule "someone could see another's comet in a calendar" "$(status "${U[@]}" "$B/api/blocks/$CN/comet.ics")" "404"
echo "stopped: $(curl -s "${A[@]}" "${J[@]}" -X DELETE $B/api/blocks/$CN/comet | j "d['ok']") $(curl -s "${A[@]}" "$B/api/comets" | j "len(d['comets'])")"
