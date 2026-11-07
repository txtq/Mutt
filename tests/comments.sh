#!/bin/bash
# Comments on files: anyone who can see a file can comment; its owner can
# remove any comment, a writer can take theirs back; nobody else can.
SP="$1"; B=localhost:8099
J=(-H Content-Type:application/json -H X-Mutt:1); A=(-b "$SP/a.txt" -c "$SP/a.txt"); V=(-b "$SP/v.txt" -c "$SP/v.txt"); X=(-b "$SP/x.txt" -c "$SP/x.txt")
j() { python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"; }
for who in "A owner 4821" "V visitor 1357" "X other 2468"; do set -- $who; eval "curl -s \"\${$1[@]}\" \"\${J[@]}\" -X POST $B/api/auth/signup -d '{\"username\":\"$2\",\"pin\":\"$3\"}' >/dev/null"; done
D=$(curl -s "${A[@]}" "${J[@]}" -X POST $B/api/drawers -d '{"title":"Photos"}' | j "d['drawer']['id']")
P=$(curl -s "${A[@]}" "${J[@]}" -X POST $B/api/drawers -d '{"title":"Diary","visibility":"private"}' | j "d['drawer']['id']")
F=$(curl -s "${A[@]}" "${J[@]}" -X POST $B/api/blocks -d "{\"content\":\"A walk by the sea\",\"drawer\":\"$D\"}" | j "d['block']['id']")
H=$(curl -s "${A[@]}" "${J[@]}" -X POST $B/api/blocks -d "{\"content\":\"secret\",\"drawer\":\"$P\"}" | j "d['block']['id']")
echo "none yet: $(curl -s "${V[@]}" $B/api/blocks/$F/comments | j "d['comments']")"
echo "empty: $(curl -s "${V[@]}" "${J[@]}" -X POST $B/api/blocks/$F/comments -d '{"body":"   "}' | j "d['error']")"
echo "too long: $(curl -s "${V[@]}" "${J[@]}" -X POST $B/api/blocks/$F/comments -d "{\"body\":\"$(printf 'a%.0s' {1..2001})\"}" | j "d['error']")"
C1=$(curl -s "${V[@]}" "${J[@]}" -X POST $B/api/blocks/$F/comments -d '{"body":"Lovely light here"}' | j "d['comments'][0]['id']")
C2=$(curl -s "${X[@]}" "${J[@]}" -X POST $B/api/blocks/$F/comments -d '{"body":"Where is this?"}' | j "d['comments'][-1]['id']")
echo "owner replies: $(curl -s "${A[@]}" "${J[@]}" -X POST $B/api/blocks/$F/comments -d '{"body":"Cornwall!"}' | j "[(c['by'], c['body'], c['byOwner'], c['mine'], c['canRemove']) for c in d['comments']]")"
echo "visitor sees: $(curl -s "${V[@]}" $B/api/blocks/$F/comments | j "[(c['by'], c['mine'], c['canRemove']) for c in d['comments']]")"
echo "count on file: $(curl -s "${V[@]}" $B/api/blocks/$F | j "d['block']['commentCount']")"
echo "count on planet: $(curl -s "${A[@]}" $B/api/drawers/$D | j "[b.get('commentCount') for b in d['blocks']]")"
echo "private file: $(curl -s "${V[@]}" "${J[@]}" -X POST $B/api/blocks/$H/comments -d '{"body":"hi"}' | j "d['error']")"
echo "private read: $(curl -s "${V[@]}" $B/api/blocks/$H/comments | j "d['error']")"
echo "other removes visitor's: $(curl -s "${X[@]}" -H X-Mutt:1 -X DELETE $B/api/blocks/$F/comments/$C1 | j "d['error']")"
echo "visitor takes back: $(curl -s "${V[@]}" -H X-Mutt:1 -X DELETE $B/api/blocks/$F/comments/$C1 | j "[c['by'] for c in d['comments']]")"
echo "owner removes other's: $(curl -s "${A[@]}" -H X-Mutt:1 -X DELETE $B/api/blocks/$F/comments/$C2 | j "[c['by'] for c in d['comments']]")"
echo "gone: $(curl -s "${A[@]}" -H X-Mutt:1 -X DELETE $B/api/blocks/$F/comments/$C2 | j "d['error']")"
echo "no csrf: $(curl -s "${V[@]}" -H Content-Type:application/json -X POST $B/api/blocks/$F/comments -d '{"body":"x"}' | j "d.get('error')")"
curl -s "${A[@]}" -H X-Mutt:1 -X DELETE $B/api/blocks/$F >/dev/null
echo "file deleted: $(curl -s "${V[@]}" $B/api/blocks/$F/comments | j "d['error']")"
