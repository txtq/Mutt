#!/bin/bash
# Reading mode: which planets are offered it, what a book's insides look like
# to the reader, and saving where you are, highlights and a PDF's reading format.
SP="$1"; B=localhost:8099
J=(-H Content-Type:application/json -H X-Mutt:1); C=(-b "$SP/c.txt" -c "$SP/c.txt"); O=(-b "$SP/o.txt" -c "$SP/o.txt")
j() { python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"; }
python3 tests/make_books.py "$SP" >/dev/null
curl -s "${C[@]}" "${J[@]}" -X POST $B/api/auth/signup -d '{"username":"reader","pin":"4821"}' >/dev/null
D=$(curl -s "${C[@]}" "${J[@]}" -X POST $B/api/drawers -d '{"title":"Stuff"}' | j "d['drawer']['id']")
up() { curl -s "${C[@]}" -H X-Mutt:1 -H "Content-Type: $2" --data-binary @"$SP/$1" "$B/api/upload?drawer=$D&name=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$1")"; }
E=$(up 'The Harbour Light.epub' application/epub+zip | j "d['block']['id']")
echo "epub upload: $(curl -s "${C[@]}" $B/api/blocks/$E | j "(d['block']['meta'].get('book'), bool(d['block']['thumb']))")"
P=$(up 'The Quiet Coast.pdf' application/pdf | j "d['block']['id']")
echo "pdf hints: $(curl -s "${C[@]}" $B/api/blocks/$P | j "(d['block']['meta'].get('bookish'), d['block']['meta'].get('media', {}).get('pages'))")"
echo "offer: $(curl -s "${C[@]}" $B/api/drawers/$D/modes | j "d['reading']")"
curl -s "${C[@]}" "${J[@]}" -X POST $B/api/blocks -d "{\"content\":\"a note\",\"drawer\":\"$D\"}" >/dev/null
echo "offer with a note: $(curl -s "${C[@]}" $B/api/drawers/$D/modes | j "d['reading']['fits'], d['reading']['signs']")"
N=$(curl -s "${C[@]}" "${J[@]}" -X POST $B/api/drawers -d '{"title":"Notes"}' | j "d['drawer']['id']")
curl -s "${C[@]}" "${J[@]}" -X POST $B/api/blocks -d "{\"content\":\"just words\",\"drawer\":\"$N\"}" >/dev/null
echo "no books, no offer: $(curl -s "${C[@]}" $B/api/drawers/$N/modes | j "d['reading']['fits']")"
echo "turn on: $(curl -s "${C[@]}" "${J[@]}" -X PATCH $B/api/drawers/$D -d '{"modes":{"reading":{"on":true}}}' | j "d['drawer']['modes']['reading']")"
echo "bad setting: $(curl -s "${C[@]}" "${J[@]}" -X PATCH $B/api/drawers/$D -d '{"modes":{"reading":{"on":"yes"}}}' | j "d['error']")"
echo "shelf: $(curl -s "${C[@]}" $B/api/drawers/$D/shelf | j "[(b['format'], b['title'], b['author'], bool(b['cover']), b['percent'], b['book']) for b in d['books']]")"
echo "book: $(curl -s "${C[@]}" $B/api/books/$E | j "(d['book']['title'], d['book']['author'], len(d['book']['spine']), [t['title'] for t in d['book']['toc']][:3], d['book']['spine'][1]['href'], d['progress'], d['marks'])")"
echo "part: $(curl -s "${C[@]}" -o /dev/null -w '%{http_code} %{content_type}' "$B/api/books/$E/part/OEBPS/text/ch1.xhtml")"
echo "picture: $(curl -s "${C[@]}" -o /dev/null -w '%{http_code} %{content_type}' "$B/api/books/$E/part/OEBPS/images/cover.png")"
echo "missing part: $(curl -s "${C[@]}" -o /dev/null -w '%{http_code}' "$B/api/books/$E/part/OEBPS/nope.xhtml")"
echo "escape: $(curl -s "${C[@]}" -o /dev/null -w '%{http_code}' "$B/api/books/$E/part/..%2F..%2Fsecret.key")"
echo "progress: $(curl -s "${C[@]}" "${J[@]}" -X PUT $B/api/books/$E/progress -d '{"loc":"3:1200","percent":0.41}' | j "d['progress']['loc'], d['progress']['percent']")"
H=$(curl -s "${C[@]}" "${J[@]}" -X POST $B/api/books/$E/marks -d '{"kind":"highlight","loc":"3:10-60","text":"the lighthouse keeper","color":"yellow","percent":0.4}' | j "d['mark']['id']")
echo "recolour + note: $(curl -s "${C[@]}" "${J[@]}" -X PATCH $B/api/books/$E/marks/$H -d '{"color":"blue","note":"lovely"}' | j "d['mark']['color'], d['mark']['note']")"
echo "bookmark: $(curl -s "${C[@]}" "${J[@]}" -X POST $B/api/books/$E/marks -d '{"kind":"bookmark","loc":"5:0","percent":0.6}' | j "d['mark']['kind']")"
echo "bad colour: $(curl -s "${C[@]}" "${J[@]}" -X POST $B/api/books/$E/marks -d '{"kind":"highlight","loc":"1:1-2","color":"red"}' | j "d['error']")"
echo "reopen: $(curl -s "${C[@]}" $B/api/books/$E | j "d['progress']['loc'], [(m['kind'], m['color']) for m in d['marks']]")"
echo "shelf percent: $(curl -s "${C[@]}" $B/api/drawers/$D/shelf | j "[(b['title'], b['percent']) for b in d['books']]")"
echo "pdf book: $(curl -s "${C[@]}" $B/api/books/$P | j "d['book']['format'], d['book']['converted'], d['book']['pages']")"
echo "pdf text missing: $(curl -s "${C[@]}" -o /dev/null -w '%{http_code}' $B/api/books/$P/text)"
echo '{"v":1,"title":"The Quiet Coast","chapters":[{"title":"Chapter 1","blocks":[{"t":"h1","x":"Chapter 1"},{"t":"p","x":"Words."}]}]}' > "$SP/t.json"
echo "save text: $(curl -s "${C[@]}" -H X-Mutt:1 -H Content-Type:application/json -X PUT --data-binary @"$SP/t.json" $B/api/books/$P/text | j "d")"
echo "bad text: $(curl -s "${C[@]}" "${J[@]}" -X PUT $B/api/books/$P/text -d '{"v":2}' | j "d['error']")"
echo "text back: $(curl -s "${C[@]}" --compressed $B/api/books/$P/text | j "d['chapters'][0]['blocks'][1]")"
echo "now converted: $(curl -s "${C[@]}" $B/api/books/$P | j "d['book']['converted']")"
# Someone else
curl -s "${O[@]}" "${J[@]}" -X POST $B/api/auth/signup -d '{"username":"visitor","pin":"7391"}' >/dev/null
echo "private book to others: $(curl -s "${O[@]}" -o /dev/null -w '%{http_code}' $B/api/books/$E) $(curl -s "${O[@]}" -o /dev/null -w '%{http_code}' $B/api/books/$E/part/OEBPS/text/ch1.xhtml) $(curl -s "${O[@]}" -o /dev/null -w '%{http_code}' $B/api/drawers/$D/shelf)"
curl -s "${C[@]}" "${J[@]}" -X PATCH $B/api/drawers/$D -d '{"visibility":"public"}' >/dev/null
echo "public: $(curl -s "${O[@]}" $B/api/books/$E | j "d['book']['mine'], d['progress'], d['marks']")"
echo "visitor's own place: $(curl -s "${O[@]}" "${J[@]}" -X PUT $B/api/books/$E/progress -d '{"loc":"1:5","percent":0.1}' | j "d['progress']['loc']") / owner still $(curl -s "${C[@]}" $B/api/books/$E | j "d['progress']['loc']")"
echo "visitor can't convert: $(curl -s "${O[@]}" -H X-Mutt:1 -H Content-Type:application/json -X PUT --data-binary @"$SP/t.json" -o /dev/null -w '%{http_code}' $B/api/books/$P/text)"
echo "visitor can't touch owner's mark: $(curl -s "${O[@]}" "${J[@]}" -X DELETE -o /dev/null -w '%{http_code}' $B/api/books/$E/marks/$H)"
echo "delete book: $(curl -s "${C[@]}" -H X-Mutt:1 -X DELETE $B/api/blocks/$E | j "d['ok']")"
echo "marks gone: $(sqlite3 "$SP/data/mutt.db" 'SELECT COUNT(*) FROM book_marks; SELECT COUNT(*) FROM book_progress;' 2>/dev/null | tr '\n' ' ')"
