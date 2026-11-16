#!/bin/bash
# Wrong codes: someone guessing from one place locks only themselves out;
# many places together close the account to new browsers but not the owner's.
# Also: uploaded HTML and SVG come back as harmless text or sandboxed.
SP="$1"; B=localhost:${MUTT_TEST_PORT:-8099}
source "$(dirname "$0")/lib.sh"
J=(-H Content-Type:application/json -H X-Mutt:1); O=(-b "$SP/o.txt" -c "$SP/o.txt")
rm -f "$SP/o.txt"
from() { curl -s "${J[@]}" -H "X-Forwarded-For: $1" -X POST $B/api/auth/login -d "{\"username\":\"owner\",\"pin\":\"$2\"}"; }
code() { curl -s -o /dev/null -w '%{http_code}' "${J[@]}" -H "X-Forwarded-For: $1" "${@:3}" -X POST $B/api/auth/login -d "{\"username\":\"owner\",\"pin\":\"$2\"}"; }
echo "signup: $(curl -s -o /dev/null -w '%{http_code}' "${O[@]}" "${J[@]}" -X POST $B/api/auth/signup -d '{"username":"owner","pin":"123493"}')"
echo "device cookie: $(grep -c mutt_device "$SP/o.txt")"
for i in 1 2 3 4 5 6; do echo "1.1.1.1 miss $i: $(from 1.1.1.1 0000)"; done
echo "1.1.1.1 right code (expect 429): $(code 1.1.1.1 123493)"
echo "2.2.2.2 right code, new browser (expect 200): $(code 2.2.2.2 123493)"
echo "made-up address in front of a locked-out one (expect 429): $(code '8.8.8.8, 1.1.1.1' 123493)"
for i in 1 2 3 4 5 6; do from "2001:db8::$i" 000000 > /dev/null; done
echo "same IPv6 /64, 7th address (expect 429): $(from 2001:db8::7 000000)"
# A 4-digit guess can only open a 4-digit code, so those stop after 10 misses a day.
echo "after 10 misses, a 4-digit guess from a new place (expect 429): $(code 7.7.7.7 1234)  6-digit (expect 401): $(code 7.7.7.8 000001)"
for n in $(seq 10 17); do for i in 1 2 3 4 5; do from "9.9.9.$n" 000000 > /dev/null; done; done
# The day is counted from the first of those misses, so a busy machine loses a few seconds
# before this asks: the wait only has to be within a minute of 24 hours.
echo "after 40+ misses, new browser (expect 429): $(from 3.3.3.3 123456 | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['error'], 'retryAfter within a minute of 24 hours:', 86340 <= d.get('retryAfter', 0) <= 86400)")"
echo "after 40+ misses, owner's browser (expect 200): $(code 4.4.4.4 123493 -b "$SP/o.txt")"
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
curl -s -o /dev/null "${P[@]}" "${J[@]}" -X POST $B/api/auth/signup -d '{"username":"sharer","pin":"555593"}'
curl -s -o /dev/null "${G[@]}" "${J[@]}" -X POST $B/api/auth/signup -d '{"username":"guesser","pin":"666693"}'
PL=$(curl -s "${P[@]}" "${J[@]}" -X POST $B/api/drawers -d '{"title":"Shared","visibility":"pin"}' | python3 -c "import json,sys; print(json.load(sys.stdin)['drawer']['id'])")
curl -s -o /dev/null "${P[@]}" "${J[@]}" -X PUT $B/api/drawers/$PL/code -d '{"code":"7070"}'
guess() { curl -s "${G[@]}" "${J[@]}" -H "X-Forwarded-For: $1" -X POST $B/api/galaxy/sharer/unlock -d "{\"pin\":\"$2\",\"drawer\":\"$PL\"}" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('error') or d.get('opened'))"; }
for i in 1 2 3 4 5 6; do echo "planet code miss $i: $(guess 5.5.5.5 0000)"; done
echo "right planet code after misses (expect wait): $(guess 5.5.5.5 7070)"
echo "other place, right planet code: $(guess 6.6.6.6 7070)"
echo "sharer signs in from the guessing place (expect 200): $(curl -s -o /dev/null -w '%{http_code}' "${J[@]}" -H 'X-Forwarded-For: 5.5.5.5' -X POST $B/api/auth/login -d '{"username":"sharer","pin":"555593"}')"
# Getting back in without an identity: a recovery key from sign-up, a code
# set from a device that signed in before, and a reset asked of whoever runs
# Mutt (MUTT_ADMIN=boss, MUTT_ADMIN_KEY=test-admin-key in the test server).
R=(-b "$SP/r.txt" -c "$SP/r.txt"); rm -f "$SP/r.txt"
KEY=$(curl -s "${R[@]}" "${J[@]}" -X POST $B/api/auth/signup -d '{"username":"forgetful","pin":"482916"}' | python3 -c "import json,sys; print(json.load(sys.stdin).get('recoveryKey',''))")
echo "sign-up gives a recovery key: $(echo "$KEY" | grep -c -E '^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$')"
curl -s -o /dev/null "${R[@]}" "${J[@]}" -X PUT $B/api/me/name -d '{"name":"  Sam   from climbing "}'
echo "name, as others see it: $(curl -s "${O[@]}" $B/api/galaxy/forgetful | python3 -c "import json,sys; print(json.load(sys.stdin)['user']['name'])")"
echo "forgot code on a browser that signed in before: $(status "${R[@]}" "${J[@]}" -X POST $B/api/me/pin -d '{"forgot":true,"next":"583920"}')"
rule "a session without that browser's device cookie set a code without the old one" "$(status -b "mutt_session=$(grep mutt_session "$SP/r.txt" | awk '{print $7}')" "${J[@]}" -X POST $B/api/me/pin -d '{"forgot":true,"next":"583921"}')" 403
echo "wrong key: $(curl -s "${J[@]}" -H 'X-Forwarded-For: 7.7.7.1' -X POST $B/api/auth/recover -d '{"username":"forgetful","key":"AAAA-AAAA-AAAA-AAAA","pin":"719305"}')"
NEWKEY=$(curl -s "${J[@]}" -H 'X-Forwarded-For: 7.7.7.2' -X POST $B/api/auth/recover -d "{\"username\":\"forgetful\",\"key\":\"$(echo "$KEY" | tr 'A-Z' 'a-z' | tr -d '-')\",\"pin\":\"719305\"}" | python3 -c "import json,sys; print(json.load(sys.stdin).get('recoveryKey',''))")
echo "key typed loosely sets a new code and gives a new key: $(test -n "$NEWKEY" && test "$NEWKEY" != "$KEY" && echo yes)"
rule "a recovery key worked twice" "$(status "${J[@]}" -H 'X-Forwarded-For: 7.7.7.3' -X POST $B/api/auth/recover -d "{\"username\":\"forgetful\",\"key\":\"$KEY\",\"pin\":\"719306\"}")" 401
echo "signs in with the new code: $(status "${J[@]}" -H 'X-Forwarded-For: 7.7.7.4' -X POST $B/api/auth/login -d '{"username":"forgetful","pin":"719305"}')"
echo "reset request (known / unknown name): $(curl -s "${J[@]}" -H 'X-Forwarded-For: 7.7.7.5' -X POST $B/api/auth/reset-request -d '{"username":"forgetful","note":"it is Sam, text me"}') $(curl -s "${J[@]}" -H 'X-Forwarded-For: 7.7.7.5' -X POST $B/api/auth/reset-request -d '{"username":"nobody-here","note":"x"}')"
rule "someone who doesn't run Mutt could read reset requests" "$(status "${O[@]}" $B/api/admin/resets) $(status -H 'X-Mutt-Admin: wrong' $B/api/admin/resets)" "404 404"
ASK=$(curl -s -H 'X-Mutt-Admin: test-admin-key' $B/api/admin/resets)
echo "requests, as the admin key sees them: $(echo "$ASK" | python3 -c "import json,sys; print([(r['username'], r['name'], r['note'], r['hasKey']) for r in json.load(sys.stdin)['requests']])")"
LINK=$(curl -s -H 'X-Mutt-Admin: test-admin-key' -H X-Mutt:1 -X POST "$B/api/admin/resets/$(echo "$ASK" | python3 -c "import json,sys; print(json.load(sys.stdin)['requests'][0]['id'])")/link" | python3 -c "import json,sys; print(json.load(sys.stdin)['link'])")
TOKEN=${LINK##*=}
echo "link opens for: $(curl -s $B/api/auth/reset/$TOKEN)"
echo "link sets a new code: $(status "${J[@]}" -X POST $B/api/auth/reset/$TOKEN -d '{"pin":"640271"}')"
rule "a reset link worked twice" "$(status "${J[@]}" -X POST $B/api/auth/reset/$TOKEN -d '{"pin":"640272"}')" 404
echo "requests left: $(curl -s -H 'X-Mutt-Admin: test-admin-key' $B/api/admin/resets)"
