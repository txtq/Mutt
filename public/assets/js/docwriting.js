// Mutt documents: kinds of writing. A document is set for what it is (prose,
// a poem, a script, a journal, a letter) and the editor brings that kind's
// page and tools. Left on Auto, the kind is read from the words as you write
// (the server reads the same signs in documents.reads_as); it can also be
// picked by hand from the toolbar.
//
// This file holds what each kind knows: how to spot it, and its helpers
// (syllables and rhymes for poems, a script's lines, journal dates, letter
// greetings and sign-offs). The editor (doceditor.js) does the rest.

import { looksLikePoem } from './docformat.js';

export const KINDS = {
  prose: { label: 'Prose', a: 'prose', blurb: 'Essays, stories, notes: paragraphs and headings' },
  poem: { label: 'Poem', a: 'a poem', blurb: 'Lines kept as written, with syllables and rhymes' },
  script: { label: 'Script', a: 'a script', blurb: 'Scene headings, characters and dialogue, set like a screenplay' },
  journal: { label: 'Journal', a: 'a journal', blurb: 'Dated entries, one for each day you write' },
  letter: { label: 'Letter', a: 'a letter', blurb: 'The date, a greeting and a sign-off' },
};

// ------------------------------------------------------------ reading the words

const SCENE = /^\s*(?:INT|EXT|EST|INT\.?\s*\/\s*EXT|I\/E)[.\s]/i;
const CUE = /^\s*[A-Z][A-Z0-9 .'’-]{0,28}(?:\s*\((?:V\.O\.|O\.S\.|O\.C\.|CONT['’]D)\))?\s*$/;
const TRANSITION = /^\s*(?:[A-Z ]+ TO:|FADE (?:IN|OUT)[.:]|CUT TO BLACK\.?)\s*$/;
const MONTHS = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const WEEKDAY = '(?:(?:mon|tues?|wed(?:nes)?|thu(?:rs)?|fri|sat(?:ur)?|sun)(?:day)?\\.?,?\\s+)?';
const DATE_LINE = new RegExp(`^\\s*${WEEKDAY}(?:\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTHS}\\.?(?:,?\\s+\\d{4})?`
  + `|${MONTHS}\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?|\\d{4}-\\d{2}-\\d{2}|\\d{1,2}[/.]\\d{1,2}[/.]\\d{2,4})`
  + '(?:\\s*[,·–—-]\\s*.{0,30})?\\s*$', 'i');
const GREETING = /^\s*(?:dear|dearest|my dear|hi|hello|hey|to)\s+[^\n]{1,40}[,:!—–-]\s*$/i;
const SIGNOFF = /^\s*(?:love|lots of love|all my love|with love|yours(?: truly| sincerely| faithfully| ever| always)?|sincerely(?: yours)?|best(?: wishes)?|all the best|warmly|warm(?:est)? regards|kind regards|regards|cheers|thanks|thank you|many thanks|until soon|see you soon|x+|xo+)\s*[,.!]?\s*$/i;

export const isScene = (t) => SCENE.test(t);
export const isTransition = (t) => TRANSITION.test(t);
export const isDateLine = (t) => t.length <= 60 && DATE_LINE.test(t);
export const isGreeting = (t) => GREETING.test(t);
export const isSignoff = (t) => SIGNOFF.test(t);
const isCue = (t) => CUE.test(t) && !SCENE.test(t) && !TRANSITION.test(t) && t.trim().split(/\s+/).length <= 4 && /[A-Z]{2}/.test(t);

const clean = (t) => (t || '').replace(/[​ ]/g, (c) => (c === ' ' ? ' ' : ''));

// The document's lines, top to bottom.
export function linesOf(root) {
  const out = [];
  for (const el of root.children) {
    if (el.classList.contains('de-gap') || el.classList.contains('pb')) continue;
    const text = clean(el.innerText ?? el.textContent);
    for (const line of text.split('\n')) if (line.trim()) out.push(line);
  }
  return out;
}

function scriptish(lines, root) {
  // Written as a script already: it has scene headings or names, not only action lines.
  if (root?.querySelector(':scope > p.sc-scene, :scope > p.sc-char')) return true;
  const scenes = lines.filter((l) => SCENE.test(l)).length;
  const cues = lines.slice(0, -1).filter((l, i) => isCue(l) && !isCue(lines[i + 1])).length;
  const fade = lines.some((l) => TRANSITION.test(l));
  return scenes >= 2 || (scenes >= 1 && (cues >= 2 || fade)) || (cues >= 4 && cues >= lines.length * 0.2);
}

function journalish(lines) {
  const dates = lines.filter(isDateLine).length;
  return dates >= 2 && lines.length >= dates * 2;
}

function letterish(lines) {
  if (!lines.length) return false;
  const opening = lines.slice(0, 3);
  const greet = opening.some((l) => GREETING.test(l));
  const signed = lines.slice(-4).some((l) => SIGNOFF.test(l));
  return greet && (signed || /^\s*(?:dear|dearest|my dear)\b/i.test(opening.join(' ')));
}

// What the words read as, or null when there's too little to say.
export function readsAs(root) {
  const lines = linesOf(root);
  if (!lines.length) return null;
  if (scriptish(lines, root)) return 'script';
  if (journalish(lines)) return 'journal';
  if (letterish(lines)) return 'letter';
  if (looksLikePoem(root)) return 'poem';
  return 'prose';
}

// Does it still look like this kind? A lower bar than turning into it, so a
// kind doesn't flicker on and off while you write.
export function stillReads(kind, root) {
  const lines = linesOf(root);
  if (kind === 'script') return scriptish(lines, root) || lines.some((l) => SCENE.test(l));
  if (kind === 'journal') return !!root.querySelector(':scope > h2.dated') || lines.some(isDateLine);
  if (kind === 'letter') return lines.slice(0, 3).some((l) => GREETING.test(l));
  if (kind === 'poem') {
    if (lines.length < 2) return true;
    const avg = lines.reduce((a, l) => a + l.length, 0) / lines.length;
    return avg < 62 && lines.filter((l) => /[.!?]$/.test(l.trim())).length <= lines.length * 0.6;
  }
  return true;
}

// ------------------------------------------------------------ poems

// The poem's lines as ranges in the text, so marks can sit beside them.
// Each top-level paragraph is a stanza; its lines are split by line breaks.
export function poemLines(root) {
  const out = [];
  let stanza = 0;
  for (const el of root.children) {
    if (!/^(P|BLOCKQUOTE)$/.test(el.tagName)) continue;
    let nodes = [];
    let had = false;
    const close = () => {
      const text = clean(nodes.map((n) => n.textContent).join(''));
      if (text.trim()) {
        const r = document.createRange();
        r.setStartBefore(nodes[0]);
        r.setEndAfter(nodes[nodes.length - 1]);
        out.push({ range: r, text, stanza });
        had = true;
      }
      nodes = [];
    };
    const walk = (parent) => {
      for (const n of parent.childNodes) {
        if (n.nodeType === 1 && n.classList.contains('de-gap')) continue;
        if (n.nodeName === 'BR') { close(); continue; }
        if (n.nodeType === 1 && /^(P|DIV)$/.test(n.tagName)) { close(); walk(n); close(); continue; }
        if (n.nodeType === 3 && n.data.includes('\n')) {
          // A line break typed as a character (rare): treat it like <br>.
          nodes.push(n);
          continue;
        }
        nodes.push(n);
      }
    };
    walk(el);
    close();
    if (had) stanza++;
  }
  return out;
}

// About how many syllables a line has (English; a good guess, not a dictionary).
export function syllables(line) {
  let n = 0;
  for (const raw of clean(line).toLowerCase().match(/[a-zà-ÿ']+/g) || []) {
    let w = raw.replace(/'/g, '');
    if (!w) continue;
    if (w.length <= 3) { n += 1; continue; }
    w = w.replace(/(?:[^laeiouy]es|[^laeiouy]ed|[^laeiouy]e)$/, '').replace(/^y/, '');
    const groups = w.match(/[aeiouyà-ÿ]{1,2}/g);
    n += Math.max(1, groups ? groups.length : 1);
  }
  return n;
}

// The sound a line ends on, roughly: words with the same key rhyme.
export function rhymeKey(line) {
  const word = (clean(line).toLowerCase().match(/[a-z']+(?=[^a-z']*$)/) || [''])[0].replace(/'/g, '');
  if (!word) return '';
  let w = word.replace(/eigh/g, 'A').replace(/igh/g, 'I');
  w = w.replace(/([aeiouy])([^aeiouyAEIOU])e$/, (m, v, c) => ({ a: 'A', e: 'E', i: 'I', o: 'O', u: 'U', y: 'I' }[v] + c));
  w = w.replace(/ee|ea/g, 'E').replace(/ai|ay|ey$/g, 'A').replace(/oa|ow$|oe$/g, 'O').replace(/oo|ew$|ue$/g, 'U');
  if (/^[^aeiouyAEIOU]*y$/.test(w)) w = w.replace(/y$/, 'I');
  else if (/[^aeiouAEIOU]y$/.test(w)) w = w.replace(/y$/, 'E');
  if (/^[^aeiouyAEIOU]*e$/.test(w)) w = w.replace(/e$/, 'E');
  if (/^[^aeiouyAEIOU]*o$/.test(w)) w = w.replace(/o$/, 'O');
  w = w.replace(/y/g, 'i');
  const m = w.match(/[aeiouAEIOU]+[^aeiouAEIOU]*$/);
  return m ? m[0] : w;
}

// A letter for each line's end sound (A, B, A, B…) and which of them rhyme.
export function rhymeScheme(lines) {
  const keys = lines.map((l) => rhymeKey(l.text ?? l));
  const tails = lines.map((l) => (clean(l.text ?? l).toLowerCase().match(/[a-z]+(?=[^a-z]*$)/) || [''])[0]);
  const letters = [];
  const of = new Map();
  const seen = new Map();
  keys.forEach((k, i) => {
    let found = k && of.get(k);
    if (!found && tails[i].length >= 4) {
      for (const [j, t] of tails.slice(0, i).entries()) if (t.length >= 4 && t.slice(-3) === tails[i].slice(-3)) { found = letters[j]; break; }
    }
    if (!found) found = String.fromCharCode(65 + (of.size % 26));
    if (k && !of.has(k)) of.set(k, found);
    letters.push(found);
    seen.set(found, (seen.get(found) || 0) + 1);
  });
  return { letters, rhymes: letters.map((l) => seen.get(l) > 1) };
}

// The name of the form, when the poem has a well-known one.
export function formOf(lines, sylls, letters) {
  const n = lines.length;
  const sizes = [];
  for (const l of lines) sizes[l.stanza] = (sizes[l.stanza] || 0) + 1;
  const stanzas = sizes.filter(Boolean);
  const scheme = letters.join('');
  const near = (want) => want.every((s, i) => Math.abs((sylls[i] || 0) - s) <= 1);
  if (n === 3 && near([5, 7, 5])) return 'Haiku';
  if (n === 5 && /^AABBA$/.test(scheme)) return 'Limerick';
  if (n === 5 && near([5, 7, 5, 7, 7])) return 'Tanka';
  if (n === 14) {
    if (/^ABABCDCDEFEFGG$/.test(scheme)) return 'Shakespearean sonnet';
    if (/^ABBAABBA/.test(scheme)) return 'Petrarchan sonnet';
    return 'Sonnet';
  }
  if (n === 19 && stanzas.length === 6 && stanzas.slice(0, 5).every((s) => s === 3) && stanzas[5] === 4) return 'Villanelle';
  if (stanzas.length >= 2 && stanzas.every((s) => s === stanzas[0])) {
    return { 2: 'Couplets', 3: 'Tercets', 4: 'Quatrains', 5: 'Cinquains', 6: 'Sestets', 8: 'Octaves' }[stanzas[0]] || null;
  }
  return null;
}

// ------------------------------------------------------------ scripts

// The parts of a script. Enter after one starts the `after` part; Enter on an
// empty one turns it into `blank`; Tab turns it into `tab`.
export const ELEMENTS = {
  scene: { label: 'Scene heading', hint: 'INT. PLACE – DAY', after: 'action', blank: 'action', tab: 'action', caps: true, key: '1' },
  action: { label: 'Action', hint: 'What we see', after: 'action', blank: 'char', tab: 'char', key: '2' },
  char: { label: 'Character', hint: 'NAME', after: 'dial', blank: 'action', tab: 'trans', caps: true, key: '3' },
  paren: { label: 'Parenthetical', hint: '(how it’s said)', after: 'dial', blank: 'dial', tab: 'dial', key: '4' },
  dial: { label: 'Dialogue', hint: 'What they say', after: 'char', blank: 'action', tab: 'paren', key: '5' },
  trans: { label: 'Transition', hint: 'CUT TO:', after: 'scene', blank: 'scene', tab: 'scene', caps: true, key: '6' },
};
const SC = Object.keys(ELEMENTS).map((k) => `sc-${k}`);

export function elementOf(block) {
  if (!block) return 'action';
  for (const k of Object.keys(ELEMENTS)) if (block.classList.contains(`sc-${k}`)) return k;
  return 'action';
}

export function setElement(block, kind) {
  block.classList.remove(...SC);
  block.classList.add(`sc-${kind}`);
}

// Turn written-out text into a script's parts: scene headings, character
// names over their lines, parentheticals, transitions; the rest is action.
// "NAME: what they say" (a play's way) becomes a name and its dialogue.
export function toScript(root) {
  const blocks = [...root.children];
  const out = [];
  for (const el of blocks) {
    if (el.tagName !== 'P' && !/^H[1-4]$/.test(el.tagName)) { out.push(el); continue; }
    if (SC.some((c) => el.classList.contains(c))) { out.push(el); continue; }
    if (el.classList.contains('title') || el.classList.contains('subtitle')) { out.push(el); continue; }
    // One paragraph may hold several lines (a name and its speech).
    const lines = [];
    let cur = document.createElement('p');
    for (const n of [...el.childNodes]) {
      if (n.nodeName === 'BR') { lines.push(cur); cur = document.createElement('p'); continue; }
      cur.append(n);
    }
    lines.push(cur);
    let speaking = false;
    for (const p of lines) {
      const text = clean(p.textContent).trim();
      if (!text) continue;
      const play = !speaking && /^([A-Z][A-Za-z .'’-]{0,24}):\s+(.+)$/.exec(text);
      if (play && play[1].split(/\s+/).length <= 3) {
        const name = document.createElement('p');
        name.textContent = play[1].toUpperCase();
        setElement(name, 'char');
        const said = document.createElement('p');
        said.textContent = play[2];
        setElement(said, 'dial');
        out.push(name, said);
        continue;
      }
      let kind = 'action';
      if (SCENE.test(text)) kind = 'scene';
      else if (TRANSITION.test(text) && !/^FADE IN/i.test(text)) kind = 'trans';
      else if (isCue(text) && lines.length > 1) kind = 'char';
      else if (speaking && /^\(.*\)$/.test(text)) kind = 'paren';
      else if (speaking) kind = 'dial';
      speaking = kind === 'char' || kind === 'paren' || (kind === 'dial' && lines.length > 1);
      if (ELEMENTS[kind].caps) p.textContent = text.toUpperCase();
      setElement(p, kind);
      out.push(p);
    }
    // A name alone in its paragraph, speech in the next one.
    if (lines.length === 1) {
      const p = out[out.length - 1];
      if (p && elementOf(p) === 'action' && isCue(clean(p.textContent)) && el.nextElementSibling?.textContent.trim()) {
        p.textContent = clean(p.textContent).trim().toUpperCase();
        setElement(p, 'char');
      }
    }
  }
  // Paragraphs after a lone name are its dialogue.
  for (let i = 1; i < out.length; i++) {
    const prev = out[i - 1];
    if (prev.tagName === 'P' && elementOf(prev) === 'char' && prev.classList.contains('sc-char') && out[i].tagName === 'P' && elementOf(out[i]) === 'action') {
      setElement(out[i], /^\(.*\)$/.test(clean(out[i].textContent).trim()) ? 'paren' : 'dial');
    }
    if (prev.tagName === 'P' && elementOf(prev) === 'paren' && out[i].tagName === 'P' && elementOf(out[i]) === 'action') setElement(out[i], 'dial');
  }
  root.replaceChildren(...out);
  if (!root.firstChild) { const p = document.createElement('p'); p.append(document.createElement('br')); setElement(p, 'scene'); root.append(p); }
}

// The names already in the script, for finishing one as it's typed.
export function castOf(root, except = null) {
  const names = new Map();
  for (const el of root.querySelectorAll(':scope > p.sc-char')) {
    if (el === except) continue;
    const name = clean(el.textContent).replace(/\s*\(.*\)\s*$/, '').trim();
    if (name) names.set(name, (names.get(name) || 0) + 1);
  }
  return [...names.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
}

// ------------------------------------------------------------ journals and letters

export const longDate = (d = new Date()) => d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
export const letterDate = (d = new Date()) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

// The day a date line means, or null.
export function dayOf(text) {
  const t = clean(text).replace(/(\d)(st|nd|rd|th)\b/gi, '$1').replace(/\bof\b/gi, '').replace(/[·–—]/g, ' ').trim();
  let ms = Date.parse(t);
  if (Number.isNaN(ms)) ms = Date.parse(`${t} ${new Date().getFullYear()}`);
  if (Number.isNaN(ms)) return null;
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };

// In a journal, a line that is only a date heads an entry (also the first
// line of a paragraph, with the day's writing under it).
export function markEntries(root) {
  let changed = false;
  for (const el of [...root.children]) {
    if (el.dataset.keep !== undefined || el.querySelector('img')) continue;
    if (el.tagName === 'H2' && el.classList.contains('dated')) continue;
    if (!/^(P|H[1-4])$/.test(el.tagName) || (el.classList.length && !el.classList.contains('dated'))) continue;
    const br = el.tagName === 'P' ? [...el.childNodes].find((n) => n.nodeName === 'BR') : null;
    const first = br ? [...el.childNodes].slice(0, [...el.childNodes].indexOf(br)) : [...el.childNodes];
    const text = clean(first.map((n) => n.textContent).join('')).trim();
    if (!text || !isDateLine(text)) continue;
    const head = document.createElement('h2');
    head.className = 'dated';
    head.append(...first);
    if (br && br.nextSibling) {
      br.remove();
      el.before(head);
    } else {
      br?.remove();
      el.replaceWith(head);
    }
    changed = true;
  }
  return changed;
}

export const SIGNOFFS = ['Love,', 'With love,', 'Warmly,', 'Best wishes,', 'All the best,', 'Kind regards,', 'Yours sincerely,', 'Yours faithfully,', 'Thank you,'];
