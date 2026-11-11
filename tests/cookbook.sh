#!/bin/bash
# Cookbook mode: which planets are offered it, reading recipe notes into cards,
# saving a card (the note is rewritten), chapters, the dish photo, visitors.
SP="$1"; B=localhost:8099
J=(-H Content-Type:application/json -H X-Mutt:1); C=(-b "$SP/c.txt" -c "$SP/c.txt"); V=(-b "$SP/v.txt" -c "$SP/v.txt")
j() { python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"; }
note() { python3 -c "import json,sys; print(json.dumps({'content': sys.argv[1], 'drawer': sys.argv[2]}))" "$1" "$2" |
  curl -s "${C[@]}" "${J[@]}" -X POST $B/api/blocks -d @- | j "d['block']['id']"; }
curl -s "${C[@]}" "${J[@]}" -X POST $B/api/auth/signup -d '{"username":"cook","pin":"482193"}' >/dev/null
D=$(curl -s "${C[@]}" "${J[@]}" -X POST $B/api/drawers -d '{"title":"Stuff"}' | j "d['drawer']['id']")
R1=$(note $'Banana bread\nServes 8 · Prep 15 min · Cook 1 hr\n\nIngredients\n- 3 ripe bananas\n- 100 g butter, melted\n- 150 g sugar\n- 190 g flour\n\nMethod\n1. Preheat the oven to 175°C.\n2. Mash the bananas and mix in the rest.\n3. Bake for 60 minutes.' "$D")
echo "one recipe on its own: $(curl -s "${C[@]}" $B/api/drawers/$D/modes | j "d['cookbook']")"
R2=$(note $'Weeknight chicken curry\nserves 4\n500g chicken thighs\n1 onion\n2 tbsp curry paste\n400ml coconut milk\nFry the onion until soft.\nAdd the chicken and paste, cook 5 mins.\nPour in the coconut milk and simmer 20 minutes.' "$D")
L=$(note 'buy milk' "$D")
echo "two recipes + a note: $(curl -s "${C[@]}" $B/api/drawers/$D/modes | j "d['cookbook']['fits'], d['cookbook']['signs']")"
N=$(curl -s "${C[@]}" "${J[@]}" -X POST $B/api/drawers -d '{"title":"Shopping"}' | j "d['drawer']['id']")
note $'milk\neggs\nbread\nbutter' "$N" >/dev/null
echo "a shopping list isn't: $(curl -s "${C[@]}" $B/api/drawers/$N/modes | j "d['cookbook']['fits']")"
K=$(curl -s "${C[@]}" "${J[@]}" -X POST $B/api/drawers -d '{"title":"Recipes to try"}' | j "d['drawer']['id']")
note $'Pesto\n2 cups basil\n1/2 cup parmesan\n1/3 cup pine nuts\nBlend it all.' "$K" >/dev/null
echo "named + one: $(curl -s "${C[@]}" $B/api/drawers/$K/modes | j "d['cookbook']['fits'], d['cookbook']['signs']")"
# Casual recipes: a comma list of what goes in, a list with no method, a method in sentences.
F=$(curl -s "${C[@]}" "${J[@]}" -X POST $B/api/drawers -d '{"title":"Dinner ideas"}' | j "d['drawer']['id']")
note $'Pasta aglio e olio\nspaghetti, garlic, olive oil, chilli flakes, parsley\nCook the pasta. Fry the garlic in the oil and toss it all together.' "$F" >/dev/null
note $'Guacamole\n2 avocados\n1 lime\nsalt\ncoriander' "$F" >/dev/null
note 'Book a table at Luigis for Friday' "$F" >/dev/null
echo "casual, named for food: $(curl -s "${C[@]}" $B/api/drawers/$F/modes | j "d['cookbook']['fits'], d['cookbook']['food'], d['cookbook']['signs']")"
E=$(curl -s "${C[@]}" "${J[@]}" -X POST $B/api/drawers -d '{"title":"🍝"}' | j "d['drawer']['id']")
note $'Mums lasagne\nBrown the mince with onion and garlic, add passata and simmer for an hour. Layer with the sheets and bechamel, top with cheese and bake for 40 min.' "$E" >/dev/null
echo "an emoji name, one method: $(curl -s "${C[@]}" $B/api/drawers/$E/modes | j "d['cookbook']['fits'], d['cookbook']['signs']")"
O=$(curl -s "${C[@]}" "${J[@]}" -X POST $B/api/drawers -d '{"title":"Odds and ends"}' | j "d['drawer']['id']")
note $'Pancakes\nIngredients: flour, eggs, milk, butter\nWhisk everything, rest 30 min, fry in butter.' "$O" >/dev/null
note $'Pasta aglio e olio\nspaghetti, garlic, olive oil, chilli flakes, parsley\nCook the pasta. Fry the garlic in the oil and toss it all together.' "$O" >/dev/null
note $'Things to do\ncall mum\nbook dentist' "$O" >/dev/null
echo "unnamed, two casual recipes: $(curl -s "${C[@]}" $B/api/drawers/$O/modes | j "d['cookbook']['fits'], d['cookbook']['signs']")"
X=$(curl -s "${C[@]}" "${J[@]}" -X POST $B/api/drawers -d '{"title":"Notes"}' | j "d['drawer']['id']")
note $'Had pasta at Luigis tonight, the garlic bread was amazing and the tiramisu too.' "$X" >/dev/null
note $'Autumn\nleaves fall softly\nthe kettle sings' "$X" >/dev/null
note $'Standup\nAlice, Bob, Carol\nship the release, fix login' "$X" >/dev/null
echo "not food (no): $(curl -s "${C[@]}" $B/api/drawers/$X/modes | j "d['cookbook']['fits']")"
# Notes that only name a dish ("fish w/couscous") and notes listing meals.
CB=$(curl -s "${C[@]}" "${J[@]}" -X POST $B/api/drawers -d '{"title":"cook book"}' | j "d['drawer']['id']")
for t in "beck's curry with big couscous" 'beef slop w/potato onion pepper mushroom' 'fish w/couscous' 'portabello and chickpea' 'feta and crackers'; do note "$t" "$CB" >/dev/null; done
echo "dish names, cook book: $(curl -s "${C[@]}" $B/api/drawers/$CB/modes | j "d['cookbook']['fits'], d['cookbook']['signs']")"
UN=$(curl -s "${C[@]}" "${J[@]}" -X POST $B/api/drawers -d '{"title":"Stuff 2"}' | j "d['drawer']['id']")
for t in 'fish w/couscous' 'portabello and chickpea' 'chicken katsu' 'buy stamps'; do note "$t" "$UN" >/dev/null; done
echo "dish names, unnamed: $(curl -s "${C[@]}" $B/api/drawers/$UN/modes | j "d['cookbook']['fits'], d['cookbook']['signs']")"
DL=$(curl -s "${C[@]}" "${J[@]}" -X POST $B/api/drawers -d '{"title":"Ideas"}' | j "d['drawer']['id']")
LIST=$(note $'Dinners\n- lasagne\n- fish w/couscous\n- chicken katsu\n- tomato soup\n- beans on toast' "$DL")
echo "a list of meals: $(curl -s "${C[@]}" $B/api/drawers/$DL/modes | j "d['cookbook']['fits'], d['cookbook']['signs']")"
GL=$(curl -s "${C[@]}" "${J[@]}" -X POST $B/api/drawers -d '{"title":"Weekly"}' | j "d['drawer']['id']")
note $'milk\neggs\n2 onions\nchicken thighs\nbeef mince\nrice\nfrozen peas' "$GL" >/dev/null
echo "an unnamed grocery list isn't: $(curl -s "${C[@]}" $B/api/drawers/$GL/modes | j "d['cookbook']['fits']")"
echo "dish cards: $(curl -s "${C[@]}" "${J[@]}" -X POST $B/api/drawers/$CB/cookify | j "sorted(r['title'] for r in d['box']['recipes'])")"
echo "list split into cards: $(curl -s "${C[@]}" "${J[@]}" -X POST $B/api/drawers/$DL/cookify | j "sorted(r['title'] for r in d['box']['recipes'])")"
echo "split once: $(curl -s "${C[@]}" "${J[@]}" -X POST $B/api/drawers/$DL/cookify | j "len(d['box']['recipes'])") $(curl -s "${C[@]}" $B/api/blocks/$LIST | j "d['block']['content'].count(chr(10))")"
echo "casual cards read: $(curl -s "${C[@]}" "${J[@]}" -X POST $B/api/drawers/$F/cookify | j "[(r['title'], len(r['ingredients']), len(r['steps'])) for r in d['box']['recipes']]")"
echo "cookify: $(curl -s "${C[@]}" "${J[@]}" -X POST $B/api/drawers/$D/cookify | j "d['drawer']['modes']['cookbook'], [(r['title'], r['chapter'], r['serves'], r['prep'], r['cook'], len(r['ingredients']), len(r['steps'])) for r in d['box']['recipes']], d['box']['chapters']")"
echo "save card: $(curl -s "${C[@]}" "${J[@]}" -X PUT $B/api/blocks/$R2/recipe -d '{"title":"Chicken curry","serves":6,"prep":10,"ingredients":["600g chicken thighs","For the rice:","300 g basmati"],"notes":"Good with naan.","chapter":"Weeknights"}' | j "d['recipe']['title'], d['recipe']['chapter'], d['recipe']['serves']")"
echo "note rewritten:"; curl -s "${C[@]}" $B/api/blocks/$R2 | j "d['block']['title'] + '\n' + d['block']['content']"
python3 -c "import zlib,struct,sys
c=lambda t,d: struct.pack('>I',len(d))+t+d+struct.pack('>I',zlib.crc32(t+d))
open(sys.argv[1],'wb').write(b'\x89PNG\r\n\x1a\n'+c(b'IHDR',struct.pack('>IIBBBBB',2,2,8,2,0,0,0))+c(b'IDAT',zlib.compress(b'\0'+b'\xc0\x80\x40'*2+b'\0'+b'\xc0\x80\x40'*2))+c(b'IEND',b''))" "$SP/dish.png"
P=$(curl -s "${C[@]}" -H X-Mutt:1 -H 'Content-Type: image/png' --data-binary @"$SP/dish.png" "$B/api/upload?drawer=$D&name=dish.png" | j "d['block']['id']")
echo "photo: $(curl -s "${C[@]}" "${J[@]}" -X PUT $B/api/blocks/$R1/recipe -d "{\"photo\":\"$P\"}" | j "bool(d['recipe']['photo']), d['recipe']['photo']['id'] == '$P'")"
echo "bad photo: $(curl -s "${C[@]}" "${J[@]}" -X PUT $B/api/blocks/$R1/recipe -d '{"photo":"nope"}' | j "d['error']")"
echo "bad field: $(curl -s "${C[@]}" "${J[@]}" -X PUT $B/api/blocks/$R1/recipe -d '{"serves":"lots"}' | j "d['error']")"
# Edited as a note elsewhere: read again, chapter and photo kept.
curl -s "${C[@]}" "${J[@]}" -X PATCH $B/api/blocks/$R1 -d '{"content":"Banana bread\nServes 10\n\nIngredients\n- 4 bananas\n- 100 g butter\n\nMethod\n1. Mix.\n2. Bake."}' >/dev/null
echo "edited note: $(curl -s "${C[@]}" $B/api/drawers/$D/recipes | j "[(r['title'], r['serves'], r['ingredients'], r['chapter'], bool(r['photo'])) for r in d['recipes'] if r['id'] == '$R1'], d['photos'] == ['$P']")"
echo "rename chapter: $(curl -s "${C[@]}" "${J[@]}" -X POST $B/api/drawers/$D/chapters -d '{"from":"Baking","to":"Breads & bakes"}' | j "d['chapters'], [r['chapter'] for r in d['recipes']]")"
echo "new card: $(curl -s "${C[@]}" "${J[@]}" -X POST $B/api/drawers/$D/recipes -d '{"title":"Chocolate mousse","ingredients":["200 g dark chocolate","4 eggs"]}' | j "d['recipe']['title'], d['recipe']['chapter'], d['block']['content'][:40]")"
BL=$(curl -s "${C[@]}" "${J[@]}" -X POST $B/api/drawers/$D/recipes -d '{}' | j "d['recipe']['id']")
echo "blank card named: $(curl -s "${C[@]}" "${J[@]}" -X PUT $B/api/blocks/$BL/recipe -d '{"title":"Lemonade","ingredients":["4 lemons"]}' | j "d['recipe']['title'], d['recipe']['chapter']")"
echo "chapter order: $(curl -s "${C[@]}" "${J[@]}" -X PATCH $B/api/drawers/$D -d '{"modes":{"cookbook":{"chapters":["Desserts","Weeknights"]}}}' >/dev/null; curl -s "${C[@]}" $B/api/drawers/$D/recipes | j "d['chapters']")"
echo "bad setting: $(curl -s "${C[@]}" "${J[@]}" -X PATCH $B/api/drawers/$D -d '{"modes":{"cookbook":{"on":"yes"}}}' | j "d['error']")"
# A visitor sees the cards of a public planet, read-only.
curl -s "${C[@]}" "${J[@]}" -X PATCH $B/api/drawers/$D -d '{"visibility":"public"}' >/dev/null
curl -s "${V[@]}" "${J[@]}" -X POST $B/api/auth/signup -d '{"username":"guest","pin":"593093"}' >/dev/null
echo "visitor: $(curl -s "${V[@]}" $B/api/drawers/$D/recipes | j "[(r['title'], r['mine']) for r in d['recipes']]")"
echo "visitor photo: $(curl -s "${V[@]}" -o /dev/null -w '%{http_code}' "$B/f/$P/dish.png")"
echo "visitor can't save: $(curl -s "${V[@]}" "${J[@]}" -X PUT $B/api/blocks/$R1/recipe -d '{"title":"x"}' | j "d['error']")"
echo "visitor can't cookify: $(curl -s "${V[@]}" "${J[@]}" -X POST $B/api/drawers/$D/cookify | j "d['error']")"
curl -s "${C[@]}" "${J[@]}" -X PATCH $B/api/drawers/$D -d '{"visibility":"pin"}' >/dev/null
echo "private again: $(curl -s "${V[@]}" $B/api/drawers/$D/recipes | j "d['error']")"
echo "off: $(curl -s "${C[@]}" "${J[@]}" -X PATCH $B/api/drawers/$D -d '{"modes":{"cookbook":{"on":false,"dismissed":true}}}' | j "d['drawer']['modes']['cookbook']")"
