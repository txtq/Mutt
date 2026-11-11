#!/bin/bash
# Wrong codes: someone guessing from one place locks only themselves out;
# many places together close the account to new browsers but not the owner's.
# Also: uploaded HTML and SVG come back as harmless text or sandboxed.
SP="$1"; B=localhost:8099
J=(-H Content-Type:application/json -H X-Mutt:1); O=(-b "$SP/o.txt" -c "$SP/o.txt")
rm -f "$SP/o.txt"
from() { curl -s "${J[@]}" -H "X-Forwarded-For: $1" -X POST $B/api/auth/login -d "{\"username\":\"owner\",\"pin\":\"$2\"}"; }
code() { curl -s -o /dev/null -w '%{http_code}' "${J[@]}" -H "X-Forwarded-For: $1" "${@:3}" -X POST $B/api/auth/login -d "{\"username\":\"owner\",\"pin\":\"$2\"}"; }
echo "signup: $(curl -s -o /dev/null -w '%{http_code}' "${O[@]}" "${J[@]}" -X POST $B/api/auth/signup -d '{"username":"owner","pin":"1234"}')"
echo "device cookie: $(grep -c mutt_device "$SP/o.txt")"
for i in 1 2 3 4 5 6; do echo "1.1.1.1 miss $i: $(from 1.1.1.1 0000)"; done
echo "1.1.1.1 right code (expect 429): $(code 1.1.1.1 1234)"
echo "2.2.2.2 right code, new browser (expect 200): $(code 2.2.2.2 1234)"
for i in 1 2 3 4 5 6; do from "2001:db8::$i" 0000 > /dev/null; done
echo "same IPv6 /64, 7th address (expect 429): $(from 2001:db8::7 0000)"
for n in $(seq 10 17); do for i in 1 2 3 4 5; do from "9.9.9.$n" 0000 > /dev/null; done; done
echo "after 40+ misses, new browser (expect 429): $(from 3.3.3.3 1234)"
echo "after 40+ misses, owner's browser (expect 200): $(code 4.4.4.4 1234 -b "$SP/o.txt")"
echo "owner's browser, wrong code (expect 401): $(code 4.4.4.4 9999 -b "$SP/o.txt")"
printf '<script>alert(1)</script>' > "$SP/x.html"
printf '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>' > "$SP/x.svg"
for f in x.html x.svg; do
  ID=$(curl -s "${O[@]}" -H X-Mutt:1 -H 'Content-Type: text/html' --data-binary @"$SP/$f" "$B/api/upload?name=$f" | python3 -c "import json,sys; print(json.load(sys.stdin)['block']['id'])")
  echo "$f served as: $(curl -s -D - -o /dev/null "${O[@]}" "$B/f/$ID" | grep -i -E '^(content-type|content-security-policy):' | tr -d '\r' | tr '\n' ' ')"
done
# Planet codes: guessing one is limited the same way, but counted apart, so it
# never locks the owner out of signing in.
P=(-b "$SP/p.txt" -c "$SP/p.txt"); G=(-b "$SP/g.txt" -c "$SP/g.txt"); rm -f "$SP/p.txt" "$SP/g.txt"
curl -s -o /dev/null "${P[@]}" "${J[@]}" -X POST $B/api/auth/signup -d '{"username":"sharer","pin":"5555"}'
curl -s -o /dev/null "${G[@]}" "${J[@]}" -X POST $B/api/auth/signup -d '{"username":"guesser","pin":"6666"}'
PL=$(curl -s "${P[@]}" "${J[@]}" -X POST $B/api/drawers -d '{"title":"Shared","visibility":"pin"}' | python3 -c "import json,sys; print(json.load(sys.stdin)['drawer']['id'])")
curl -s -o /dev/null "${P[@]}" "${J[@]}" -X PUT $B/api/drawers/$PL/code -d '{"code":"7070"}'
guess() { curl -s "${G[@]}" "${J[@]}" -H "X-Forwarded-For: $1" -X POST $B/api/galaxy/sharer/unlock -d "{\"pin\":\"$2\",\"drawer\":\"$PL\"}" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('error') or d.get('opened'))"; }
for i in 1 2 3 4 5 6; do echo "planet code miss $i: $(guess 5.5.5.5 0000)"; done
echo "right planet code after misses (expect wait): $(guess 5.5.5.5 7070)"
echo "other place, right planet code: $(guess 6.6.6.6 7070)"
echo "sharer signs in from the guessing place (expect 200): $(curl -s -o /dev/null -w '%{http_code}' "${J[@]}" -H 'X-Forwarded-For: 5.5.5.5' -X POST $B/api/auth/login -d '{"username":"sharer","pin":"5555"}')"
