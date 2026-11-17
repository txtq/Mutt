#!/bin/bash
# The mode registry (mutt/modes.py): every mode's settings checked one way,
# every mode's signs from one place, and the two bars: a planet switches a
# mode on at the higher one and keeps it down to the lower one. Then the
# moment modes (what's being written right now).
# (No {a, b} in the python snippets: old bash expands braces inside $(...).)
SP="$1"; B=localhost:${MUTT_TEST_PORT:-8099}
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

echo "-- list: on at its own rule (half), stays down to 40%"
L=$(planet "Bits")
for t in "oat milk" "bin bags" "stamps" "light bulbs" "tea"; do note $L "$t" >/dev/null; done
LF="(d['list']['fits'], round(d['list']['share'], 2), d['list'].get('left', False))"
PROSE="I walked down to the river this morning and the light was low and gold over the water. Nobody else was there and I stayed a long while."
echo "5 short things: $(signs $L "$LF")"
for i in 1 2 3 4 5 6; do note $L "$PROSE ($i)" >/dev/null; done
echo "5 of 11 (45%), never answered: $(signs $L "$LF")"
echo "waved away: $(mode $L '{"list":{"dismissed":true}}' "d['drawer']['modes']['list']['dismissed']")"
echo "5 of 11 (45%), answered: $(signs $L "$LF")"
for i in 7 8; do note $L "$PROSE ($i)" >/dev/null; done
echo "5 of 13 (38%), answered: $(signs $L "$LF")"
echo "turned on anyway: $(mode $L '{"list":{"on":true}}' "d['drawer']['modes']['list']['on']") -> under the lower bar, so it offers to step back: $(signs $L "$LF")"
echo "kept: $(mode $L '{"list":{"kept":true}}' "d['drawer']['modes']['list']['kept']") -> $(signs $L "$LF")"
T=$(planet "Odds")
for t in "oat milk" "stamps" "call the bank"; do note $T "$t" >/dev/null; done
echo "3 short things are a list: $(signs $T "(d['list']['fits'], d['list']['signs'])")"

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

echo "-- split into moons (two clearly different things, each 25%+ and 4+ files)"
SF="(d['split']['fits'], d['split']['share'], d['split']['count'], [(g['name'], g['count'], g['stays']) for g in d['split']['groups']])"
W=$(planet "Weekends")
for i in 1 2 3; do note $W "Bouldering session $i at the crag, crimps and chalk" >/dev/null; note $W "Threw bowls on the wheel ($i), glaze in the kiln" >/dev/null; done
echo "3 and 3 (too few): $(signs $W "$SF")"
for i in 4 5 6 7 8 9 10 11 12 13; do note $W "Bouldering session $i at the crag, crimps and chalk" >/dev/null; done
P4=$(note $W "Threw bowls on the wheel (4), glaze in the kiln")
note $W "call the plumber about the tap" >/dev/null
echo "13 and 4 of 18 (22%): $(signs $W "$SF")"
for i in 1 2; do curl -s -o /dev/null "${C[@]}" -H X-Mutt:1 -X DELETE $B/api/blocks/$(curl -s "${C[@]}" $B/api/drawers/$W | j "[b['id'] for b in d['blocks'] if b['content'].startswith('Bouldering')][0]"); done
echo "11 and 4 of 16 (25%): $(signs $W "$SF")"
echo "its signs: $(signs $W "d['split']['signs']")"
echo "it can't be switched on: $(mode $W '{"split":{"on":true}}' "d['error']")"
echo "split waved away: $(mode $W '{"split":{"dismissed":true}}' "d['drawer']['modes']['split']")"
BEFORE=$(curl -s "${C[@]}" $B/api/drawers/$W | j "[b['id'] for b in d['blocks']]")
echo "split it: $(curl -s "${C[@]}" "${J[@]}" -X POST $B/api/drawers/$W/split -d '{}' | j "d['drawer']['count'], [(m['title'], m['count'], m['visibility']) for m in d['drawer']['moons']], sorted(len(v) for v in d['moved'].values())")"
echo "left on the planet: $(curl -s "${C[@]}" $B/api/drawers/$W | j "[b['content'] for b in d['blocks']]") $(signs $W "d['split']['fits']")"
MOON=$(curl -s "${C[@]}" $B/api/drawers/$W | j "d['drawer']['moons'][0]['id']")
echo "what moved stays on the server: $(curl -s "${C[@]}" $B/api/drawers/$W | j "d['drawer']['modes']['split']")"
echo "a moon is never offered a split: $(signs $MOON "'split' in d")"
echo "undo: $(curl -s "${C[@]}" "${J[@]}" -X POST $B/api/drawers/$W/split/undo -d '{}' | j "d['drawer']['count'], d['drawer']['moons'], len(d['blocks']), len(d['back'])")"
echo "back in their places: $(curl -s "${C[@]}" $B/api/drawers/$W | j "[b['id'] for b in d['blocks']] == $BEFORE")"
echo "undo twice: $(curl -s "${C[@]}" "${J[@]}" -X POST $B/api/drawers/$W/split/undo -d '{}' | j "d['error']")"

echo "-- named after one of them, and the most moons"
K=$(planet "Climbing")
for i in 1 2 3 4; do note $K "Bouldering session $i at the crag, crimps and chalk" >/dev/null; note $K "Threw bowls on the wheel ($i), glaze in the kiln" >/dev/null; done
MOONS=$(for t in One Two Three Four Five Six Seven Eight; do curl -s "${C[@]}" "${J[@]}" -X POST $B/api/drawers -d "{\"title\":\"$t\",\"parent\":\"$K\"}" | j "d['drawer']['id']"; done)
echo "8 moons already: $(signs $K "$SF")"
echo "split refused: $(curl -s "${C[@]}" "${J[@]}" -X POST $B/api/drawers/$K/split -d '{}' | j "d['error']")"
curl -s -o /dev/null "${C[@]}" -H X-Mutt:1 -X DELETE $B/api/drawers/$(echo $MOONS | cut -d' ' -f1)
echo "7 moons: $(signs $K "$SF")"
echo "split the climbing planet: $(curl -s "${C[@]}" "${J[@]}" -X POST $B/api/drawers/$K/split -d '{}' | j "d['drawer']['count'], [(m['title'], m['count']) for m in d['drawer']['moons']][-1]")"

echo "-- commonplace book, on at 50% with 3 quotes, stays down to 30%"
Q=$(planet "Bits and pieces")
QF="(d['commonplace']['fits'], d['commonplace']['share'], d['commonplace'].get('left', False))"
note $Q "“Hope is the thing with feathers.” — Emily Dickinson" >/dev/null
note $Q "\"We are such stuff as dreams are made on.\" - Shakespeare, The Tempest" >/dev/null
note $Q "$PROSE (1)" >/dev/null
echo "2 quotes of 3 (fewer than 3): $(signs $Q "$QF")"
note $Q "Be patient toward all that is unsolved in your heart.
— Rainer Maria Rilke, Letters to a Young Poet" >/dev/null
for i in 2 3 4; do note $Q "$PROSE ($i)" >/dev/null; done
echo "3 of 7 (43%), never answered: $(signs $Q "$QF")"
note $Q "“Here's looking at you, kid.”
Rick (Casablanca, 1942)" >/dev/null
echo "4 of 8 (50%): $(signs $Q "$QF")"
note $Q "Mum: \"Just start. The rest follows.\"" >/dev/null
echo "5 of 9 (56%): $(signs $Q "$QF") signs: $(signs $Q "d['commonplace']['signs']")"
echo "turned on: $(mode $Q '{"commonplace":{"on":true,"show":"who"}}' "d['drawer']['modes']['commonplace']")"
echo "a show nobody knows: $(mode $Q '{"commonplace":{"show":"shelf"}}' "d['error']")"
for i in 5 6 7 8 9; do note $Q "$PROSE ($i)" >/dev/null; done
echo "5 of 14 (36%), on: $(signs $Q "$QF")"
for i in 10 11 12; do note $Q "$PROSE ($i)" >/dev/null; done
echo "5 of 17 (29%), on: $(signs $Q "$QF")"
echo "the quotes, read: $(curl -s "${C[@]}" $B/api/drawers/$Q/quotes | j "[(q['who'], q['source'], q['size'], q['words'][:20]) for q in d['quotes']]")"
QM=$(curl -s "${C[@]}" "${J[@]}" -X POST $B/api/drawers -d "{\"title\":\"Sayings\",\"parent\":\"$Q\"}" | j "d['drawer']['id']")
for t in "Measure twice, cut once." "Fortune favours the bold." "Slow and steady wins the race." "Look before you leap."; do note $QM "$t" >/dev/null; done
echo "a moon called Sayings, plain lines: $(signs $QM "$QF")"
echo "a moon can be one: $(mode $QM '{"commonplace":{"on":true}}' "d['drawer']['modes']['commonplace']['on']")"
echo "on a moon called Sayings, plain lines count: $(curl -s "${C[@]}" $B/api/drawers/$QM/quotes 2>/dev/null | j "len(d.get('quotes', []))")"

echo "-- board: earned by moving files by hand (8 moves in two weeks, 4+ files); in the menu with 2+ files"
BD=$(planet "Living room")
for t in lamp curtains wood rug chair shelf; do note $BD "the $t" >/dev/null; done
BF="(d['board']['fits'], d['board']['count'], d['board']['days'], d['board'].get('left', False))"
ids() { curl -s "${C[@]}" $B/api/drawers/$1 | j "' '.join(b['id'] for b in d['blocks'])"; }
# turn the order round: a real move each time
flip() { curl -s "${C[@]}" "${J[@]}" -X PUT $B/api/drawers/$1/order -d "$(python3 -c "import json,sys; i=sys.argv[1].split(); print(json.dumps(dict(ids=i[1:] + i[:1], **(dict(hand=True) if sys.argv[2] == 'hand' else dict()))))" "$(ids $1)" "$2")" | j "d['ok']"; }
olden() { python3 -c "import sqlite3,sys,time; c=sqlite3.connect(sys.argv[1]); [c.execute('INSERT INTO hand_moves (drawer_id, at) VALUES (?, ?)', (sys.argv[2], time.time() - float(sys.argv[3]) * 86400)) for _ in range(int(sys.argv[4]))]; c.commit()" "$SP/data/mutt.db" "$1" "$2" "$3"; }
echo "never moved: $(signs $BD "$BF")"
for i in 1 2 3 4 5 6; do flip $BD hand >/dev/null; done
echo "6 moves by hand today: $(signs $BD "$BF")"
echo "not offered yet, but in the menu: $(signs $BD "d['board']['always']")"
flip $BD order >/dev/null
echo "an order saved by Mutt (an upload, an Undo) isn't a move: $(signs $BD "d['board']['count']")"
curl -s -o /dev/null "${C[@]}" "${J[@]}" -X PUT $B/api/drawers/$BD/order -d "{\"ids\":[$(ids $BD | python3 -c "import sys; print(','.join('\"%s\"' % i for i in sys.stdin.read().split()))")],\"hand\":true}"
echo "the same order again isn't a move: $(signs $BD "d['board']['count']")"
olden $BD 20 4
echo "+4 twenty days ago (too long ago): $(signs $BD "$BF")"
olden $BD 3 1
echo "+1 three days ago, so 7: $(signs $BD "$BF")"
flip $BD hand >/dev/null
echo "+1 more today, so 8: $(signs $BD "$BF")"
echo "its signs: $(signs $BD "d['board']['signs']")"
SM=$(planet "Three things")
for t in a b c; do note $SM "thing $t" >/dev/null; done
olden $SM 1 6; olden $SM 2 6; olden $SM 3 6
echo "18 moves, but only 3 files: $(signs $SM "$BF")"
ON=$(planet "One thing"); note $ON "just this" >/dev/null
echo "in the menu with 3 files, with 1: $(signs $SM "d['board']['always']") $(signs $ON "d['board']['always']")"
echo "waved away: $(mode $BD '{"board":{"dismissed":true}}' "d['drawer']['modes']['board']")"
python3 -c "import sqlite3,sys; c=sqlite3.connect(sys.argv[1]); c.execute('DELETE FROM hand_moves WHERE drawer_id = ?', (sys.argv[2],)); c.commit()" "$SP/data/mutt.db" "$BD"
echo "answered once, it stays in the menu with no moves left: $(signs $BD "$BF")"
echo "turned on: $(mode $BD '{"board":{"on":true}}' "d['drawer']['modes']['board']['on']")"
flip $BD hand >/dev/null
echo "moves while it's a board don't count: $(signs $BD "d['board']['count']")"
FIRST=$(ids $BD | cut -d' ' -f1); SECOND=$(ids $BD | cut -d' ' -f2)
board() { curl -s "${C[@]}" "${J[@]}" -X PUT $B/api/drawers/$1/board -d "$2" | j "$3"; }
# JSON from python (dict(...), never literal braces: old bash expands them inside $(...))
body() { python3 -c "import json,sys; F,S,P=sys.argv[1:4]; print(json.dumps($1))" "$FIRST" "$SECOND" "$P4"; }
echo "nothing placed yet: $(curl -s "${C[@]}" $B/api/drawers/$BD/board | j "d")"
ONE=$(body "dict(items=[dict(id=F, x=10.4, y=-20, w=300, h=180, z=2), dict(id='w-abcd1234', x=0, y=-90, w=440, h=None, z=3, words='Light', style='heading')])")
echo "a file and some words: $(board $BD "$ONE" "sorted(('words' if i['id'].startswith('w-') else 'file', i['x'], i['y'], i['w'], i['h'], i.get('words')) for i in d['items'])")"
echo "a line between them: $(board $BD "$(body "dict(join=[['w-abcd1234', F]])")" "d['lines'] == [sorted(['w-abcd1234', '$FIRST'])]")"
echo "a line to something not on the board: $(board $BD "$(body "dict(join=[['w-abcd1234', S]])")" "len(d['lines'])")"
echo "too far, too small: $(board $BD "$(body "dict(items=[dict(id=S, x=9e9, y=0, w=1)])")" "sorted((i['x'], i['w']) for i in d['items'] if not i['id'].startswith('w-'))")"
echo "words of a kind nobody knows: $(board $BD "$(body "dict(items=[dict(id='w-abcd1234', x=0, y=0, w=200, words='Hi', style='shout')])")" "d['error']")"
echo "not a number: $(board $BD "$(body "dict(items=[dict(id=F, x='left', y=0, w=200)])")" "d['error']")"
echo "a file that isn't on the planet is left out: $(board $BD "$(body "dict(items=[dict(id=P, x=0, y=0, w=200)])")" "len(d['items'])")"
curl -s -o /dev/null "${C[@]}" "${J[@]}" -X DELETE $B/api/blocks/$FIRST/connections/$BD
echo "a file taken off leaves the board and its line: $(curl -s "${C[@]}" $B/api/drawers/$BD/board | j "len(d['items']), d['lines']")"
curl -s -o /dev/null "${C[@]}" "${J[@]}" -X POST $B/api/blocks/$FIRST/connections -d "$(body "dict(drawer='$BD')")"
echo "put back, it comes back to its place, line and all: $(curl -s "${C[@]}" $B/api/drawers/$BD/board | j "[(i['x'], i['y']) for i in d['items'] if i['id'] == '$FIRST'], len(d['lines'])")"
echo "words taken away take their line: $(board $BD "$(body "dict(gone=['w-abcd1234'])")" "len(d['items']), d['lines']")"
curl -s "${C[@]}" "${J[@]}" -X POST $B/api/auth/signup -d '{"username":"looker","pin":"482193"}' -c "$SP/c2.txt" >/dev/null
echo "someone else can look: $(curl -s -b "$SP/c2.txt" $B/api/drawers/$BD/board | j "len(d['items'])")"
echo "but not move things: $(curl -s -b "$SP/c2.txt" "${J[@]}" -X PUT $B/api/drawers/$BD/board -d '{"items":[]}' | j "d['error']")"
echo "nor count as moving: $(curl -s -b "$SP/c2.txt" "${J[@]}" -X PUT $B/api/drawers/$BD/order -d '{"ids":[],"hand":true}' | j "d['error']")"
BM=$(curl -s "${C[@]}" "${J[@]}" -X POST $B/api/drawers -d "{\"title\":\"Corner\",\"parent\":\"$BD\"}" | j "d['drawer']['id']")
echo "a moon can be a board: $(mode $BM '{"board":{"on":true}}' "d['drawer']['modes']['board']['on']")"
GP=$(planet "Hobbies")
for i in 1 2 3 4; do note $GP "Bouldering session $i at the crag, crimps and chalk" >/dev/null; note $GP "Threw bowls on the wheel ($i), glaze in the kiln" >/dev/null; done
echo "a new board is laid out by subject: $(curl -s "${C[@]}" "$B/api/drawers/$GP/board?arrange=1" | j "sorted((g['name'], len(g['ids'])) for g in d['groups'])")"
echo "one with no clear subjects, by kind (no groups): $(curl -s "${C[@]}" "$B/api/drawers/$SM/board?arrange=1" | j "d['groups']")"
echo "one already laid out isn't regrouped: $(curl -s "${C[@]}" "$B/api/drawers/$BD/board?arrange=1" | j "'groups' in d")"
echo "someone else is never told: $(curl -s -b "$SP/c2.txt" "$B/api/drawers/$GP/board?arrange=1" | j "'groups' in d")"
echo "Arrange asks for the subjects of one already laid out: $(curl -s "${C[@]}" "$B/api/drawers/$BD/board?groups=1" | j "'groups' in d")"
echo "someone else never gets them: $(curl -s -b "$SP/c2.txt" "$B/api/drawers/$GP/board?groups=1" | j "'groups' in d")"
echo "Arrange's choices are kept: $(mode $BD '{"board":{"order":"new","sizes":"even","laid":true}}' "[d['drawer']['modes']['board'][k] for k in ('order', 'sizes', 'laid')]")"
echo "an order nobody knows: $(mode $BD '{"board":{"order":"colour"}}' "d.get('error')")"
echo "in the download: $(curl -s "${C[@]}" -o "$SP/all.zip" -w '%{http_code}' $B/api/me/export) $(python3 -c "import json,sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); d=json.loads(z.read([n for n in z.namelist() if n.endswith('Your data.json')][0])); print([(len(p['board']['things']), p['board']['lines']) for p in d['planets'] if p['name'] == 'Living room'])" "$SP/all.zip")"
