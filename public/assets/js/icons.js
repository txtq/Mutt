// Mutt's one icon set. DESIGN.md "Icons" has the rules; this file is the only place an icon is drawn.
//
//   icon('lock')        an icon at 16, the size nearly everything uses
//   icon('close', 12)   inside a chip, a tag or a caption
//   icon('back', 20)    in the editor's and the reader's bars, and where DESIGN.md says so
//
// Every icon is drawn on a 16 by 16 grid for a 1.5 line with round ends and joins, and takes the colour
// of the words beside it. An icon is a list of parts joined by "|":
//   a plain part is the path of a line;
//   "b:" a closed outline, the body of a thing (it fills with a little light when its button is
//        pointed at or held on; one outline per part);
//   "d:" a solid dot;   "s:" a solid shape with a round edge;   "a:" the highlighter's stroke;
//   "<"  raw markup, for the two icons that hold letters.
// To add one: draw it here in the same manner, add it to the sheet at /parts (it lists this file by
// itself) and to the names in DESIGN.md, and show the user before using it.

const C = (x, y, r) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;
const R = (x, y, w, h, q) => `M${x + q} ${y}h${w - 2 * q}a${q} ${q} 0 0 1 ${q} ${q}v${h - 2 * q}a${q} ${q} 0 0 1 ${-q} ${q}`
  + `h${-(w - 2 * q)}a${q} ${q} 0 0 1 ${-q} ${-q}v${-(h - 2 * q)}a${q} ${q} 0 0 1 ${q} ${-q}z`;
const D = (x, y, r = 0.95) => `d:${C(x, y, r)}`;
const TRAY = 'M2.75 10.5v1.75a1 1 0 0 0 1 1h8.5a1 1 0 0 0 1-1V10.5';
const LINES = 'M6.5 4h6.75M6.5 8h6.75M6.5 12h6.75';
const LETTERS = (a, b, face) => `<g class="t" font-family="${face}" font-size="6.2" font-weight="600"><text x="1.6" y="6.1">${a}</text><text x="1.6" y="14">${b}</text></g>`;

const ICONS = {
  // ---- everyday
  plus: 'M8 3.25v9.5M3.25 8h9.5',
  minus: 'M3.25 8h9.5',
  close: 'M4 4l8 8M12 4l-8 8',
  check: 'M3 8.5l3.25 3.25L13 4.5',
  more: [D(3, 8, 1.15), D(8, 8, 1.15), D(13, 8, 1.15)].join('|'),
  grip: [D(6, 3.75), D(10, 3.75), D(6, 8), D(10, 8), D(6, 12.25), D(10, 12.25)].join('|'),
  caret: 'M4.5 6.5 8 10l3.5-3.5',
  'chevron-left': 'M9.75 3.5 5.25 8l4.5 4.5',
  'chevron-right': 'M6.25 3.5 10.75 8l-4.5 4.5',
  'chevron-up': 'M3.5 9.75 8 5.25l4.5 4.5',
  'chevron-down': 'M3.5 6.25 8 10.75l4.5-4.5',
  back: 'M13.25 8H2.75M6.75 4l-4 4 4 4',
  forward: 'M2.75 8h10.5M9.25 4l4 4-4 4',
  up: 'M8 13.25V2.75M4 6.75l4-4 4 4',
  down: 'M8 2.75v10.5M4 9.25l4 4 4-4',
  out: 'M4.5 11.5l7-7M5.75 4.5h5.75v5.75',
  search: 'b:' + C(7, 7, 4.25) + '|M10.25 10.25l3.25 3.25',
  zoom: 'b:' + C(7, 7, 4.25) + '|M10.25 10.25l3.25 3.25M7 5.25v3.5M5.25 7h3.5',
  undo: 'M6 3.5l-3 3 3 3M3 6.5h6.5a3.5 3.5 0 0 1 0 7H7',
  redo: 'M10 3.5l3 3-3 3M13 6.5H6.5a3.5 3.5 0 0 0 0 7H9',
  upload: 'M8 10.25v-7.5M4.75 6 8 2.75 11.25 6|' + TRAY,
  download: 'M8 2.75v7.5M4.75 7 8 10.25 11.25 7|' + TRAY,
  sort: 'M2.75 4.5h10.5M2.75 8h7M2.75 11.5h3.5',
  link: 'M6.75 9.25a2.7 2.7 0 0 0 3.8 0l2-2a2.7 2.7 0 0 0-3.8-3.8l-.7.7|M9.25 6.75a2.7 2.7 0 0 0-3.8 0l-2 2a2.7 2.7 0 0 0 3.8 3.8l.7-.7',
  copy: 'b:' + R(5.75, 5.75, 7.5, 7.5, 1.75) + '|M10.25 5.75V4.5A1.75 1.75 0 0 0 8.5 2.75h-4A1.75 1.75 0 0 0 2.75 4.5v4A1.75 1.75 0 0 0 4.5 10.25h1.25',
  trash: 'b:M4.25 4.5h7.5l-.6 7.85a1 1 0 0 1-1 .9h-4.3a1 1 0 0 1-1-.9z|M2.75 4.5h10.5M6 4.5V3.25a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5V4.5',
  edit: 'b:M3 13l.75-3.25 7-7 2.5 2.5-7 7z|M9 4.5 11.5 7',
  open: 'M9.5 2.75h3.75V6.5M13.25 2.75 9 7M6.5 13.25H2.75V9.5M2.75 13.25 7 9',
  play: 's:M5.75 4.25v7.5L12 8z',
  // ---- Mutt's own things
  planet: 'b:' + C(8, 8, 4.25) + '|M3.9 9.4c-1.6.9-2.5 1.8-2.2 2.5.5 1.1 4-.1 7.3-1.6s5.9-3.6 5.4-4.7c-.3-.7-1.5-.7-3.2-.2',
  moon: 'b:M13 9.6A5.5 5.5 0 1 1 6.4 3 5.2 5.2 0 0 0 13 9.6z',
  star: `d:${C(8, 8, 1.6)}|M8 1.75v2.5M8 11.75v2.5M1.75 8h2.5M11.75 8h2.5`,
  lock: 'b:' + R(3.25, 7, 9.5, 6.75, 1.75) + '|M5.25 7V5.25a2.75 2.75 0 0 1 5.5 0V7',
  key: 'b:' + C(10.75, 5.25, 2.75) + '|M8.75 7.25l-6 6M4.5 11.5l1.75 1.75M6.75 9.25l1.5 1.5',
  people: 'b:' + C(6, 5.5, 2.25) + '|M1.75 13c.3-2.4 2-3.75 4.25-3.75s3.95 1.35 4.25 3.75M10.5 3.4a2.25 2.25 0 0 1 0 4.2M12 9.6c1.3.5 2.1 1.7 2.3 3.4',
  globe: 'b:' + C(8, 8, 5.75) + '|M2.25 8h11.5M8 2.25c-1.7 1.7-2.5 3.6-2.5 5.75s.8 4.05 2.5 5.75c1.7-1.7 2.5-3.6 2.5-5.75S9.7 3.95 8 2.25',
  comment: 'b:M3.75 3h8.5A1.75 1.75 0 0 1 14 4.75v5a1.75 1.75 0 0 1-1.75 1.75H8L5 14v-2.5H3.75A1.75 1.75 0 0 1 2 9.75v-5A1.75 1.75 0 0 1 3.75 3z',
  move: 'b:' + C(11.5, 8, 2.75) + '|M1.75 8h4.5M4 5.75 6.25 8 4 10.25',
  onto: 'b:' + C(8, 8, 5.75) + '|M8 5.5v5M5.5 8h5',
  takeoff: 'b:' + C(8, 8, 5.75) + '|M5.5 8h5',
  files: ['b:' + R(2.5, 2.5, 4.5, 4.5, 1.25), 'b:' + R(9, 2.5, 4.5, 4.5, 1.25), 'b:' + R(2.5, 9, 4.5, 4.5, 1.25), 'b:' + R(9, 9, 4.5, 4.5, 1.25)].join('|'),
  page: 'b:M4.75 2.25h4.5l3 3v7.5a1 1 0 0 1-1 1h-6.5a1 1 0 0 1-1-1v-9.5a1 1 0 0 1 1-1z|M9.25 2.25v3h3',
  book: 'b:M8 4.25C6.6 3.35 4.9 3 2.75 3v9c2.15 0 3.85.35 5.25 1.25 1.4-.9 3.1-1.25 5.25-1.25V3C11.1 3 9.4 3.35 8 4.25z|M8 4.25v9',
  bookmark: 'b:M4.5 2.5h7v11L8 11l-3.5 2.5z',
  note: 'b:M3 3h10v7.25L10.25 13H3z|M10.25 13v-2.75H13',
  pot: 'b:M3 7.5h10v3.25a2.75 2.75 0 0 1-2.75 2.75h-4.5A2.75 2.75 0 0 1 3 10.75z|M1.5 7.5h13M6.5 5c0-.9.75-1.1.75-2M9.5 5c0-.9.75-1.1.75-2',
  chapter: 'b:M2.25 12v-7.5a1 1 0 0 1 1-1h3.1l1.25 1.75h5.15a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1h-9.5a1 1 0 0 1-1-1z',
  camera: 'b:M2.25 5.75a1 1 0 0 1 1-1h1.9l1.1-1.75h3.5l1.1 1.75h1.9a1 1 0 0 1 1 1v5.75a1 1 0 0 1-1 1h-9.5a1 1 0 0 1-1-1z|' + C(8, 8.4, 2.25),
  picture: 'b:' + R(2.25, 3.25, 11.5, 9.5, 1.75) + '|' + D(5.75, 6.5, 1) + '|M2.75 11.75l3.25-3 2.5 2.25 2-1.75 2.75 2.5',
  colour: 'b:M8 2.25c2.4 2.7 4 4.7 4 6.75a4 4 0 0 1-8 0c0-2.05 1.6-4.05 4-6.75z',
  tick: 'b:' + R(2.75, 2.75, 10.5, 10.5, 2.5) + '|M5.25 8.25 7 10l3.75-4.25',
  untick: 'b:' + R(2.75, 2.75, 10.5, 10.5, 2.5),
  history: 'M2.75 8a5.25 5.25 0 1 0 1.6-3.75L2.75 5.75M2.75 3v2.75H5.5M8 5.25V8l2 1.25',
  print: 'M4.75 5.5V2.75h6.5V5.5|b:M4.75 11.25H3.5a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v3.75a1 1 0 0 1-1 1h-1.25V9.25h-6.5z|M4.75 11.25v2h6.5v-2',
  setup: 'M2.75 5h3.5M9.75 5h3.5M2.75 11h1.5M7.75 11h5.5|b:' + C(8, 5, 1.75) + '|b:' + C(6, 11, 1.75),
  replace: 'M2.75 5.25h10M10.25 2.75l2.5 2.5-2.5 2.5M13.25 10.75h-10M5.75 8.25l-2.5 2.5 2.5 2.5',
  count: 'M6.5 2.75 5.25 13.25M10.75 2.75 9.5 13.25M3.25 6h10M2.75 10h10',
  spell: 'M4.5 9.5 8 2.5l3.5 7M5.75 7h4.5M2.75 12.75c.85-1 1.65-1 2.5 0s1.65 1 2.5 0 1.65-1 2.5 0 1.65 1 2.5 0',
  // ---- writing
  side: 'b:' + R(2.25, 3, 11.5, 10, 2) + '|M6.25 3v10',
  bold: 'M4.75 3h4a2.5 2.5 0 0 1 0 5h-4zM4.75 8H9.5a2.5 2.5 0 0 1 0 5H4.75z',
  italic: 'M10.25 3.25h-3.5M9.25 12.75h-3.5M9.25 3.25l-2.5 9.5',
  underline: 'M4.75 2.75v4.5a3.25 3.25 0 0 0 6.5 0v-4.5M3.75 13.25h8.5',
  strike: 'M2.75 8h10.5M11 5.25C10.6 3.85 9.5 3 8 3 6.3 3 5.1 3.9 5.1 5.2c0 .5.15.9.45 1.25M5 10.6c.3 1.5 1.5 2.4 3.1 2.4 1.7 0 2.9-.9 2.9-2.3 0-.25-.05-.5-.1-.7',
  'align-left': 'M2.75 3.75h10.5M2.75 6.6h6.5M2.75 9.4h10.5M2.75 12.25h6.5',
  'align-center': 'M2.75 3.75h10.5M4.75 6.6h6.5M2.75 9.4h10.5M4.75 12.25h6.5',
  'align-right': 'M2.75 3.75h10.5M6.75 6.6h6.5M2.75 9.4h10.5M6.75 12.25h6.5',
  justify: 'M2.75 3.75h10.5M2.75 6.6h10.5M2.75 9.4h10.5M2.75 12.25h10.5',
  bullets: [D(3, 4), D(3, 8), D(3, 12), LINES].join('|'),
  dashes: 'M2.25 4h2M2.25 8h2M2.25 12h2|' + LINES,
  numbers: 'M2.5 3.6 3.75 2.75v3.5M2.4 10.4a1.2 1.2 0 0 1 2.2-.6c.5.9-.5 1.7-2.2 3.45h2.6|M7 4h6.25M7 8h6.25M7 12h6.25',
  letters: LETTERS('a', 'b', 'Red Hat Text, sans-serif') + '|M7 4h6.25M7 8h6.25M7 12h6.25',
  roman: LETTERS('i', 'ii', 'Georgia, serif') + '|M7 4h6.25M7 8h6.25M7 12h6.25',
  checklist: 'b:' + R(2.25, 2.25, 4, 4, 1) + '|M2.4 11.5l1.3 1.3 2.3-2.8M8.75 4.25h4.5M8.75 11.5h4.5',
  outdent: 'M2.75 3.5h10.5M7.5 6.5h5.75M7.5 9.5h5.75M2.75 12.5h10.5M5 6.25 2.75 8 5 9.75',
  indent: 'M2.75 3.5h10.5M7.5 6.5h5.75M7.5 9.5h5.75M2.75 12.5h10.5M2.75 6.25 5 8 2.75 9.75',
  spacing: 'M7.5 4h5.75M7.5 8h5.75M7.5 12h5.75M3.75 3v10M2 4.75 3.75 3 5.5 4.75M2 11.25 3.75 13l1.75-1.75',
  clear: 'M3.75 3.25h7.5M7.5 3.25l-2 9.5M9.75 9.75l3.5 3.5M13.25 9.75l-3.5 3.5',
  type: 'M1.75 12.25 5 4l3.25 8.25M2.9 9.5h4.2M13.75 12.25V8.1a1.75 1.75 0 0 0-3.5 0M13.75 10.4a1.75 1.85 0 1 1-3.5 0 1.75 1.85 0 0 1 3.5 0z',
  highlight: 'b:M9.5 2.5l3.5 3.5-5.75 5.75h-3.5v-3.5z|M7.5 4.5 11 8|a:M2.5 14h11',
  heading: 'M2.75 3.25v9.5M8.5 3.25v9.5M2.75 8H8.5M11.5 7l1.75-1.25v7',
  quote: 'M3.25 3.75v8.5M6.5 5h6.75M6.5 8h6.75M6.5 11h4',
  table: 'b:' + R(2.25, 3, 11.5, 10, 1.75) + '|M2.25 6.5h11.5M2.25 9.75h11.5M8 6.5V13',
  rule: 'M2.75 8h10.5M5 4.25h6M5 11.75h6',
  pagebreak: 'M3.75 2.5v2.75h8.5V2.5M3.75 13.5v-2.75h8.5v2.75M2.25 8h1.5M5.5 8H7M9 8h1.5M12.25 8h1.5',
  code: 'M5.75 4.75 2.5 8l3.25 3.25M10.25 4.75 13.5 8l-3.25 3.25',
  auto: 'b:' + C(8, 8, 5.75) + '|M5.9 10.5 8 5.5l2.1 5M6.7 9h2.6',
  prose: 'M3 4h10M3 6.75h10M3 9.5h10M3 12.25h6',
  poem: 'M13 2.75C8 3.4 5.3 6.7 4.7 11.7l-1 1.6M5.7 9c2.9.15 5.1-1.7 6.1-4.9M7.3 7c1.5-.05 2.6-.65 3.5-1.7',
  script: 'b:' + R(2.25, 6.5, 11.5, 6.75, 1.25) + '|M2.5 6.4l.9-3.1 9.8 2.4M5.9 3.9l1 2.4M9.3 4.7l1 1.7',
  journal: 'b:M4.25 2.25h7.5a.75.75 0 0 1 .75.75v10.75H5a1.5 1.5 0 0 1-1.5-1.5V3a.75.75 0 0 1 .75-.75z|M3.5 12.25A1.5 1.5 0 0 1 5 10.75h7.5M9.25 2.25v4l-1.1-.8-1.1.8v-4',
  letter: 'b:' + R(2.25, 3.75, 11.5, 8.5, 1.5) + '|M2.75 4.75 8 9l5.25-4.25',
  scene: 'M2.75 4.5h10.5M2.75 8h7.25M2.75 11.5h8.5',
  sign: 'M2.5 11c1.7-4 3-6 4-6 1.5 0-1.2 5.7.4 5.7 1.1 0 1.7-2.7 2.7-2.7.7 0 .5 1.7 1.3 1.7.7 0 1.1-.7 1.6-1.3M2.5 13.5h11',
  date: 'b:' + R(2.5, 3.5, 11, 9.75, 1.75) + '|M2.5 6.75h11M5.5 2.25V4.5M10.5 2.25V4.5'
};

const KIND = { 'b:': 'b', 'd:': 'd', 's:': 's', 'a:': 'a' };
const SIZE = { 12: ' ic-small', 16: '', 20: ' ic-large' };
const made = new Map();

function markup(name) {
  if (!ICONS[name]) console.error(`icons.js has no icon called "${name}"`);
  if (!made.has(name)) {
    made.set(name, (ICONS[name] || ICONS.more).split('|').map((p) => {
      if (p[0] === '<') return p;
      const kind = KIND[p.slice(0, 2)];
      return kind ? `<path class="${kind}" d="${p.slice(2)}"/>` : `<path d="${p}"/>`;
    }).join(''));
  }
  return made.get(name);
}

// One icon, as an element. `size` is 16, 12 or 20; any other number is for a mark that grows with
// the thing it sits on (the lock on a world), and scales the line with it.
export function icon(name, size = 16) {
  const t = document.createElement('template');
  const own = size in SIZE ? '' : ` style="width:${size}px;height:${size}px"`;
  t.innerHTML = `<svg class="ic ic-${name}${SIZE[size] || ''}" viewBox="0 0 16 16" aria-hidden="true"${own}>${markup(name)}</svg>`;
  return t.content.firstChild;
}

// Every name, in the order of the sheet at /parts.
export const ICON_NAMES = Object.keys(ICONS);

// The small drawings that lead a mode's offer (DESIGN.md "Offer"). All four are made the same way:
// a pane in front with the planet's colour along its top edge, another pane behind it, and a few marks
// that say which mode it is. A 24 grid, shown at 28 in a 40 well, in the icons' line.
//   "g:" a pane of glass (an outline, faintly filled);  "p:" the stroke in the planet's colour.
// A new mode's drawing is made this way and no other; show the user first.
const DRAWINGS = {
  list: `g:${R(3, 3.75, 18, 7.5, 1.5)}|g:${R(3, 12.75, 18, 7.5, 1.5)}|p:M4.75 3.75h14.5|M6 7.75 7.25 9l2.25-2.75M12 7.5h5.5M6 16.75 7.25 18l2.25-2.75M12 16.5h3.5`,
  shelf: `M9 8H6a1 1 0 0 0-1 1v10.5a1 1 0 0 0 1 1h3|g:${R(9, 5.5, 10, 15, 1.5)}|p:M10.5 5.5h7|M12 5.5v15M14.5 10h2.5`,
  cards: `M5 8.5V6.25a1 1 0 0 1 1-1h4.25l1.25 1.5H18a1 1 0 0 1 1 1V8.5|g:${R(3, 8.5, 18, 11, 1.5)}|p:M4.75 8.5h14.5|M6.75 12.75h7.5M6.75 15.75h4.5`,
  desk: `M8 6V4.5a1 1 0 0 1 1-1h9.5a1 1 0 0 1 1 1V17a1 1 0 0 1-1 1h-2|g:${R(4.5, 6, 12, 15, 1.5)}|p:M6 6h9|M7.5 10.5h6M7.5 13.5h6M7.5 16.5h3.5`,
};
export const DRAWING_NAMES = Object.keys(DRAWINGS);

export function drawing(name) {
  const t = document.createElement('template');
  const parts = (DRAWINGS[name] || DRAWINGS.list).split('|').map((p) => {
    const kind = { 'g:': 'g', 'p:': 'p' }[p.slice(0, 2)];
    return kind ? `<path class="${kind}" d="${p.slice(2)}"/>` : `<path d="${p}"/>`;
  }).join('');
  t.innerHTML = `<span class="offer-drawing" aria-hidden="true"><svg viewBox="0 0 24 24">${parts}</svg></span>`;
  return t.content.firstChild;
}
