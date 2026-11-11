#!/bin/bash
# Mutt documents: which planets are offered it, saving from the editor (HTML
# cleaned, the note's words kept in step), page setup, versions, pictures and
# comments, and who may do what.
SP="$1"; B=localhost:8099
J=(-H Content-Type:application/json -H X-Mutt:1); C=(-b "$SP/c.txt" -c "$SP/c.txt"); O=(-b "$SP/o.txt" -c "$SP/o.txt")
j() { python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"; }
note() { python3 -c "import json,sys; print(json.dumps({'content': sys.argv[1], 'drawer': sys.argv[2]}))" "$1" "$2"; }
curl -s "${C[@]}" "${J[@]}" -X POST $B/api/auth/signup -d '{"username":"writer","pin":"482193"}' >/dev/null
D=$(curl -s "${C[@]}" "${J[@]}" -X POST $B/api/drawers -d '{"title":"Stuff"}' | j "d['drawer']['id']")
LONG="The harbour was quiet that morning. Nobody had come down to the boats yet, and the gulls had the place to themselves. I walked along the wall to the end, where the light stands, and sat for a while. $(printf 'It was the kind of day that asks nothing of you. %.0s' {1..20})"
A=$(curl -s "${C[@]}" "${J[@]}" -X POST $B/api/blocks -d "$(note "$LONG" "$D")" | j "d['block']['id']")
curl -s "${C[@]}" "${J[@]}" -X POST $B/api/blocks -d "$(note "milk" "$D")" >/dev/null
echo "one long note + short: $(curl -s "${C[@]}" $B/api/drawers/$D/modes | j "d['documents']")"
S=$(curl -s "${C[@]}" "${J[@]}" -X POST $B/api/drawers -d '{"title":"Shopping"}' | j "d['drawer']['id']")
for t in milk eggs bread; do curl -s "${C[@]}" "${J[@]}" -X POST $B/api/blocks -d "$(note "$t" "$S")" >/dev/null; done
echo "short notes: $(curl -s "${C[@]}" $B/api/drawers/$S/modes | j "d['documents']['fits']")"
P=$(curl -s "${C[@]}" "${J[@]}" -X POST $B/api/drawers -d '{"title":"Poems"}' | j "d['drawer']['id']")
POEM=$'The wind went low\nacross the field of rye\nand I stood still\nto hear the evening die\n\nNo one came by\nthe road was dark and long'
Q=$(curl -s "${C[@]}" "${J[@]}" -X POST $B/api/blocks -d "$(note "$POEM" "$P")" | j "d['block']['id']")
echo "named poems: $(curl -s "${C[@]}" $B/api/drawers/$P/modes | j "d['documents']['fits'], d['documents']['signs']")"
echo "turn on: $(curl -s "${C[@]}" "${J[@]}" -X PATCH $B/api/drawers/$D -d '{"modes":{"documents":{"on":true}}}' | j "d['drawer']['modes']['documents']")"
echo "bad mode: $(curl -s "${C[@]}" "${J[@]}" -X PATCH $B/api/drawers/$D -d '{"modes":{"documents":{"on":1}}}' | j "d['error']")"
echo "sort by name: $(curl -s "${C[@]}" "${J[@]}" -X PATCH $B/api/drawers/$D -d '{"modes":{"documents":{"sort":"name"}}}' | j "d['drawer']['modes']['documents']")"
echo "bad sort: $(curl -s "${C[@]}" "${J[@]}" -X PATCH $B/api/drawers/$D -d '{"modes":{"documents":{"sort":"colour"}}}' | j "d['error']")"
echo "open (no doc yet): $(curl -s "${C[@]}" $B/api/docs/$A | j "d['doc']['html'], d['doc']['reads'], d['doc']['settings']['page'], d['comments']")"
echo "poem reads: $(curl -s "${C[@]}" $B/api/docs/$Q | j "d['doc']['reads']")"
# Kinds of writing: a script, a journal and a letter are read as such; a kind can be set by hand.
SCRIPT=$'INT. KITCHEN - NIGHT\nRain on the window.\nMARIA\nYou are late.\nEXT. GARDEN - DAY\nTom stands alone.'
DIARY=$'Monday 3 March 2025\nWent to the sea. It was cold.\n\nTuesday 4 March 2025\nWork all day, tired.'
LETTER=$'Dear Sam,\n\nThank you for the books. I loved them.\n\nLove,\nEd'
for k in SCRIPT DIARY LETTER; do
  X=$(curl -s "${C[@]}" "${J[@]}" -X POST $B/api/blocks -d "$(note "${!k}" "$P")" | j "d['block']['id']")
  echo "$k reads: $(curl -s "${C[@]}" $B/api/docs/$X | j "d['doc']['reads']")"
done
echo "set as script: $(curl -s "${C[@]}" "${J[@]}" -X PUT $B/api/docs/$Q -d '{"settings":{"layout":"script"}}' | j "d['doc']['settings']['layout']")"
echo "bad kind: $(curl -s "${C[@]}" "${J[@]}" -X PUT $B/api/docs/$Q -d '{"settings":{"layout":"novel"}}' | j "d['error']")"
echo "desk kinds: $(curl -s "${C[@]}" $B/api/drawers/$P/docs | j "sorted(x['kind'] or '-' for x in d['docs'])")"
curl -s "${C[@]}" "${J[@]}" -X PUT $B/api/docs/$Q -d '{"settings":{"layout":"auto"}}' >/dev/null
python3 - "$SP" <<'PY'
import json, sys
html = ('<h1 style="text-align:center;position:fixed">Harbour</h1><p onclick="x">Hello <b>there</b><script>alert(1)</script> '
        '<a href="javascript:alert(1)">bad</a> <a href="https://ex.com">ok</a></p><img src="https://evil/x.png">'
        '<div class="pb"></div><ul class="check"><li data-done>done</li></ul>'
        '<ol class="roman evil"><li>one</li></ol><p class="sc-char x" data-hint="NAME">TOM</p><h2 class="dated">Monday</h2>')
json.dump({'html': html, 'text': '# Harbour\n\nHello **there** ok', 'title': 'Harbour'}, open(sys.argv[1] + '/save.json', 'w'))
PY
echo "save: $(curl -s "${C[@]}" "${J[@]}" -X PUT $B/api/docs/$A --data-binary @"$SP/save.json" | j "d['block']['title'], d['block']['content'][:30]")"
echo "stored html: $(curl -s "${C[@]}" $B/api/docs/$A | j "d['doc']['html']")"
echo "versions after first save: $(curl -s "${C[@]}" $B/api/docs/$A/versions | j "[(v['name'], v['words']) for v in d['versions']]")"
echo "settings: $(curl -s "${C[@]}" "${J[@]}" -X PUT $B/api/docs/$A -d '{"settings":{"page":"letter","margins":"wide","size":14,"spacing":1.5,"numbers":"right","header":"Draft"}}' | j "d['doc']['settings']")"
echo "bad settings: $(curl -s "${C[@]}" "${J[@]}" -X PUT $B/api/docs/$A -d '{"settings":{"page":"a3"}}' | j "d['error']")"
echo "html kept after settings: $(curl -s "${C[@]}" $B/api/docs/$A | j "d['doc']['html'][:24]")"
curl -s "${C[@]}" "${J[@]}" -X PATCH $B/api/blocks/$A -d '{"content":"edited as a note"}' >/dev/null
echo "edited as a note -> html dropped: $(curl -s "${C[@]}" $B/api/docs/$A | j "d['doc']['html'], d['block']['content']")"
echo "name a version: $(curl -s "${C[@]}" "${J[@]}" -X POST $B/api/docs/$A/versions -d '{"name":"First draft"}' | j "[v['name'] for v in d['versions']]")"
V=$(curl -s "${C[@]}" $B/api/docs/$A/versions | j "d['versions'][-1]['id']")
echo "a version: $(curl -s "${C[@]}" $B/api/docs/$A/versions/$V | j "d['version']['name'], d['version']['html'], d['version']['text'][:20]")"
printf '\x89PNG\r\n\x1a\nfake' > "$SP/p.png"
SRC=$(curl -s "${C[@]}" -H X-Mutt:1 -H Content-Type:image/png --data-binary @"$SP/p.png" $B/api/docs/$A/img | j "d['src']")
echo "picture: $SRC $(curl -s "${C[@]}" -o /dev/null -w '%{http_code} %{content_type}' $B$SRC)"
echo "bad picture: $(curl -s "${C[@]}" -H X-Mutt:1 -H Content-Type:image/svg+xml --data-binary @"$SP/p.png" $B/api/docs/$A/img | j "d['error']")"
python3 -c "import json,sys; json.dump({'html': '<p>x</p><img src=\"%s\" onerror=\"x\">' % sys.argv[1], 'text': 'x'}, open(sys.argv[2], 'w'))" "$SRC" "$SP/pic.json"
curl -s "${C[@]}" "${J[@]}" -X PUT $B/api/docs/$A --data-binary @"$SP/pic.json" >/dev/null
echo "picture kept in html: $(curl -s "${C[@]}" $B/api/docs/$A | j "d['doc']['html']")"
echo "new doc: $(curl -s "${C[@]}" "${J[@]}" -X POST $B/api/docs -d "{\"drawer\":\"$D\"}" | j "d['block']['kind'], repr(d['block']['content'])")"
echo "desk: $(curl -s "${C[@]}" $B/api/drawers/$D/docs | j "sorted((x['words'], x['poem'], x['comments'], bool(x['html'])) for x in d['docs'])")"
# Someone the planet is shared with can read and comment, not edit.
curl -s "${C[@]}" "${J[@]}" -X PATCH $B/api/drawers/$D -d '{"visibility":"public"}' >/dev/null
curl -s "${O[@]}" "${J[@]}" -X POST $B/api/auth/signup -d '{"username":"friend","pin":"135793"}' >/dev/null
echo "visitor opens: $(curl -s "${O[@]}" $B/api/docs/$A | j "d['doc']['mine'], d['doc']['html'][:8]")"
echo "visitor saves: $(curl -s "${O[@]}" "${J[@]}" -X PUT $B/api/docs/$A -d '{"text":"mine now"}' | j "d.get('error')")"
echo "visitor versions: $(curl -s "${O[@]}" $B/api/docs/$A/versions | j "d.get('error')")"
K=$(curl -s "${O[@]}" "${J[@]}" -X POST $B/api/docs/$A/comments -d '{"quote":"x","prefix":"","suffix":"","body":"Lovely line"}' | j "d['comments'][0]['id']")
R="{\"parent\":\"$K\",\"body\":\"Thanks\"}"
echo "reply: $(curl -s "${C[@]}" "${J[@]}" -X POST $B/api/docs/$A/comments -d "$R" | j "[(c['by'], c['body'], bool(c['parentId'])) for c in d['comments']]")"
echo "owner can't change friend's words: $(curl -s "${C[@]}" "${J[@]}" -X PATCH $B/api/docs/$A/comments/$K -d '{"body":"no"}' | j "d.get('error')")"
echo "owner marks done: $(curl -s "${C[@]}" "${J[@]}" -X PATCH $B/api/docs/$A/comments/$K -d '{"resolved":true}' | j "[c['resolved'] for c in d['comments'] if not c['parentId']]")"
echo "desk counts open only: $(curl -s "${C[@]}" $B/api/drawers/$D/docs | j "sorted(x['comments'] for x in d['docs'])")"
echo "empty comment: $(curl -s "${O[@]}" "${J[@]}" -X POST $B/api/docs/$A/comments -d '{"body":"  "}' | j "d['error']")"
echo "friend deletes own: $(curl -s "${O[@]}" "${J[@]}" -X DELETE $B/api/docs/$A/comments/$K | j "len(d['comments'])")"
curl -s "${C[@]}" "${J[@]}" -X PATCH $B/api/drawers/$D -d '{"visibility":"private"}' >/dev/null
echo "private -> visitor: $(curl -s "${O[@]}" $B/api/docs/$A | j "d.get('error')")"
echo "private -> picture: $(curl -s "${O[@]}" -o /dev/null -w '%{http_code}' $B$SRC)"
F=$(curl -s "${C[@]}" "${J[@]}" -X POST $B/api/drawers -d '{"title":"Pics"}' | j "d['drawer']['id']")
echo "not text: $(curl -s "${C[@]}" "${J[@]}" -X POST "$B/api/blocks" -d '{"content":"https://example.com"}' | j "d['block']['kind']") $(L=$(curl -s "${C[@]}" "${J[@]}" -X POST "$B/api/blocks" -d '{"content":"https://example.org"}' | j "d['block']['id']"); curl -s "${C[@]}" $B/api/docs/$L | j "d.get('error')")"
echo "delete note -> doc gone: $(curl -s "${C[@]}" "${J[@]}" -X DELETE $B/api/blocks/$A | j "d['ok']") $(curl -s "${C[@]}" -o /dev/null -w '%{http_code}' $B/api/docs/$A) $(curl -s "${C[@]}" -o /dev/null -w '%{http_code}' $B$SRC)"

