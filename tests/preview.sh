#!/bin/bash
SP="$1"; B=localhost:8099
J=(-H Content-Type:application/json -H X-Mutt:1); A=(-b "$SP/pa.txt" -c "$SP/pa.txt"); U=(-b "$SP/pb.txt" -c "$SP/pb.txt")
rm -f "$SP/pa.txt" "$SP/pb.txt"
j() { python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"; }
curl -s "${A[@]}" "${J[@]}" -X POST $B/api/auth/signup -d '{"username":"alma","pin":"1357"}' > /dev/null
curl -s "${U[@]}" "${J[@]}" -X POST $B/api/auth/signup -d '{"username":"bo","pin":"2468"}' > /dev/null
L=$(curl -s "${A[@]}" "${J[@]}" -X POST $B/api/blocks -d '{"content":"https://example.com"}' | j "d['block']['id'] + ' ' + str(d['block']['meta'].get('shot'))")
echo "new link: $L"
ID=${L%% *}
for i in $(seq 1 30); do S=$(curl -s "${A[@]}" $B/api/blocks/$ID | j "str(d['block']['meta'].get('shot')) + ' ' + str(d['block']['thumb'])"); [[ $S == pending* ]] || break; sleep 2; done
echo "after waiting: $S"
echo "edited time unchanged by picture: $(curl -s "${A[@]}" $B/api/blocks/$ID | j "d['block']['updatedAt'] == d['block']['createdAt']")"
echo "preview again (already done): $(curl -s "${A[@]}" "${J[@]}" -X POST $B/api/blocks/$ID/preview | j "d['block']['meta'].get('shot')")"
echo "bo asks for alma's preview: $(curl -s -o /dev/null -w '%{http_code}' "${U[@]}" "${J[@]}" -X POST $B/api/blocks/$ID/preview)"
T=$(curl -s "${A[@]}" "${J[@]}" -X POST $B/api/blocks -d '{"content":"just words"}' | j "d['block']['id']")
echo "preview on text does nothing: $(curl -s "${A[@]}" "${J[@]}" -X POST $B/api/blocks/$T/preview | j "d['block']['meta'].get('shot')")"
P=$(curl -s "${A[@]}" "${J[@]}" -X POST $B/api/blocks -d '{"content":"http://127.0.0.1:8099/"}' | j "d['block']['id']")
sleep 3
echo "local address gets no picture: $(curl -s "${A[@]}" $B/api/blocks/$P | j "d['block']['meta'].get('shot')")"
echo "edit text: $(curl -s "${A[@]}" "${J[@]}" -X PATCH $B/api/blocks/$T -d '{"content":"new words"}' | j "d['block']['content']")  empty: $(curl -s -o /dev/null -w '%{http_code}' "${A[@]}" "${J[@]}" -X PATCH $B/api/blocks/$T -d '{"content":"   "}')"
