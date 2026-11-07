// Amounts in a recipe: reading "1 ½ cups flour" as a number, a unit and the
// rest, so a cookbook card can scale it for more people and show it in
// metric or US measures. Only the amount a line starts with changes; oven
// temperatures and tin sizes are converted wherever they are.

const FRACTIONS = { '½': 1 / 2, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 1 / 4, '¾': 3 / 4, '⅛': 1 / 8, '⅜': 3 / 8, '⅝': 5 / 8, '⅞': 7 / 8 };
const FRAC_CHARS = Object.keys(FRACTIONS).join('');
const NUM = String.raw`(?:\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?\s?[${FRAC_CHARS}]?|[${FRAC_CHARS}])`;

// kind: what it measures; sys: which way of measuring it belongs to (both = spoons).
// size: in grams, millilitres or centimetres.
const UNITS = [
  ['mg', 'mass', 'metric', 0.001, 'milligrams? mg'],
  ['g', 'mass', 'metric', 1, 'grams? grammes? gr g'],
  ['kg', 'mass', 'metric', 1000, 'kilograms? kilos? kgs? kg'],
  ['oz', 'mass', 'us', 28.3495, 'ounces? oz'],
  ['lb', 'mass', 'us', 453.592, 'pounds? lbs? lb'],
  ['ml', 'volume', 'metric', 1, 'millilit(?:re|er)s? mls? ml'],
  ['cl', 'volume', 'metric', 10, 'centilit(?:re|er)s? cl'],
  ['dl', 'volume', 'metric', 100, 'decilit(?:re|er)s? dl'],
  ['l', 'volume', 'metric', 1000, 'lit(?:re|er)s? ltrs? l'],
  ['fl oz', 'volume', 'us', 29.5735, 'fl\\.?\\s?oz fluid ounces?'],
  ['cup', 'volume', 'us', 240, 'cups? c'],
  ['pint', 'volume', 'us', 473.176, 'pints? pt'],
  ['quart', 'volume', 'us', 946.353, 'quarts? qt'],
  ['tbsp', 'volume', 'both', 15, 'tablespoons? tbsps? tbls? tbs? tbsp tb T'],
  ['tsp', 'volume', 'both', 5, 'teaspoons? tsps? tsp t'],
];
const unitAlts = UNITS.flatMap(([key, , , , words]) => words.split(' ').map((w) => [w, key]));
// Longest first, so "fl oz" wins over "oz" and "tbsp" over "t".
unitAlts.sort((a, b) => b[0].length - a[0].length);
const UNIT_RE = unitAlts.map(([w]) => w).join('|');
const LINE_RE = new RegExp(String.raw`^(\s*)(${NUM})(?:\s*(?:-|–|to)\s*(${NUM}))?(?:\s*(${UNIT_RE})(?![a-zA-Z]))?\.?(\s*)(.*)$`, 'i');
const BY_KEY = Object.fromEntries(UNITS.map(([key, kind, sys, size]) => [key, { key, kind, sys, size }]));

function unitOf(text) {
  if (!text) return null;
  for (const [w, key] of unitAlts) {
    // "T" is a tablespoon and "t" a teaspoon only as the bare letter.
    if (w.length === 1 ? text === w : new RegExp(`^(?:${w})$`, 'i').test(text)) return BY_KEY[key];
  }
  return null;
}

export function toNumber(text) {
  text = String(text || '').trim().replace(',', '.');
  let m = text.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (m) return +m[1] + m[2] / m[3];
  m = text.match(/^(\d+)\/(\d+)$/);
  if (m) return m[2] > 0 ? m[1] / m[2] : null;
  m = text.match(new RegExp(`^(\\d*(?:\\.\\d+)?)\\s?([${FRAC_CHARS}])$`));
  if (m) return (m[1] ? +m[1] : 0) + FRACTIONS[m[2]];
  return /^\d+(?:\.\d+)?$/.test(text) ? +text : null;
}

// "1 ½ cups flour, sifted" → { lead, amount, upto, unit, unitText, rest }
export function readLine(line) {
  const m = String(line || '').match(LINE_RE);
  if (!m) return { amount: null, rest: line, raw: line };
  const amount = toNumber(m[2]);
  if (amount == null) return { amount: null, rest: line, raw: line };
  let unit = unitOf(m[4]);
  let rest = m[6];
  // A lone "c" or "t" only counts when it's clearly a unit ("2 c flour"), not a word.
  if (m[4] && !unit) rest = `${m[4]}${m[5]}${rest}`;
  if (m[4] && /^[ct]$/i.test(m[4]) && !m[5]) { unit = null; rest = `${m[4]}${rest}`; }
  return {
    raw: line,
    lead: m[1],
    amountText: m[2],
    amount,
    upto: m[3] ? toNumber(m[3]) : null,
    unit,
    unitText: unit ? m[4] : '',
    gap: m[5],
    rest,
  };
}

// ------------------------------------------------------------ writing numbers

const NICE = [[0, ''], [1 / 8, '⅛'], [1 / 4, '¼'], [1 / 3, '⅓'], [1 / 2, '½'], [2 / 3, '⅔'], [3 / 4, '¾'], [1, '']];

// 1.5 → "1½", 0.333 → "⅓": how cups and spoons (and eggs) are written.
export function fraction(n) {
  if (n <= 0) return '0';
  const whole = Math.floor(n);
  const part = n - whole;
  let best = NICE[0];
  for (const f of NICE) if (Math.abs(part - f[0]) < Math.abs(part - best[0])) best = f;
  if (whole >= 10) return String(Math.round(n));
  if (best[0] === 1) return String(whole + 1);
  if (!best[1]) return String(whole || (part > 0 ? '⅛' : 0));
  return whole ? `${whole}${best[1]}` : best[1];
}

// Grams and millilitres: whole numbers, rounded the way a cook would.
function metricNumber(n) {
  if (n >= 1000) return String(Math.round(n / 5) * 5);
  if (n >= 100) return String(Math.round(n / 5) * 5);
  if (n >= 20) return String(Math.round(n));
  if (n >= 1) return String(Math.round(n * 2) / 2).replace(/\.0$/, '');
  return String(Math.round(n * 10) / 10);
}

function decimal(n) {
  return n >= 10 ? String(Math.round(n)) : String(Math.round(n * 100) / 100).replace(/\.?0+$/, '');
}

const WORDY = { cup: 'cups', pint: 'pints', quart: 'quarts' };

// The best metric or US unit for an amount of a kind (in g or ml).
function pick(base, kind, sys) {
  if (kind === 'mass') {
    if (sys === 'metric') return base >= 1000 ? ['kg', base / 1000] : ['g', base];
    return base >= 453 ? ['lb', base / 453.592] : ['oz', base / 28.3495];
  }
  if (sys === 'metric') return base >= 1000 ? ['l', base / 1000] : ['ml', base];
  if (base >= 946 * 2) return ['quart', base / 946.353];
  if (base >= 59) return ['cup', base / 240];
  if (base >= 14) return ['tbsp', base / 15];
  return ['tsp', base / 5];
}

// ------------------------------------------------------------ a whole line

// How one ingredient line reads at `factor` times the amount, in `system`
// ('as' as written, 'metric' or 'us'). Returns { amount, rest } for display:
// amount is the part in bold ("300 g"), rest the words after it.
export function showLine(line, factor = 1, system = 'as') {
  const r = readLine(line);
  if (r.amount == null) return { amount: '', rest: convertText(line, system) };
  const rest = convertText(r.rest, system);
  const keep = system === 'as' || !r.unit || r.unit.sys === 'both' || r.unit.sys === system;
  if (factor === 1 && keep) return { amount: written(r), rest };
  const lo = r.amount * factor;
  const hi = r.upto != null ? r.upto * factor : null;
  if (!r.unit) return { amount: fraction(lo) + (hi != null ? `–${fraction(hi)}` : ''), rest };
  let key = r.unit.key;
  if (keep) {
    // Spoons grow into bigger spoons (3 tsp is a tablespoon), grams into kilos.
    if (key === 'tsp' && lo >= 3) key = 'tbsp';
    else if (key === 'g' && lo >= 1000) key = 'kg';
    else if (key === 'ml' && lo >= 1000) key = 'l';
  } else {
    [key] = pick(lo * r.unit.size, r.unit.kind, system);
  }
  const conv = (n) => (n * r.unit.size) / BY_KEY[key].size;
  const top = conv(hi ?? lo);
  const word = WORDY[key] && top > 1.01 ? WORDY[key] : key;
  return { amount: `${num(conv(lo), key)}${hi != null ? `–${num(top, key)}` : ''} ${word}`, rest };
}

function num(n, key) {
  if (key === 'kg' || key === 'l') return decimal(n);
  return BY_KEY[key].sys === 'metric' ? metricNumber(n) : fraction(n);
}

function written(r) {
  const unit = r.unitText ? (r.gap || /^[a-z]/i.test(r.unitText) ? ' ' : '') + r.unitText : '';
  return `${r.amountText}${r.upto != null ? `–${fmtPlain(r.upto, r.amountText)}` : ''}${unit}`.trim();
}

function fmtPlain(n, like) {
  return /[\/½⅓⅔¼¾⅛]/.test(like) ? fraction(n) : decimal(n);
}

// Oven temperatures and tin sizes inside any text.
export function convertText(text, system) {
  if (!text || system === 'as') return text || '';
  let out = text;
  if (system === 'us') {
    out = out.replace(/(\d{2,3})\s*(?:°\s*|º\s*|degrees?\s*)?C\b(?:\s*\(?\s*(?:fan|gas mark \d+)\)?)?/g, (all, c) => `${Math.round((c * 9 / 5 + 32) / 25) * 25}°F`);
    out = out.replace(/(\d{1,3}(?:\.\d)?)\s*(?:-|\s)?\s*(?:cm|centimet(?:re|er)s?)\b/g, (all, cm) => `${Math.max(1, Math.round(cm / 2.54))}-inch`);
  } else {
    out = out.replace(/(\d{3})\s*(?:°\s*|º\s*|degrees?\s*)?F\b/g, (all, f) => `${Math.round(((f - 32) * 5 / 9) / 10) * 10}°C`);
    out = out.replace(/(\d{1,2}(?:\.\d)?)\s*(?:-|\s)?\s*(?:inch(?:es)?|in\.|")(?=\W|$)/g, (all, inch) => `${Math.round(inch * 2.54)} cm`);
  }
  return out;
}

// Which way a recipe is written, to say what "as written" means.
export function systemOf(lines) {
  let metric = 0;
  let us = 0;
  for (const line of lines || []) {
    const r = readLine(line);
    if (r.unit?.sys === 'metric') metric++;
    if (r.unit?.sys === 'us') us++;
  }
  if (!metric && !us) return null;
  return metric >= us ? 'metric' : 'us';
}

// Any amounts a unit switch would change?
export function convertible(lines, steps = []) {
  return (lines || []).some((l) => readLine(l).unit && readLine(l).unit.sys !== 'both')
    || [...(lines || []), ...(steps || [])].some((t) => /\d\s*(?:°|º|degrees?)?\s*[CF]\b|\d\s*(?:cm|inch)/.test(t));
}

// "200 g flour" → ["200 g", "flour"], for the editor's two boxes.
export function splitLine(line) {
  const r = readLine(line);
  return r.amount == null ? ['', String(line || '')] : [written(r), r.rest];
}
