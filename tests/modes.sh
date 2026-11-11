#!/bin/bash
# The mode registry (mutt/modes.py): every mode's settings checked one way,
# every mode's signs from one place, and the two bars: a planet switches a
# mode on at the higher one and keeps it down to the lower one. Then the
# moment modes (what's being written right now).
# (No {a, b} in the python snippets: old bash expands braces inside $(...).)
SP="$1"; B=localhost:8099
J=(-H Content-Type:application/json -H X-Mutt:1); C=(-b "$SP/c.txt" -c "$SP/c.txt")
j() { python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"; }
curl -s "${C[@]}" "${J[@]}" -X POST $B/api/auth/signup -d '{"username":"maker","pin":"482193"}' >/dev/null
planet() { curl -s "${C[@]}" "${J[@]}" -X POST $B/api/drawers -d "{\"title\":\"$1\"}" | j "d['drawer']['id']"; }
note() { curl -s "${C[@]}" "${J[@]}" -X POST $B/api/blocks -d "$(python3 -c "import json,sys; print(json.dumps(dict(content=sys.argv[2], drawer=sys.argv[1])))" "$1" "$2")" | j "d['block']['id']"; }
signs() { curl -s "${C[@]}" $B/api/drawers/$1/modes | j "$2"; }
mode() { curl -s "${C[@]}" "${J[@]}" -X PATCH $B/api/drawers/$1 -d "{\"modes\":$2}" | j "${3:-d['drawer']['modes']}"; }

echo "-- every mode from one place"
E=$(planet "Empty")
echo "modes reported: $(signs $E "sorted(d)")"
echo "how each arrives: $(signs $E "sorted([k + ': ' + v['arrives'] for k, v in d.items()])")"
echo "nothing fits an empty planet: $(signs $E "[k for k, v in d.items() if v['fits']]")"

echo "-- settings, all checked one way"
echo "unknown setting: $(mode $E '{"reading":{"colour":"red"}}' "d['error']")"
echo "wrong kind of value: $(mode $E '{"reading":{"on":"yes"}}' "d['error']")"
echo "list limit can't be a switch: $(mode $E '{"list":{"limit":true}}' "d['error']")"
echo "list keeps its defaults: $(mode $E '{"list":{"marker":"star"}}' "d['drawer']['modes']['list']")"
echo "a mode nobody knows is left alone: $(mode $E '{"teleport":{"on":true}}' "sorted(d['drawer']['modes'])")"
M=$(curl -s "${C[@]}" "${J[@]}" -X POST $B/api/drawers -d "{\"title\":\"Side\",\"parent\":\"$E\"}" | j "d['drawer']['id']")
echo "a moon can't be a cookbook: $(mode $M '{"cookbook":{"on":true}}' "d['error']")"
echo "a moon can be a list: $(mode $M '{"list":{"on":true}}' "d['drawer']['modes']['list']['on']")"
echo "moon's modes reported: $(signs $M "sorted(d)")"

echo "-- list: on at its own rule, stays down to 40%"
L=$(planet "Bits")
for t in "oat milk" "bin bags" "stamps" "light bulbs" "tea"; do note $L "$t" >/dev/null; done
LF="(d['list']['fits'], round(d['list']['share'], 2), d['list'].get('left', False))"
PROSE="I walked down to the river this morning and the light was low and gold over the water. Nobody else was there and I stayed a long while."
echo "5 short things: $(signs $L "$LF")"
for i in 1 2 3 4; do note $L "$PROSE ($i)" >/dev/null; done
echo "5 of 9 (56%), never answered: $(signs $L "$LF")"
echo "waved away: $(mode $L '{"list":{"dismissed":true}}' "d['drawer']['modes']['list']['dismissed']")"
echo "5 of 9 (56%), answered: $(signs $L "$LF")"
for i in 5 6 7 8; do note $L "$PROSE ($i)" >/dev/null; done
echo "5 of 13 (38%), answered: $(signs $L "$LF")"
echo "turned on anyway: $(mode $L '{"list":{"on":true}}' "d['drawer']['modes']['list']['on']") -> under the lower bar, so it offers to step back: $(signs $L "$LF")"
echo "kept: $(mode $L '{"list":{"kept":true}}' "d['drawer']['modes']['list']['kept']") -> $(signs $L "$LF")"

echo "-- the moment modes: what's being written now"
m() { curl -s "${C[@]}" "${J[@]}" -X POST $B/api/moment -d "$(python3 -c "import json,sys; print(json.dumps(dict(text=sys.argv[1] * int(sys.argv[2]), held=sys.argv[3].split(), drawer=sys.argv[4] or None)))" "$1" "$2" "$3" "$4")" | j "d.get('writing')"; }
S="The harbour was quiet when we came in and the gulls were asleep along the wall. "
echo "a short note: $(m "$S" 2 "" "")"
echo "650 characters, new: $(m "$S" 8 "" "")"
echo "650 characters, already showing: $(m "$S" 8 "writing" "")"
echo "320 characters, already showing: $(m "$S" 4 "writing" "")"
echo "960 characters, new: $(m "$S" 12 "" "")"
echo "1,300 characters: $(m "$S" 16 "" "")"
echo "a long list isn't writing: $(m "- eggs, milk, tea, jam, rice
" 60 "" "")"
echo "waved away on a planet: $(mode $L '{"writing":{"dismissed":true}}' "d['drawer']['modes']['writing']") -> $(m "$S" 16 "" "$L")"
echo "no text: $(curl -s "${C[@]}" "${J[@]}" -X POST $B/api/moment -d '{}' | j "d['error']")"
