#!/bin/bash
SP="$1"; B=localhost:8099
J=(-H Content-Type:application/json -H X-Mutt:1); C=(-b "$SP/c.txt" -c "$SP/c.txt")
rm -f "$SP/c.txt" "$SP/x.txt"
j() { python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"; }
echo "signup: $(curl -s "${C[@]}" "${J[@]}" -X POST $B/api/auth/signup -d '{"username":"Tester","pin":"4821"}' | j "d['user']['username']")"
D=$(curl -s "${C[@]}" "${J[@]}" -X POST $B/api/drawers -d '{"title":"Stuff"}' | j "d['drawer']['id']")
BODY="{\"content\":\"hello **world**\",\"drawer\":\"$D\"}"
TK=$(curl -s "${C[@]}" "${J[@]}" -X POST $B/api/blocks -d "$BODY" | j "d['block']['kind']")
echo "text: $TK"
printf 'print(1)\n' > "$SP/a.py"
F=$(curl -s "${C[@]}" -H X-Mutt:1 -H 'Content-Type: text/x-python' --data-binary @"$SP/a.py" "$B/api/upload?drawer=$D&name=a.py" | j "d['block']['id'] + ' ' + d['block']['kind'] + ' ' + d['block']['file']")
echo "upload: $F"
echo "range: $(curl -s "${C[@]}" -H 'Range: bytes=0-4' -o /dev/null -w '%{http_code} %{size_download}' "$B${F##* }")"
echo "link: $(curl -s "${C[@]}" "${J[@]}" -X POST $B/api/blocks -d '{"content":"https://example.com"}' | j "d['block']['kind'] + ' ' + d['block']['title']")"
echo "drawer has: $(curl -s "${C[@]}" $B/api/drawers/$D | j "[b['kind'] for b in d['blocks']]")"
echo "no csrf header: $(curl -s -o /dev/null -w '%{http_code}' "${C[@]}" -H Content-Type:application/json -X POST $B/api/drawers -d '{"title":"x"}')"
echo "spa route: $(curl -s -o /dev/null -w '%{http_code}' $B/d/whatever)"
X=(-b "$SP/x.txt" -c "$SP/x.txt")
for i in 1 2 3 4; do curl -s "${X[@]}" "${J[@]}" -X POST $B/api/auth/login -d '{"username":"tester","pin":"0000"}'; echo; done
echo "right code while locked: $(curl -s -o /dev/null -w '%{http_code}' "${X[@]}" "${J[@]}" -X POST $B/api/auth/login -d '{"username":"tester","pin":"4821"}')"
