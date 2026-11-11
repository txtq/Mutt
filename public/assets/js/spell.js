// Spelling: Mutt's own spellchecker. Documents use it to underline mistakes
// and correct them as you type (docspell.js); every other text box uses it to
// underline mistakes and offer corrections on right-click (spellfield.js).
//
// The words are SCOWL's English lists (all four spellings, so colour and color
// are both right), one per line, most common first, built by
// tools/make_words.py. A word's line is its rank, which orders suggestions.
// The list loads the first time something needs it.
//
// Suggestions are ranked by how far a word is from what was typed (one or two
// changes, cheaper when the change is a likely slip: swapped letters, a key
// next door, a doubled letter, a vowel for a vowel) and by how common it is.

const V = new URL(import.meta.url).search;
let RANK = null;
let loading = null;
const waiting = new Set();
const listeners = new Set();

export function loadWords() {
  loading ||= fetch(new URL(`../words/en.txt${V}`, import.meta.url))
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.text(); })
    .then((text) => {
      const m = new Map();
      let i = 0;
      for (const w of text.split('\n')) if (w) { const l = w.toLowerCase(); if (!m.has(l)) m.set(l, i); i++; }
      RANK = m;
      for (const fn of waiting) fn();
      waiting.clear();
    })
    .catch(() => { loading = null; });
  return loading;
}

export const wordsReady = () => !!RANK;

export function whenReady(fn) {
  if (RANK) { fn(); return () => {}; }
  waiting.add(fn);
  loadWords();
  return () => waiting.delete(fn);
}

// Something changed what counts as a word (a word added or ignored).
export function onWordsChanged(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ------------------------------------------------------------- your words

const KEY = 'mutt:words';
let own = null;
const ignored = new Set();

function ownWords() {
  if (!own) {
    try { own = new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch { own = new Set(); }
  }
  return own;
}

export function addWord(word) {
  ownWords().add(norm(word).toLowerCase());
  try { localStorage.setItem(KEY, JSON.stringify([...own])); } catch { /* private window: kept for this visit */ }
  listeners.forEach((fn) => fn());
}

export function ignoreWord(word) {
  ignored.add(norm(word).toLowerCase());
  listeners.forEach((fn) => fn());
}

// ------------------------------------------------------------- checking

const norm = (w) => w.replace(/’/g, "'");
const isWord = (lower) => RANK.has(lower) || ownWords().has(lower);
const rankOf = (lower) => RANK.get(lower) ?? (ownWords().has(lower) ? 2000 : Infinity);

// Letters, with apostrophes inside (don't, rock'n'roll).
export const WORD = /[A-Za-zÀ-ɏ]+(?:['’][A-Za-zÀ-ɏ]+)*/g;
// Not words to check: links, emails, @names, #tags, anything with a digit or a dot inside (file.txt).
const SKIP = /(?:https?:\/\/|www\.)\S+|\S+@\S+|[#@][\w-]+|\S*\d\S*|\w+(?:\.\w+)+|\w*_\w*/g;

// Is it spelt right (or not ours to judge)?
export function known(word) {
  if (!RANK) return true;
  const w = norm(word);
  if (w.length < 2) return true;
  if (/[^A-Za-z']/.test(w)) return true;          // accents: another language
  const lower = w.toLowerCase();
  if (isWord(lower) || ignored.has(lower)) return true;
  if (/^[A-Z]{2,}s?$/.test(w)) return true;         // NASA, PDFs
  if (/[a-z][A-Z]/.test(w)) return true;            // iPhone, camelCase
  const base = lower.replace(/'s$|'$/, '');         // the dog's, the dogs'
  if (base !== lower && (isWord(base) || /^[A-Z]/.test(w))) return true;
  return false;
}

// Does a sentence start at `i`? (Opening quotes and brackets don't count.)
export function sentenceStart(text, i) {
  let j = i - 1;
  while (j >= 0 && /[\s"'(\[{“‘*_]/.test(text[j]) && text[j] !== '\n') j--;
  if (j < 0 || text[j] === '\n') return true;
  if (!/[.!?…]/.test(text[j])) return false;
  // Not after an abbreviation: e.g. Dr. Mr. etc.
  const before = /([A-Za-z.]+)\.$/.exec(text.slice(0, j + 1));
  return !(before && /^(e\.g|i\.e|etc|vs|mr|mrs|ms|dr|st|no|approx|incl|ca|cf|[a-z])$/i.test(before[1]));
}

// The misspelt words in `text`, as { start, end, word }. A word that ends at
// `caret` is still being typed, so it's left alone.
export function mistakes(text, { caret = -1 } = {}) {
  if (!RANK || !text) return [];
  const skips = [...text.matchAll(SKIP)].map((m) => [m.index, m.index + m[0].length]);
  const found = [];
  let k = 0;
  for (const m of text.matchAll(WORD)) {
    const start = m.index;
    const end = start + m[0].length;
    while (k < skips.length && skips[k][1] <= start) k++;
    if (k < skips.length && skips[k][0] < end) continue;
    found.push({ start, end, word: m[0] });
  }
  // A capitalised word in the middle of a sentence is someone's or something's name.
  const names = new Set();
  for (const f of found) if (/^[A-Z][a-z']/.test(f.word) && !sentenceStart(text, f.start)) names.add(f.word);
  const out = [];
  for (const f of found) {
    if (f.end === caret || known(f.word)) continue;
    if (/^[A-Z]/.test(f.word) && !TYPOS[norm(f.word).toLowerCase()]) {
      // At a sentence's start, only when it's an easy slip (swapped letters, a key next door) of an everyday word.
      if (names.has(f.word) || !sentenceStart(text, f.start) || f.word.length < 4 || !slipOfCommon(f.word)) continue;
    }
    out.push(f);
  }
  return out;
}

function slipOfCommon(word) {
  let hit = false;
  edits(norm(word).toLowerCase(), (c, cost) => { if (!hit && cost <= 0.6 && (RANK.get(c) ?? Infinity) < 5000) hit = true; });
  return hit;
}

// ------------------------------------------------------------- suggestions

const ALPHA = 'abcdefghijklmnopqrstuvwxyz';
const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const NEAR = {};
ROWS.forEach((row, r) => [...row].forEach((c, i) => {
  NEAR[c] = '';
  for (const [dr, di] of [[0, -1], [0, 1], [-1, 0], [-1, 1], [1, 0], [1, -1]]) {
    const other = ROWS[r + dr]?.[i + di];
    if (other) NEAR[c] += other;
  }
}));
const VOWELS = 'aeiouy';
const SOUNDS = ['ck', 'cs', 'sz', 'fv', 'iy', 'mn', 'dt', 'bp', 'gj', 'kq'];
const sounds = (a, b) => SOUNDS.some((p) => p === a + b || p === b + a);

function swapCost(a, b) {
  if (NEAR[a]?.includes(b)) return 0.6;
  if (VOWELS.includes(a) && VOWELS.includes(b)) return 0.7;
  if (sounds(a, b)) return 0.75;
  return 1;
}

// Every word one change away from `w`, with what that change costs.
function edits(w, cb) {
  const n = w.length;
  for (let i = 0; i <= n; i++) {
    const L = w.slice(0, i);
    const R = w.slice(i);
    const first = i === 0 ? 0.3 : 0;                 // the first letter is rarely wrong
    if (R) {
      const dup = R[0] === R[1] || R[0] === L[L.length - 1];
      cb(L + R.slice(1), (dup ? 0.45 : 0.9) + first);
      if (R.length > 1 && R[0] !== R[1]) cb(L + R[1] + R[0] + R.slice(2), 0.55);
      for (const c of ALPHA) if (c !== R[0]) cb(L + c + R.slice(1), swapCost(R[0], c) + first);
    }
    for (const c of ALPHA) {
      const dup = c === R[0] || c === L[L.length - 1];
      cb(L + c + R, (dup ? 0.45 : 0.9) + first);
    }
    if (i > 0 && i < n) cb(`${L}'${R}`, 0.4);         // dont → don't
  }
}

function ranked(lower, { deep = true } = {}) {
  const best = new Map();
  const consider = (c, cost, sure = false) => {
    if (c === lower || (!sure && !isWord(c))) return;
    const was = best.get(c);
    if (was === undefined || cost < was) best.set(c, cost);
  };
  const typo = TYPOS[lower];
  const ones = new Map();
  edits(lower, (c, cost) => { const was = ones.get(c); if (was === undefined || cost < was) ones.set(c, cost); });
  for (const [c, cost] of ones) consider(c, cost);
  if (deep && best.size < 4 && lower.length >= 3 && lower.length <= 16) {
    for (const [c1, k1] of ones) edits(c1, (c, k2) => consider(c, k1 + k2));
  }
  // Two words run together: alot, thankyou.
  for (let i = 1; i < lower.length; i++) {
    const a = lower.slice(0, i);
    const b = lower.slice(i);
    if ((a.length > 1 || a === 'a' || a === 'i') && b.length > 1 && rankOf(a) < 20000 && rankOf(b) < 20000) consider(`${a} ${b}`, 0.8, true);
  }
  // A known slip always comes first.
  if (typo) best.set(typo.toLowerCase(), -10);
  return [...best].map(([word, cost]) => {
    const r = word.includes(' ') ? Math.max(...word.split(' ').map(rankOf)) : rankOf(word);
    return { word: word === typo?.toLowerCase() ? typo : word, cost: Math.max(cost, 0), score: cost * 2.2 + Math.log10(r + 50) };
  }).sort((a, b) => a.score - b.score);
}

// Give a suggestion the shape of what was typed.
function shape(typed, word, curly) {
  let out = word;
  if (/^[A-Z]{2,}$/.test(typed)) out = word.toUpperCase();
  else if (/^[A-Z]/.test(typed)) out = word[0].toUpperCase() + word.slice(1);
  out = out.replace(/^i(?=$|')/, 'I').replace(/ i(?=$|'| )/g, ' I');
  return curly ? out.replace(/'/g, '’') : out;
}

// Up to `max` corrections for a misspelt word, best first.
export function suggest(word, { max = 5, curly = /’/.test(word) } = {}) {
  if (!RANK) return [];
  const w = norm(word);
  return ranked(w.toLowerCase()).slice(0, max).map((s) => shape(w, s.word, curly));
}

// What to change a just-typed word into, if we're sure; otherwise null.
// `start` says it begins a sentence (so a capital letter isn't a name).
export function autocorrect(word, { curly = false, start = false } = {}) {
  if (!RANK) return null;
  const w = norm(word);
  const lower = w.toLowerCase();
  if (ignored.has(lower) || ownWords().has(lower)) return null;
  if (TYPOS[lower] && !(lower === 'cant' && w === 'Cant')) return shape(w, TYPOS[lower], curly);
  if (w === 'i') return 'I';
  if (/^i'(m|ve|ll|d)$/.test(w)) return shape(w, w, curly).replace(/^i/, 'I');
  if (/^[A-Z]{2}[a-z]{2,}$/.test(w) && isWord(lower)) return w[0] + w.slice(1).toLowerCase();   // THe → The
  if (known(w) || w.length < 4 || /[^A-Za-z']/.test(w)) return null;
  if (/^[A-Z]/.test(w) && !start) return null;      // a name
  const list = ranked(lower, { deep: false });
  const [a, b] = list;
  if (!a || a.cost > 0.95 || rankOf(a.word.split(' ').pop()) > 20000) return null;
  if (b && b.score - a.score < 0.9) return null;    // two good guesses: not sure enough
  return shape(w, a.word, curly);
}

// Slips people make all the time, and contractions written without the apostrophe.
const TYPOS = Object.fromEntries(`
dont:don't doesnt:doesn't didnt:didn't isnt:isn't wasnt:wasn't arent:aren't werent:weren't
couldnt:couldn't wouldnt:wouldn't shouldnt:shouldn't havent:haven't hasnt:hasn't hadnt:hadn't
mustnt:mustn't cant:can't wont:won't im:I'm ive:I've youre:you're youve:you've youll:you'll
youd:you'd theyre:they're theyve:they've theyll:they'll thats:that's whats:what's theres:there's
heres:here's wheres:where's whos:who's hows:how's shes:she's itll:it'll wouldve:would've
couldve:could've shouldve:should've mightve:might've
teh:the hte:the adn:and nad:and taht:that thta:that tihs:this thsi:this waht:what wnat:want
jsut:just konw:know knwo:know yuo:you yoru:your hwo:how abotu:about baout:about wiht:with
thnak:thank thansk:thanks plese:please pleaes:please goign:going agian:again aswell:as_well
infact:in_fact eachother:each_other everytime:every_time alot:a_lot thier:their theif:thief
recieve:receive recieved:received reciept:receipt beleive:believe belive:believe
definately:definitely definatly:definitely definetly:definitely seperate:separate
seperately:separately occured:occurred occuring:occurring occurence:occurrence untill:until
wich:which whcih:which becuase:because becasue:because beacuse:because becuse:because
accomodate:accommodate acheive:achieve adress:address arguement:argument begining:beginning
calender:calendar collegue:colleague comming:coming commited:committed concious:conscious
dissapoint:disappoint dissapointed:disappointed embarass:embarrass enviroment:environment
existance:existence experiance:experience familar:familiar finaly:finally foriegn:foreign
freind:friend freinds:friends goverment:government gaurd:guard happend:happened
harrass:harass independant:independent interupt:interrupt knowlege:knowledge liason:liaison
libary:library maintainance:maintenance millenium:millennium mispell:misspell
neccessary:necessary necesary:necessary noticable:noticeable ocasion:occasion peice:piece
persue:pursue posession:possession prefered:preferred presense:presence probaly:probably
publically:publicly realy:really reccomend:recommend recomend:recommend refered:referred
relevent:relevant religous:religious remeber:remember rember:remember resistence:resistance
rythm:rhythm sieze:seize similiar:similar sincerly:sincerely speach:speech
succesful:successful successfull:successful suprise:surprise suprised:surprised
temperture:temperature tommorow:tomorrow tomorow:tomorrow tommorrow:tomorrow tounge:tongue
truely:truly wierd:weird whereever:wherever writting:writing yeild:yield wrod:word
recipie:recipe resturant:restaurant restaraunt:restaurant buisness:business bussiness:business
basicly:basically basicaly:basically beautifull:beautiful beatiful:beautiful
completly:completely diffrent:different differnt:different easliy:easily enought:enough
esspecially:especially expecially:especially exept:except foward:forward gratefull:grateful
greatful:grateful hapen:happen helpfull:helpful immediatly:immediately intresting:interesting
interseting:interesting langauge:language lenght:length managment:management minuites:minutes
naturaly:naturally oppurtunity:opportunity opportunites:opportunities orignal:original
peopel:people poeple:people persoanl:personal possibile:possible priviledge:privilege
questionaire:questionnaire reallly:really responsability:responsibility
scedule:schedule schedual:schedule sentance:sentence shoudl:should shoud:should
somthing:something somehting:something soemthing:something stregth:strength strenght:strength
studing:studying thougth:thought thoguht:thought throught:through togehter:together
tomatos:tomatoes potatos:potatoes usefull:useful usualy:usually vaccum:vacuum wether:whether
wendsday:Wednesday wednsday:Wednesday febuary:February
`.trim().split(/\s+/).map((pair) => pair.replace(/_/g, ' ').split(':')));
