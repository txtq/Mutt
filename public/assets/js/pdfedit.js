// Marking up a PDF, in the file view (viewer.js), on your own PDFs only.
//
// Fetched (with pdfedit.css) the first time you pick words on one of your
// PDFs or press "Mark up". Picking words brings a bubble: the five
// highlighters, underline, strike, a note, and "Change words"; "Mark up"
// brings the bar: a pen, a text box, a note, your signature and changing the
// words of a line, the colour, undo and redo.
//
// The owner chose that changes go into the file itself, so a moment after
// each change the whole PDF is written again (pdf-lib) and sent back
// (PUT /api/blocks/<id>/file). Marks are written as real PDF annotations
// (Highlight, Underline, StrikeOut, Ink, FreeText, Text), with their own
// pictures, so Preview and Acrobat show them, list them and can remove them.
// Each also carries `/MuttData`, so Mutt reads its own back exactly.
//
// Changing words is cover and retype: the old words stay in the file under a
// patch of the page's own colour, and the new ones are written over it in the
// closest of the standard PDF faces (Helvetica, Times, Courier), at the same
// size, in the same ink. Those drawings are kept in a content stream of their
// own, listed on the page (`/MuttEdits`, `/MuttEditStreams`), so the next time
// the file is marked up they are taken back out and can be changed again.
//
// While marking up, the file view draws from a copy of the PDF with Mutt's
// marks taken out (`base`), and draws the marks itself, over the page:
// .pm-flat (ink, text boxes, changed words), .pm-multiply (highlighters),
// pdf.js's words, then .pm-top (notes, the chosen mark, editors).
//
// Every place on a page is kept in the PDF's own units ("points", y up).
// `vp` (pdf.js's viewport at scale 1) turns them into the page as seen.

import { sendFile, session } from './api.js';
import { icon } from './icons.js';
import { loadPdfLib } from './pdfjs.js';
import { makeThumb } from './thumbs.js';
import { exit, openDialog, openMenu, openPopover, segmented, toast } from './ui.js';
import { h, isEditable, named, uid } from './util.js';

const MAX_BYTES = 60 * 1024 * 1024;
const SAVE_AFTER = 1200;             // a moment after the last change, the file is written
const MARKER_ALPHA = 0.4;            // a highlighter over the page (DESIGN.md: the marker at 36 to 40%)
const NOTE = 18;                     // a note's square, in points
const LEAD = 1.2;                    // a text box's lines, apart
const FIRST = 0.95;                  // a text box's first baseline below its top, in sizes

const MARKERS = ['yellow', 'green', 'blue', 'pink', 'purple'].map((key) => ({ key, label: key[0].toUpperCase() + key.slice(1), hex: named(`--mark-${key}`), marker: true }));
const INKS = [['black', 'Black', '--paper-ink'], ['blue', 'Blue', '--paper-blue'], ['red', 'Red', '--paper-caret']]
  .map(([key, label, name]) => ({ key, label, hex: named(name) }));
const COLOURS = [...INKS, ...MARKERS];
const colourOf = (key) => COLOURS.find((c) => c.key === key) || INKS[0];
const PEN_WIDTHS = { fine: 1, medium: 2, bold: 4 };
const TEXT_SIZES = { small: 9, regular: 12, large: 18 };

const hexRgb = (hex) => {
  let v = (hex || '').trim().replace(/^#/, '');
  if (v.length === 3) v = v.split('').map((c) => c + c).join('');
  return [0, 2, 4].map((i) => (parseInt(v.slice(i, i + 2), 16) || 0) / 255);
};
const rgbHex = (rgb) => `#${rgb.map((c) => Math.round(Math.max(0, Math.min(1, c)) * 255).toString(16).padStart(2, '0')).join('')}`;
const nearest = (rgb) => {
  let best = COLOURS[0];
  let d = Infinity;
  for (const c of COLOURS) {
    const [r, g, b] = hexRgb(c.hex);
    const e = (r - rgb[0]) ** 2 + (g - rgb[1]) ** 2 + (b - rgb[2]) ** 2;
    if (e < d) { d = e; best = c; }
  }
  return best;
};
const f = (n) => (Math.round(n * 100) / 100).toString();
const clone = (x) => JSON.parse(JSON.stringify(x));

const SVG = 'http://www.w3.org/2000/svg';
function svg(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  el.append(...kids);
  return el;
}

// The letters the standard PDF faces can write (Windows-1252).
const WIN_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
const writable = (text) => [...text].every((ch) => {
  const c = ch.codePointAt(0);
  return (c >= 32 && c < 127) || (c >= 160 && c <= 255) || WIN_EXTRA.includes(ch) || ch === '\n';
});

// The standard faces: which one a line of the page is closest to.
const FACES = {
  sans: ['Helvetica', 'HelveticaBold', 'HelveticaOblique', 'HelveticaBoldOblique'],
  serif: ['TimesRoman', 'TimesRomanBold', 'TimesRomanItalic', 'TimesRomanBoldItalic'],
  mono: ['Courier', 'CourierBold', 'CourierOblique', 'CourierBoldOblique'],
};
const faceName = (face, bold, italic) => FACES[face || 'sans'][(bold ? 1 : 0) + (italic ? 2 : 0)];

// ---------------------------------------------------------------- geometry

// The page as seen: which way is right and which way is up, in the PDF's units.
function frameOf(vp) {
  const [ox, oy] = vp.convertToPdfPoint(0, 0);
  const [rx, ry] = vp.convertToPdfPoint(1, 0);
  const [ux, uy] = vp.convertToPdfPoint(0, -1);
  return { right: [rx - ox, ry - oy], up: [ux - ox, uy - oy] };
}
const toView = (vp, x, y) => vp.convertToViewportPoint(x, y);
const toPdf = (vp, x, y) => vp.convertToPdfPoint(x, y);
const bboxOf = (pts) => {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};

// A quad's four corners as seen: top left, top right, bottom left, bottom right.
function sides(q, frame) {
  const pts = [[q[0], q[1]], [q[2], q[3]], [q[4], q[5]], [q[6], q[7]]];
  const up = (p) => p[0] * frame.up[0] + p[1] * frame.up[1];
  const right = (p) => p[0] * frame.right[0] + p[1] * frame.right[1];
  const byUp = [...pts].sort((a, b) => up(b) - up(a));
  const [tl, tr] = byUp.slice(0, 2).sort((a, b) => right(a) - right(b));
  const [bl, br] = byUp.slice(2).sort((a, b) => right(a) - right(b));
  return { tl, tr, bl, br };
}
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

// Where a mark sits, as seen on the page: [left, top, right, bottom] in the viewport's units.
function seenBox(mark, vp) {
  return bboxOf(pointsOf(mark).map(([x, y]) => toView(vp, x, y)));
}
function pointsOf(m) {
  if (m.quads) return m.quads.flatMap((q) => [[q[0], q[1]], [q[2], q[3]], [q[4], q[5]], [q[6], q[7]]]);
  if (m.strokes) return m.strokes.flatMap((s) => { const out = []; for (let i = 0; i < s.length; i += 2) out.push([s[i], s[i + 1]]); return out; });
  if (m.kind === 'text') return boxCorners(m);
  if (m.kind === 'note') return [[m.at[0] - NOTE / 2, m.at[1] - NOTE / 2], [m.at[0] + NOTE / 2, m.at[1] + NOTE / 2]];
  if (m.kind === 'edit') return editCorners(m.edit || m);
  return [];
}
// A text box: its top left as seen (`at`), how wide and tall as seen, in the page's frame.
function boxCorners(m) {
  const { right, up } = m.frame;
  const p = (dx, dy) => [m.at[0] + right[0] * dx - up[0] * dy, m.at[1] + right[1] * dx - up[1] * dy];
  return [p(0, 0), p(m.w, 0), p(0, m.h), p(m.w, m.h)];
}
// Changed words: the patch over the old ones, along their own line.
function editCorners(e) {
  const [ux, uy] = e.u;
  const [nx, ny] = e.n;
  const len = Math.max(e.len, e.newLen || 0) + e.size * 0.12;
  const lo = -e.size * (e.desc + 0.06);
  const hi = e.size * (e.asc + 0.04);
  const pad = e.size * 0.06;
  const p = (s, t) => [e.at[0] + ux * s + nx * t, e.at[1] + uy * s + ny * t];
  return [p(-pad, lo), p(len, lo), p(len, hi), p(-pad, hi)];
}

// Moving a mark by (dx, dy) in the PDF's units.
function moveMark(m, dx, dy) {
  if (m.quads) m.quads = m.quads.map((q) => q.map((v, i) => v + (i % 2 ? dy : dx)));
  if (m.strokes) m.strokes = m.strokes.map((s) => s.map((v, i) => v + (i % 2 ? dy : dx)));
  if (m.at) m.at = [m.at[0] + dx, m.at[1] + dy];
}
// Growing a signature or a drawing from its top left as seen.
function scaleMark(m, k, origin) {
  m.strokes = m.strokes.map((s) => s.map((v, i) => origin[i % 2] + (v - origin[i % 2]) * k));
  m.width *= k;
}

// ---------------------------------------------------------------- reading a PDF's marks

const MANAGED = { Highlight: 'highlight', Underline: 'underline', Squiggly: 'underline', StrikeOut: 'strike', Ink: 'ink', FreeText: 'text', Text: 'note' };

function reader(lib, ctx) {
  const { PDFArray, PDFDict, PDFName, PDFNumber, PDFString, PDFHexString } = lib;
  const look = (o) => (o === undefined ? undefined : ctx.lookup(o));
  const nums = (o) => { const a = look(o); return a instanceof PDFArray ? a.asArray().map((x) => { const v = look(x); return v instanceof PDFNumber ? v.asNumber() : 0; }) : null; };
  const num = (o) => { const v = look(o); return v instanceof PDFNumber ? v.asNumber() : null; };
  const text = (o) => { const v = look(o); return v instanceof PDFString || v instanceof PDFHexString ? v.decodeText() : ''; };
  const name = (o) => { const v = look(o); return v instanceof PDFName ? v.decodeText().replace(/^\//, '') : ''; };
  const get = (dict, key) => dict.get(PDFName.of(key));
  return { look, nums, num, text, name, get, PDFArray, PDFDict };
}

// Takes Mutt's marks (and any highlights, underlines, strikes, drawings and
// notes from other apps) out of the PDF, and Mutt's changed words out of its
// pages, returning them. `doc` is changed in place.
async function takeApart(lib, doc, vpOf) {
  const ctx = doc.context;
  const r = reader(lib, ctx);
  const { PDFName, PDFArray, PDFDict, PDFRef } = lib;
  const marks = [];
  const edits = [];
  let changed = false;
  const pages = doc.getPages();
  for (let i = 0; i < pages.length; i++) {
    const node = pages[i].node;
    // Words Mutt changed before: take its drawing back out, keep the change.
    const kept = r.get(node, 'MuttEdits');
    if (kept) {
      try {
        for (const e of JSON.parse(r.text(kept))) edits.push({ ...e, page: i, id: uid() });
      } catch { /* a damaged list: the drawing comes out all the same */ }
      const streams = r.look(r.get(node, 'MuttEditStreams'));
      const contents = r.look(r.get(node, 'Contents'));
      if (streams instanceof PDFArray && contents instanceof PDFArray) {
        for (const ref of streams.asArray()) {
          const at = contents.indexOf(ref);
          if (at !== undefined) contents.remove(at);
          if (ref instanceof PDFRef) ctx.delete(ref);
        }
      }
      const fonts = node.Resources()?.lookupMaybe(PDFName.of('Font'), PDFDict);
      if (fonts) for (const key of fonts.keys()) if (/^\/?Mutt/.test(key.decodeText())) fonts.delete(key);
      node.delete(PDFName.of('MuttEdits'));
      node.delete(PDFName.of('MuttEditStreams'));
      changed = true;
    }
    const annots = node.Annots();
    if (!annots) continue;
    const taken = [];
    let vp = null;
    for (let k = 0; k < annots.size(); k++) {
      const raw = annots.get(k);
      const dict = r.look(raw);
      if (!(dict instanceof PDFDict)) continue;
      const kind = MANAGED[r.name(r.get(dict, 'Subtype'))];
      if (!kind || (r.num(r.get(dict, 'F')) & 2)) continue;   // not ours to draw, or hidden
      const ours = r.text(r.get(dict, 'MuttData'));
      let mark = null;
      if (ours) {
        try { mark = { ...JSON.parse(ours), page: i, id: uid() }; } catch { mark = null; }
      }
      if (!mark && kind !== 'text') {
        vp ||= await vpOf(i);
        mark = foreign(r, dict, kind, i, vp);
      }
      if (!mark) continue;
      marks.push(mark);
      taken.push(raw);
    }
    if (!taken.length) continue;
    // Their pop-up notes go with them.
    for (let k = 0; k < annots.size(); k++) {
      const dict = r.look(annots.get(k));
      if (dict instanceof PDFDict && taken.includes(r.get(dict, 'Parent'))) taken.push(annots.get(k));
    }
    for (const raw of taken) {
      const at = annots.indexOf(raw);
      if (at !== undefined) annots.remove(at);
      forget(lib, ctx, raw);
    }
    changed = true;
  }
  return { marks, edits, changed };
}

// A mark another app made, read from the PDF's standard fields.
function foreign(r, dict, kind, page, vp) {
  const c = r.nums(r.get(dict, 'C')) || [];
  const rgb = c.length === 3 ? c : c.length === 1 ? [c[0], c[0], c[0]] : c.length === 4 ? c.slice(0, 3).map((v) => (1 - v) * (1 - c[3])) : [1, 0.85, 0.2];
  const colour = nearest(rgb).key;
  const note = r.text(r.get(dict, 'Contents')).trim();
  const rect = r.nums(r.get(dict, 'Rect')) || [0, 0, 0, 0];
  const base = { id: uid(), page, kind, colour, nm: r.text(r.get(dict, 'NM')) || null };
  if (kind === 'highlight' || kind === 'underline' || kind === 'strike') {
    const qp = r.nums(r.get(dict, 'QuadPoints'));
    const quads = [];
    if (qp && qp.length >= 8) for (let i = 0; i + 7 < qp.length; i += 8) quads.push(qp.slice(i, i + 8));
    else quads.push([rect[0], rect[3], rect[2], rect[3], rect[0], rect[1], rect[2], rect[1]]);
    return { ...base, quads, note };
  }
  if (kind === 'ink') {
    const list = r.look(r.get(dict, 'InkList'));
    const strokes = list instanceof r.PDFArray ? list.asArray().map((s) => r.nums(s) || []).filter((s) => s.length >= 4) : [];
    if (!strokes.length) return null;
    const bs = r.look(r.get(dict, 'BS'));
    const width = (bs instanceof r.PDFDict && r.num(r.get(bs, 'W'))) || 1;
    const alpha = r.num(r.get(dict, 'CA'));
    return { ...base, colour: alpha != null && alpha < 0.8 ? nearest(rgb).key : colour, strokes, width, marker: alpha != null && alpha < 0.8, note };
  }
  if (kind === 'note') {
    return { ...base, at: [(rect[0] + rect[2]) / 2, (rect[1] + rect[3]) / 2], note, colour: colour === 'black' ? 'yellow' : colour };
  }
  return null;
}

// Removes an annotation and what only it used (its pictures) from the file.
function forget(lib, ctx, raw) {
  const { PDFRef, PDFDict, PDFName } = lib;
  if (!(raw instanceof PDFRef)) return;
  const dict = ctx.lookup(raw);
  if (dict instanceof PDFDict) {
    const ap = ctx.lookup(dict.get(PDFName.of('AP')));
    if (ap instanceof PDFDict) {
      for (const key of ['N', 'R', 'D']) {
        const v = ap.get(PDFName.of(key));
        const states = v === undefined ? null : ctx.lookup(v);
        if (states instanceof PDFDict) for (const [, s] of states.entries()) if (s instanceof PDFRef) ctx.delete(s);
        if (v instanceof PDFRef) ctx.delete(v);
      }
    }
  }
  ctx.delete(raw);
}

// ---------------------------------------------------------------- writing a PDF's marks

// pdf-lib's own page helpers wrap the page's drawing in another q/Q each time
// they're used; these two touch only what they say.
function addAnnot(lib, ctx, node, ref) {
  let annots = node.Annots();
  if (!annots) { annots = ctx.obj([]); node.set(lib.PDFName.of('Annots'), annots); }
  annots.push(ref);
}
function addFont(lib, ctx, node, key, ref) {
  const { PDFName, PDFDict } = lib;
  let res = ctx.lookup(node.get(PDFName.of('Resources')));
  if (!(res instanceof PDFDict)) {
    const inherited = ctx.lookupMaybe(node.getInheritableAttribute(PDFName.of('Resources')), PDFDict);
    res = inherited ? inherited.clone(ctx) : ctx.obj({});
    node.set(PDFName.of('Resources'), res);
  }
  let fonts = ctx.lookup(res.get(PDFName.of('Font')));
  if (!(fonts instanceof PDFDict)) { fonts = ctx.obj({}); res.set(PDFName.of('Font'), fonts); }
  fonts.set(PDFName.of(key), ref);
}

const pdfDate = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `D:${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
};
const rgbOps = (rgb, stroke = false) => `${rgb.map(f).join(' ')} ${stroke ? 'RG' : 'rg'}`;

async function writeAll(lib, base, marks, edits, author) {
  const { PDFDocument, PDFName, PDFString, PDFHexString, StandardFonts } = lib;
  const doc = await PDFDocument.load(base, { updateMetadata: false });
  const ctx = doc.context;
  const pages = doc.getPages();
  const fonts = new Map();
  const font = async (key) => {
    if (!fonts.has(key)) fonts.set(key, await doc.embedFont(StandardFonts[key]));
    return fonts.get(key);
  };
  const form = (ops, bbox, resources = {}) => ctx.register(ctx.flateStream(ops, {
    Type: 'XObject', Subtype: 'Form', FormType: 1, BBox: bbox, Resources: resources,
  }));
  const multiply = (alpha) => ({ ExtGState: { GS: { Type: 'ExtGState', BM: 'Multiply', ca: alpha, CA: alpha } } });

  for (const m of marks) {
    const page = pages[m.page];
    if (!page) continue;
    const rgb = hexRgb(colourOf(m.colour).hex);
    const pts = pointsOf(m);
    if (!pts.length) continue;
    const pad = m.kind === 'ink' ? m.width : 1;
    const box = bboxOf(pts);
    const rect = [box[0] - pad, box[1] - pad, box[2] + pad, box[3] + pad];
    const own = { ...m };
    delete own.page;
    delete own.id;
    const dict = {
      Type: 'Annot', F: 4, P: page.ref, Rect: rect, C: rgb,
      NM: PDFString.of(m.nm || `mutt-${m.id}`), M: PDFString.of(pdfDate()),
      MuttData: PDFHexString.fromText(JSON.stringify(own)),
    };
    if (author) dict.T = PDFHexString.fromText(author);
    if (m.note) dict.Contents = PDFHexString.fromText(m.note);
    let ops = '';
    let resources = {};
    if (m.quads) {
      const frame = m.frame || { right: [1, 0], up: [0, 1] };
      dict.Subtype = { highlight: 'Highlight', underline: 'Underline', strike: 'StrikeOut' }[m.kind];
      dict.QuadPoints = m.quads.flatMap((q) => { const s = sides(q, frame); return [...s.tl, ...s.tr, ...s.bl, ...s.br]; });
      if (m.kind === 'highlight') {
        dict.CA = MARKER_ALPHA;
        resources = multiply(MARKER_ALPHA);
        ops = `/GS gs ${rgbOps(rgb)}\n${m.quads.map((q) => { const s = sides(q, frame); return `${f(s.tl[0])} ${f(s.tl[1])} m ${f(s.tr[0])} ${f(s.tr[1])} l ${f(s.br[0])} ${f(s.br[1])} l ${f(s.bl[0])} ${f(s.bl[1])} l h f`; }).join('\n')}`;
      } else {
        const lines = m.quads.map((q) => {
          const s = sides(q, frame);
          const t = m.kind === 'strike' ? 0.42 : 0.1;
          const a = lerp(s.bl, s.tl, t);
          const b = lerp(s.br, s.tr, t);
          const w = Math.max(0.6, Math.hypot(s.tl[0] - s.bl[0], s.tl[1] - s.bl[1]) * 0.07);
          return `${f(w)} w ${f(a[0])} ${f(a[1])} m ${f(b[0])} ${f(b[1])} l S`;
        });
        ops = `${rgbOps(rgb, true)} 0 J\n${lines.join('\n')}`;
      }
    } else if (m.kind === 'ink') {
      dict.Subtype = 'Ink';
      dict.InkList = m.strokes;
      dict.BS = { Type: 'Border', W: m.width };
      const paths = m.strokes.map((s) => {
        let p = `${f(s[0])} ${f(s[1])} m`;
        for (let i = 2; i < s.length; i += 2) p += ` ${f(s[i])} ${f(s[i + 1])} l`;
        if (s.length === 2) p += ` ${f(s[0] + 0.01)} ${f(s[1])} l`;
        return `${p} S`;
      });
      if (m.marker) { dict.CA = MARKER_ALPHA; resources = multiply(MARKER_ALPHA); }
      ops = `${m.marker ? '/GS gs ' : ''}1 J 1 j ${f(m.width)} w ${rgbOps(rgb, true)}\n${paths.join('\n')}`;
    } else if (m.kind === 'text') {
      const face = await font('Helvetica');
      dict.Subtype = 'FreeText';
      dict.Contents = PDFHexString.fromText(m.text);
      dict.DA = PDFString.of(`/Helv ${f(m.size)} Tf ${rgbOps(rgb)}`);
      dict.BS = { W: 0 };
      // Drawn in the page as seen, so it reads upright on a turned page too.
      const { right, up } = m.frame;
      const bl = [m.at[0] - up[0] * m.h, m.at[1] - up[1] * m.h];
      const lines = m.text.split('\n');
      const body = lines.map((line, i) => (line ? `1 0 0 1 0 ${f(m.h - m.size * (FIRST + i * LEAD))} Tm ${face.encodeText(line).toString()} Tj` : '')).filter(Boolean).join('\n');
      ops = `q ${f(right[0])} ${f(right[1])} ${f(up[0])} ${f(up[1])} ${f(bl[0])} ${f(bl[1])} cm\nBT /F1 ${f(m.size)} Tf ${rgbOps(rgb)}\n${body}\nET Q`;
      resources = { Font: { F1: face.ref } };
    } else if (m.kind === 'note') {
      dict.Subtype = 'Text';
      dict.Name = 'Comment';
      dict.Open = false;
      const [x0, y0] = [m.at[0] - NOTE / 2, m.at[1] - NOTE / 2];
      const dark = rgb.map((v) => v * 0.45);
      ops = `${rgbOps(rgb)} ${f(x0 + 0.5)} ${f(y0 + 0.5)} ${NOTE - 1} ${NOTE - 1} re f\n${rgbOps(dark, true)} 0.75 w ${f(x0 + 0.5)} ${f(y0 + 0.5)} ${NOTE - 1} ${NOTE - 1} re S\n`
        + [12.5, 9, 5.5].map((dy) => `${f(x0 + 4)} ${f(y0 + dy)} m ${f(x0 + 14)} ${f(y0 + dy)} l S`).join('\n');
    }
    dict.AP = { N: form(ops, rect, resources) };
    addAnnot(lib, ctx, page.node, ctx.register(ctx.obj(dict)));
  }

  // Changed words: a patch of the page's own colour and the new words, in a drawing of their own.
  const byPage = new Map();
  for (const e of edits) {
    if (!pages[e.page]) continue;
    if (!byPage.has(e.page)) byPage.set(e.page, []);
    byPage.get(e.page).push(e);
  }
  for (const [i, list] of byPage) {
    const node = pages[i].node;
    let ops = 'q\n';
    let n = 0;
    const saved = [];
    for (const e of list) {
      const key = faceName(e.face, e.bold, e.italic);
      const face = await font(key);
      const fontKey = `MuttF${n++}`;
      addFont(lib, ctx, node, fontKey, face.ref);
      const newLen = e.text ? face.widthOfTextAtSize(e.text, e.size) : 0;
      const corners = editCorners({ ...e, newLen });
      ops += `${rgbOps(e.paper)} ${corners.map((p, k) => `${f(p[0])} ${f(p[1])} ${k ? 'l' : 'm'}`).join(' ')} h f\n`;
      if (e.text) {
        ops += `BT /${fontKey} ${f(e.size)} Tf ${rgbOps(e.ink)} ${f(e.u[0])} ${f(e.u[1])} ${f(e.n[0])} ${f(e.n[1])} ${f(e.at[0])} ${f(e.at[1])} Tm ${face.encodeText(e.text).toString()} Tj ET\n`;
      }
      const keep = { ...e, newLen };
      delete keep.page;
      delete keep.id;
      saved.push(keep);
    }
    ops += 'Q\n';
    const before = ctx.register(ctx.stream('q\n'));
    const after = ctx.register(ctx.stream('Q\n'));
    const mine = ctx.register(ctx.flateStream(ops));
    const current = node.get(PDFName.of('Contents'));
    const found = current === undefined ? null : ctx.lookup(current);
    const contents = found instanceof lib.PDFArray ? found : ctx.obj(current === undefined ? [] : [current]);
    // The page's own drawing goes between q and Q, so nothing it leaves changed touches ours.
    contents.insert(0, before);
    contents.push(after);
    contents.push(mine);
    node.set(PDFName.of('Contents'), contents);
    node.set(PDFName.of('MuttEditStreams'), ctx.obj([before, after, mine]));
    node.set(PDFName.of('MuttEdits'), PDFHexString.fromText(JSON.stringify(saved)));
  }
  return doc.save();
}

// ---------------------------------------------------------------- the lines of a page, for changing words

function linesOf(content) {
  const out = [];
  for (const item of content.items) {
    if (!item.str || !item.str.trim() || !item.transform) continue;
    const [a, b, c, d, e, g] = item.transform;
    const size = Math.hypot(c, d);
    const wide = Math.hypot(a, b);
    if (!size || !wide) continue;
    const u = [a / wide, b / wide];
    const n = [c / size, d / size];
    const style = content.styles[item.fontName] || {};
    const last = out[out.length - 1];
    if (last && last.u[0] * u[0] + last.u[1] * u[1] > 0.999) {
      const dx = e - last.at[0];
      const dy = g - last.at[1];
      const along = dx * u[0] + dy * u[1];
      const across = dx * n[0] + dy * n[1];
      const gap = along - last.len;
      if (Math.abs(across) < Math.min(size, last.size) * 0.3 && gap > -last.size * 0.5 && gap < last.size * 1.5) {
        last.text += (gap > last.size * 0.15 && !/\s$/.test(last.text) && !/^\s/.test(item.str) ? ' ' : '') + item.str;
        last.len = Math.max(last.len, along + item.width);
        last.items.push(item);
        continue;
      }
    }
    out.push({
      text: item.str, at: [e, g], u, n, size, len: item.width, items: [item], fontName: item.fontName,
      family: style.fontFamily || 'sans-serif', asc: style.ascent || 0.8, desc: Math.abs(style.descent || -0.2),
    });
  }
  return out.map((l) => ({ ...l, text: l.text.replace(/\s+$/, '') }));
}

// The face of a line: from the PDF's own font's name where pdf.js kept it.
function faceOfLine(line, page) {
  let name = '';
  try { if (page.commonObjs.has(line.fontName)) name = page.commonObjs.get(line.fontName)?.name || ''; } catch { /* not loaded */ }
  const all = `${name} ${line.family}`;
  const face = /courier|mono|consol|menlo/i.test(all) ? 'mono'
    : /times|georgia|garamond|minion|cambria|palatino|caslon|baskerville|book|serif(?!.*sans)/i.test(all) && !/sans/i.test(all) ? 'serif' : 'sans';
  return { face, bold: /bold|black|heavy|semibold|demi/i.test(name), italic: /italic|oblique/i.test(name) };
}

// The page's colour and the words' ink under a patch, read from the drawn page.
function colours(canvas, vp, corners) {
  const fallback = { paper: [1, 1, 1], ink: [0, 0, 0] };
  try {
    const k = canvas.width / vp.width;
    const [x0, y0, x1, y1] = bboxOf(corners.map(([x, y]) => toView(vp, x, y)));
    const sx = Math.max(0, Math.floor(x0 * k));
    const sy = Math.max(0, Math.floor(y0 * k));
    const w = Math.min(canvas.width - sx, Math.ceil((x1 - x0) * k));
    const hgt = Math.min(canvas.height - sy, Math.ceil((y1 - y0) * k));
    if (w < 2 || hgt < 2) return fallback;
    const px = canvas.getContext('2d').getImageData(sx, sy, w, hgt).data;
    const at = (x, y) => { const i = (y * w + x) * 4; return [px[i], px[i + 1], px[i + 2]]; };
    // The page: the commonest colour round the edge of the patch.
    const tally = new Map();
    const count = (c) => { const key = c.map((v) => v >> 4).join(','); const t = tally.get(key) || { n: 0, sum: [0, 0, 0] }; t.n++; c.forEach((v, j) => { t.sum[j] += v; }); tally.set(key, t); };
    for (let x = 0; x < w; x++) { count(at(x, 0)); count(at(x, hgt - 1)); }
    for (let y = 0; y < hgt; y++) { count(at(0, y)); count(at(w - 1, y)); }
    const top = [...tally.values()].sort((a, b) => b.n - a.n)[0];
    const paper = top.sum.map((v) => v / top.n);
    // The ink: the quarter of the inside farthest from the page.
    const far = [];
    for (let y = 1; y < hgt - 1; y += 1) for (let x = 1; x < w - 1; x += 1) {
      const c = at(x, y);
      const d = Math.hypot(c[0] - paper[0], c[1] - paper[1], c[2] - paper[2]);
      if (d > 60) far.push([d, c]);
    }
    far.sort((a, b) => b[0] - a[0]);
    const best = far.slice(0, Math.max(1, Math.floor(far.length / 4)));
    const ink = best.length && far.length ? [0, 1, 2].map((j) => best.reduce((s, [, c]) => s + c[j], 0) / best.length) : [0, 0, 0];
    return { paper: paper.map((v) => v / 255), ink: ink.map((v) => v / 255) };
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------- your signature (kept on this device)

const SIG_KEY = 'mutt:signature';
const mySignature = () => { try { const s = JSON.parse(localStorage.getItem(SIG_KEY)); return s?.strokes?.length ? s : null; } catch { return null; } };

function drawSignature() {
  return new Promise((resolve) => {
    const pad = h('canvas', { class: 'pm-pad', width: 960, height: 360, 'aria-label': 'Sign here' });
    const strokes = [];
    let live = null;
    const ctx = pad.getContext('2d');
    const ink = named('--paper-ink');
    const point = (e) => { const r = pad.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * pad.width, (e.clientY - r.top) / r.height * pad.height]; };
    const paint = () => {
      ctx.clearRect(0, 0, pad.width, pad.height);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 5;
      ctx.strokeStyle = ink;
      for (const s of strokes) {
        ctx.beginPath();
        ctx.moveTo(s[0], s[1]);
        for (let i = 2; i < s.length; i += 2) ctx.lineTo(s[i], s[i + 1]);
        if (s.length === 2) ctx.lineTo(s[0] + 0.1, s[1]);
        ctx.stroke();
      }
      use.disabled = !strokes.length;
    };
    pad.addEventListener('pointerdown', (e) => {
      pad.setPointerCapture(e.pointerId);
      live = point(e);
      strokes.push(live);
      paint();
    });
    pad.addEventListener('pointermove', (e) => {
      if (!live) return;
      for (const ev of e.getCoalescedEvents?.() || [e]) live.push(...point(ev));
      paint();
    });
    const end = () => { live = null; };
    pad.addEventListener('pointerup', end);
    pad.addEventListener('pointercancel', end);
    let result = null;
    const use = h('button', {
      type: 'button', class: 'btn btn-main', disabled: true,
      onclick: () => {
        const [x0, y0, x1, y1] = bboxOf(strokes.flatMap((s) => { const o = []; for (let i = 0; i < s.length; i += 2) o.push([s[i], s[i + 1]]); return o; }));
        const w = Math.max(1, x1 - x0);
        const hh = Math.max(1, y1 - y0);
        result = { ratio: hh / w, strokes: strokes.map((s) => s.map((v, i) => (i % 2 ? (v - y0) / w : (v - x0) / w))) };
        try { localStorage.setItem(SIG_KEY, JSON.stringify(result)); } catch { /* kept for this time only */ }
        dialog.close();
      },
    }, 'Use it');
    const body = h('div', null,
      h('p', { class: 'dialog-text' }, 'Sign with your mouse, trackpad or finger. It’s kept on this device for next time.'),
      pad,
      h('div', { class: 'dialog-actions' },
        h('button', { type: 'button', class: 'btn btn-quiet pm-pad-clear', onclick: () => { strokes.length = 0; paint(); } }, 'Clear'),
        h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => dialog.close() }, 'Cancel'),
        use));
    const dialog = openDialog({ title: 'Your signature', body, className: 'dialog-wide pm-sign', onClose: () => resolve(result) });
  });
}

// ---------------------------------------------------------------- the tools

const TOOLS = [
  { key: 'pen', icon: 'pen', label: 'Pen', tip: 'Draw on the page' },
  { key: 'text', icon: 'textbox', label: 'Text box', tip: 'Type anywhere on the page' },
  { key: 'note', icon: 'note', label: 'Note', tip: 'Pin a note to the page' },
  { key: 'sign', icon: 'sign', label: 'Signature', tip: 'Place your signature' },
  { key: 'edit', icon: 'edit', label: 'Change words', tip: 'Click a line to change its words' },
];

class Markup {
  constructor(view) {
    this.view = view;
    this.marks = [];
    this.edits = [];
    this.history = [];
    this.future = [];
    this.tool = null;
    this.chosen = null;
    this.open = false;
    this.pen = { colour: 'black', width: 'fine' };
    this.typing = { colour: 'black', size: 'regular' };
    this.marker = 'yellow';
    this.vps = new Map();
    this.timer = 0;
    this.offs = [];
    this.ready = this.load();
    view.onPage = (n) => { this.ready.then(() => this.paint(n - 1)); };
    this.listen();
  }

  async vpOf(i) {
    const info = this.view.info.get(i + 1);
    if (info) return info.vp;
    if (!this.vps.has(i)) this.vps.set(i, this.view.doc.getPage(i + 1).then((p) => p.getViewport({ scale: 1 })));
    return this.vps.get(i);
  }

  async load() {
    const { block } = this.view;
    if (block.size > MAX_BYTES) throw new Error('This PDF is too large to mark up here.');
    const [lib, res] = await Promise.all([loadPdfLib(), fetch(block.file, { credentials: 'same-origin' })]);
    if (!res.ok) throw new Error('The PDF couldn’t be fetched to mark up.');
    const bytes = new Uint8Array(await res.arrayBuffer());
    let doc;
    try {
      doc = await lib.PDFDocument.load(bytes, { updateMetadata: false });
    } catch (err) {
      throw new Error(/encrypt/i.test(err?.message || '') ? 'This PDF is locked against changes, so it can’t be marked up.' : 'This PDF couldn’t be opened for marking up.');
    }
    const { marks, edits, changed } = await takeApart(lib, doc, (i) => this.vpOf(i));
    this.marks = marks;
    this.edits = edits;
    this.lib = lib;
    this.base = changed ? await doc.save() : bytes;
    this.saved = this.snapshot();
    if (changed) await this.view.swap(this.base);
    for (const n of this.view.info.keys()) this.paint(n - 1);
  }

  snapshot() { return JSON.stringify({ marks: this.marks, edits: this.edits }); }

  // ------------------------------------------------ painting the marks

  layers(box) {
    let flat = box.querySelector(':scope > .pm-flat');
    if (!flat) {
      const canvas = box.querySelector(':scope > canvas, :scope > img');
      flat = svg('svg', { class: 'pm-flat', preserveAspectRatio: 'none', 'aria-hidden': 'true' });
      const multiply = svg('svg', { class: 'pm-multiply', preserveAspectRatio: 'none', 'aria-hidden': 'true' });
      if (canvas) canvas.after(flat, multiply);
      else box.prepend(flat, multiply);
      box.append(h('div', { class: 'pm-top' }));
    }
    return { flat, multiply: box.querySelector(':scope > .pm-multiply'), top: box.querySelector(':scope > .pm-top') };
  }

  paint(i) {
    const box = this.view.boxOf(i + 1);
    const info = this.view.info.get(i + 1);
    if (!box || !info) return;
    const { vp } = info;
    const { flat, multiply, top } = this.layers(box);
    const view = `0 0 ${f(vp.width)} ${f(vp.height)}`;
    flat.setAttribute('viewBox', view);
    multiply.setAttribute('viewBox', view);
    flat.replaceChildren();
    multiply.replaceChildren();
    top.querySelectorAll(':scope > :not(.pm-catch):not(.pm-line):not(.pm-typing)').forEach((el) => el.remove());
    const at = (x, y) => toView(vp, x, y);
    const pct = ([x, y]) => ({ left: `${(x / vp.width) * 100}%`, top: `${(y / vp.height) * 100}%` });

    for (const e of this.edits.filter((x) => x.page === i)) {
      const patch = svg('polygon', { fill: rgbHex(e.paper) });
      const cover = (newLen) => patch.setAttribute('points', editCorners({ ...e, newLen }).map(([x, y]) => at(x, y).map(f).join(',')).join(' '));
      cover(e.newLen || 0);
      flat.append(patch);
      if (e.text) {
        const o = at(...e.at);
        const tip = at(e.at[0] + e.u[0], e.at[1] + e.u[1]);
        const angle = Math.atan2(tip[1] - o[1], tip[0] - o[0]) * 180 / Math.PI;
        flat.append(svg('text', {
          class: `pm-words pm-face-${e.face}${e.bold ? ' is-bold' : ''}${e.italic ? ' is-italic' : ''}`,
          transform: `translate(${f(o[0])} ${f(o[1])}) rotate(${f(angle)})`, 'font-size': f(e.size), fill: rgbHex(e.ink),
        }, e.text));
        try { cover(flat.lastChild.getComputedTextLength()); } catch { /* not laid out yet */ }
      }
    }
    for (const m of this.marks.filter((x) => x.page === i)) {
      const hex = colourOf(m.colour).hex;
      const frame = m.frame || frameOf(vp);
      if (m.quads) {
        for (const q of m.quads) {
          const s = sides(q, frame);
          const [tl, tr, bl, br] = [s.tl, s.tr, s.bl, s.br].map((p) => at(...p));
          if (m.kind === 'highlight') {
            multiply.append(svg('polygon', { points: [tl, tr, br, bl].map((p) => p.map(f).join(',')).join(' '), fill: hex, 'fill-opacity': MARKER_ALPHA }));
          } else {
            const t = m.kind === 'strike' ? 0.42 : 0.1;
            const a = lerp(bl, tl, t);
            const b = lerp(br, tr, t);
            flat.append(svg('line', { x1: f(a[0]), y1: f(a[1]), x2: f(b[0]), y2: f(b[1]), stroke: hex, 'stroke-width': f(Math.max(0.6, Math.hypot(tl[0] - bl[0], tl[1] - bl[1]) * 0.07)) }));
          }
        }
        if (m.note) this.badge(top, m, vp, pct);
      } else if (m.strokes) {
        const d = m.strokes.map((s) => {
          const pts = [];
          for (let k = 0; k < s.length; k += 2) pts.push(at(s[k], s[k + 1]));
          return `M${pts.map((p) => p.map(f).join(' ')).join('L')}${pts.length === 1 ? 'h0.01' : ''}`;
        }).join('');
        (m.marker ? multiply : flat).append(svg('path', {
          d, fill: 'none', stroke: hex, 'stroke-width': f(m.width), 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
          'stroke-opacity': m.marker ? MARKER_ALPHA : null,
        }));
      } else if (m.kind === 'text' && !(this.typingIn?.mark === m)) {
        const o = at(...m.at);
        const text = svg('text', { class: 'pm-words pm-face-sans', 'font-size': f(m.size), fill: hex });
        m.text.split('\n').forEach((line, k) => text.append(svg('tspan', { x: f(o[0]), y: f(o[1] + m.size * (FIRST + k * LEAD)) }, line || ' ')));
        flat.append(text);
      } else if (m.kind === 'note') {
        const o = at(...m.at);
        const btn = h('button', {
          type: 'button', class: 'pm-note', 'aria-label': 'Note', title: m.note ? m.note.slice(0, 80) : 'Note',
          style: { ...pct(o), '--c': hex, '--size': `${NOTE}px` },
          onclick: (ev) => { ev.stopPropagation(); this.choose(m); this.writeNote(m, btn); },
        }, icon('comment', 12));
        top.append(btn);
      }
    }
    if (this.chosen?.page === i) this.outline(top, vp, pct);
    if (this.tool && !top.querySelector('.pm-catch')) top.append(this.catcher(box));
    this.hoverLine = null;
  }

  // A highlight's note shows as a small mark in the page's margin, level with it.
  badge(top, m, vp, pct) {
    const box = seenBox(m, vp);
    const btn = h('button', {
      type: 'button', class: 'pm-badge', 'aria-label': 'Note', title: m.note.slice(0, 80),
      style: { ...pct([vp.width - NOTE / 2 - 4, box[1] + NOTE / 2]), '--c': colourOf(m.colour).hex, '--size': `${NOTE}px` },
      onclick: (ev) => { ev.stopPropagation(); this.choose(m); this.writeNote(m, btn); },
    }, icon('comment', 12));
    top.append(btn);
  }

  // The chosen mark: an outline, and (for what can move) a handle to drag it, and one to grow it.
  outline(top, vp, pct) {
    const m = this.chosen;
    const [x0, y0, x1, y1] = seenBox(m, vp);
    const pad = m.kind === 'ink' ? m.width / 2 + 3 : 3;
    const moves = ['ink', 'text', 'note'].includes(m.kind);
    const sel = h('div', {
      class: `pm-sel${moves ? ' is-movable' : ''}`,
      style: { ...pct([x0 - pad, y0 - pad]), width: `${((x1 - x0 + pad * 2) / vp.width) * 100}%`, height: `${((y1 - y0 + pad * 2) / vp.height) * 100}%` },
    });
    if (moves) this.dragging(sel, m, vp);
    if (m.kind === 'ink') {
      const grip = h('span', { class: 'pm-grip', 'aria-hidden': 'true' });
      this.growing(grip, m, vp);
      sel.append(grip);
    }
    if (m.kind === 'text') sel.addEventListener('dblclick', () => this.typeIn(m));
    top.append(sel);
  }

  dragging(el, m, vp) {
    el.addEventListener('pointerdown', (e) => {
      if (e.button || e.target.closest('.pm-grip')) return;
      e.preventDefault();
      e.stopPropagation();
      el.setPointerCapture(e.pointerId);
      const box = el.closest('.vw-pdf-page').getBoundingClientRect();
      const k = vp.width / box.width;
      const start = [e.clientX, e.clientY];
      const before = clone(m);
      let moved = false;
      const move = (ev) => {
        const dx = (ev.clientX - start[0]) * k;
        const dy = (ev.clientY - start[1]) * k;
        if (!moved && Math.hypot(dx, dy) < 2) return;
        if (!moved) this.remember();
        moved = true;
        const [ax, ay] = toPdf(vp, 0, 0);
        const [bx, by] = toPdf(vp, dx, dy);
        Object.assign(m, clone(before));
        moveMark(m, bx - ax, by - ay);
        this.paint(m.page);
        this.hideBubble();
      };
      const up = () => {
        el.removeEventListener('pointermove', move);
        if (moved) { this.changed(); this.showMarkBubble(); }
        else if (m.kind === 'note') this.writeNote(m, el);
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up, { once: true });
      el.addEventListener('pointercancel', up, { once: true });
    });
  }

  growing(grip, m, vp) {
    grip.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      grip.setPointerCapture(e.pointerId);
      const before = clone(m);
      const [x0, y0, x1] = seenBox(before, vp);
      const origin = toPdf(vp, x0, y0);
      const box = grip.closest('.vw-pdf-page').getBoundingClientRect();
      const k = vp.width / box.width;
      const start = e.clientX;
      this.remember();
      const move = (ev) => {
        const wide = Math.max(12, x1 - x0 + (ev.clientX - start) * k);
        Object.assign(m, clone(before));
        scaleMark(m, wide / Math.max(1, x1 - x0), origin);
        this.paint(m.page);
        this.hideBubble();
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', () => { grip.removeEventListener('pointermove', move); this.changed(); this.showMarkBubble(); }, { once: true });
    });
  }

  // ------------------------------------------------ changes, undo, saving

  remember() {
    this.history.push(this.snapshot());
    if (this.history.length > 100) this.history.shift();
    this.future = [];
    this.syncBar();
  }

  changed(pages) {
    this.status('Saving…');   // it will be, in a moment; the bar keeps its width
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.save(), SAVE_AFTER);
    if (pages) pages.forEach((i) => this.paint(i));
    this.syncBar();
  }

  restore(snap) {
    const touched = new Set([...this.marks, ...this.edits].map((m) => m.page));
    const { marks, edits } = JSON.parse(snap);
    this.marks = marks;
    this.edits = edits;
    [...marks, ...edits].forEach((m) => touched.add(m.page));
    this.chosen = null;
    this.hideBubble();
    this.changed([...touched]);
  }

  undo() {
    if (!this.history.length) return;
    this.future.push(this.snapshot());
    this.restore(this.history.pop());
  }

  redo() {
    if (!this.future.length) return;
    this.history.push(this.snapshot());
    this.restore(this.future.pop());
  }

  async save() {
    clearTimeout(this.timer);
    if (!this.lib || this.gone && !this.flushing) return;
    if (this.saving) { this.again = true; return this.saving; }
    const snap = this.snapshot();
    if (snap === this.saved) { this.status('Saved'); return null; }
    const firstPage = (s) => JSON.stringify(JSON.parse(s).marks.filter((m) => !m.page).concat(JSON.parse(s).edits.filter((m) => !m.page)));
    const coverChanged = firstPage(snap) !== firstPage(this.saved);
    this.status('Saving…');
    this.saving = (async () => {
      try {
        const bytes = await writeAll(this.lib, this.base, JSON.parse(snap).marks, JSON.parse(snap).edits, session.user?.username ? `@${session.user.username}` : null);
        const res = await fetch(`/api/blocks/${this.view.block.id}/file`, {
          method: 'PUT', credentials: 'same-origin', body: bytes,
          headers: { 'X-Mutt': '1', 'Content-Type': 'application/pdf' },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'The PDF couldn’t be saved.');
        this.saved = snap;
        let { block } = data;
        // The file's picture is its first page: drawn again when that page changed.
        if (coverChanged) {
          const thumb = await makeThumb(new Blob([bytes], { type: 'application/pdf' }), 'pdf');
          if (thumb?.blob) {
            const q = new URLSearchParams({ w: thumb.width, h: thumb.height, pages: thumb.pages });
            block = (await sendFile(`/api/blocks/${block.id}/thumb?${q}`, thumb.blob).catch(() => ({ block }))).block;
          }
        }
        this.view.saved(block);
        this.status(this.snapshot() === snap ? 'Saved' : '');
      } catch (err) {
        this.status('Not saved');
        if (!this.gone) toast(err.message || 'The PDF couldn’t be saved.', { action: { label: 'Try again', run: () => this.save() } });
      } finally {
        this.saving = null;
        if (this.again) { this.again = false; this.save(); }
      }
    })();
    return this.saving;
  }

  status(words) {
    if (this.statusEl) this.statusEl.textContent = words;
  }

  // ------------------------------------------------ choosing and the bubble

  choose(m) {
    const was = this.chosen;
    this.chosen = m;
    if (was && was !== m) this.paint(was.page);
    if (m) { this.paint(m.page); this.showMarkBubble(); } else this.hideBubble();
  }

  hit(i, vx, vy) {
    const vp = this.view.info.get(i + 1)?.vp;
    if (!vp) return null;
    const inside = (m, slack) => { const [x0, y0, x1, y1] = seenBox(m, vp); return vx >= x0 - slack && vx <= x1 + slack && vy >= y0 - slack && vy <= y1 + slack; };
    const near = (m) => m.strokes.some((s) => {
      for (let k = 0; k < s.length; k += 2) {
        const [px, py] = toView(vp, s[k], s[k + 1]);
        if (Math.hypot(px - vx, py - vy) < m.width / 2 + 5) return true;
      }
      return false;
    });
    const list = this.marks.filter((m) => m.page === i);
    for (const kind of ['note', 'text', 'ink']) {
      const found = list.filter((m) => m.kind === kind).reverse().find((m) => (kind === 'ink' ? (inside(m, 4) && (m.sig || near(m))) : inside(m, 2)));
      if (found) return found;
    }
    const edit = this.edits.filter((e) => e.page === i).reverse().find((e) => inside({ kind: 'edit', ...e }, 1));
    if (edit) return { kind: 'edit', edit, page: i };
    return list.filter((m) => m.quads).reverse().find((m) => m.quads.some((q) => inside({ quads: [q] }, 1))) || null;
  }

  bubble(buttons, rect) {
    this.hideBubble();
    const el = h('div', { class: 'pm-bubble bar-glass', role: 'toolbar', 'aria-label': 'Mark' }, ...buttons);
    this.view.wrap.closest('.viewer').append(el);
    const r = el.getBoundingClientRect();
    const room = this.view.pages.getBoundingClientRect();
    let left = (rect.left + rect.right) / 2 - r.width / 2;
    left = Math.max(12, Math.min(left, innerWidth - r.width - 12));
    let top = rect.top - r.height - 10;
    if (top < Math.max(12, room.top)) top = rect.bottom + 10;
    el.style.left = `${left}px`;
    el.style.top = `${Math.min(top, innerHeight - r.height - 12)}px`;
    this.bubbleEl = el;
    return el;
  }

  hideBubble() {
    if (this.bubbleEl) exit(this.bubbleEl);
    this.bubbleEl = null;
  }

  round(iconName, label, run, { on = null } = {}) {
    return h('button', {
      type: 'button', class: 'btn btn-quiet btn-round', 'aria-label': label, title: label,
      'aria-pressed': on == null ? null : String(on),
      onpointerdown: (e) => e.preventDefault(),   // the words stay picked
      onclick: run,
    }, icon(iconName));
  }

  swatches(list, current, pick, verb = '') {
    return list.map((c) => h('button', {
      type: 'button', class: 'swatch', style: { '--c': c.hex }, 'aria-label': `${verb}${c.label}`, title: `${verb}${c.label}`,
      'aria-pressed': String(c.key === current),
      onpointerdown: (e) => e.preventDefault(),
      onclick: () => pick(c.key),
    }));
  }

  // Words picked on a page.
  async picked() {
    try { await this.ready; } catch (err) { toast(err.message); return; }
    const range = this.range();
    if (!range) return;
    const one = this.lineOfRange(range);
    this.bubble([
      ...this.swatches(MARKERS, null, (key) => { this.marker = key; this.markWords('highlight', key); }, 'Highlight '),
      h('span', { class: 'pm-sep' }),
      this.round('underline', 'Underline', () => this.markWords('underline', 'red')),
      this.round('strike', 'Strike through', () => this.markWords('strike', 'red')),
      this.round('comment', 'Highlight with a note', () => { const m = this.markWords('highlight', this.marker); if (m) this.writeNote(m); }),
      one ? this.round('edit', 'Change these words', () => { getSelection().removeAllRanges(); this.hideBubble(); this.editLine(one.page, one.line); }) : null,
    ].filter(Boolean), range.getBoundingClientRect());
  }

  range() {
    const sel = getSelection();
    if (!sel.rangeCount || sel.isCollapsed) return null;
    const range = sel.getRangeAt(0);
    return this.view.pages.contains(range.commonAncestorContainer) ? range : null;
  }

  // The picked words as quads on each page, one per run of a line.
  quadsOf(range) {
    const out = new Map();
    const rects = [...range.getClientRects()].filter((r) => r.width > 0.5 && r.height > 0.5);
    const boxes = [...this.view.pages.querySelectorAll('.vw-pdf-page')];
    const heights = rects.map((r) => r.height).sort((a, b) => a - b);
    const typical = heights[Math.floor(heights.length / 2)] || 0;
    for (const r of rects) {
      if (r.height > typical * 2.5) continue;
      const cx = (r.left + r.right) / 2;
      const cy = (r.top + r.bottom) / 2;
      const box = boxes.find((b) => { const br = b.getBoundingClientRect(); return cx >= br.left && cx <= br.right && cy >= br.top && cy <= br.bottom; });
      if (!box) continue;
      const i = Number(box.dataset.n) - 1;
      if (!out.has(i)) out.set(i, { box, rects: [] });
      out.get(i).rects.push(r);
    }
    const result = [];
    for (const [i, { box, rects: list }] of out) {
      const vp = this.view.info.get(i + 1)?.vp;
      if (!vp) continue;
      const br = box.getBoundingClientRect();
      const k = vp.width / br.width;
      // Runs on one line that touch become one.
      const merged = [];
      for (const r of list.map((q) => ({ l: (q.left - br.left) * k, t: (q.top - br.top) * k, r: (q.right - br.left) * k, b: (q.bottom - br.top) * k })).sort((a, b) => a.t - b.t || a.l - b.l)) {
        const same = merged.find((m) => Math.min(m.b, r.b) - Math.max(m.t, r.t) > Math.min(m.b - m.t, r.b - r.t) * 0.5 && r.l - m.r < (r.b - r.t) * 0.6 && m.l - r.r < (r.b - r.t) * 0.6);
        if (same) {
          if (r.l >= same.l - 0.5 && r.r <= same.r + 0.5 && r.t >= same.t - 0.5 && r.b <= same.b + 0.5) continue;
          same.l = Math.min(same.l, r.l); same.r = Math.max(same.r, r.r); same.t = Math.min(same.t, r.t); same.b = Math.max(same.b, r.b);
        } else merged.push({ ...r });
      }
      const quads = merged.map((m) => {
        const tl = toPdf(vp, m.l, m.t);
        const tr = toPdf(vp, m.r, m.t);
        const bl = toPdf(vp, m.l, m.b);
        const bR = toPdf(vp, m.r, m.b);
        return [...tl, ...tr, ...bl, ...bR];
      });
      if (quads.length) result.push({ page: i, quads, frame: frameOf(vp) });
    }
    return result;
  }

  markWords(kind, colour) {
    const range = this.range();
    if (!range) return null;
    const groups = this.quadsOf(range);
    getSelection().removeAllRanges();
    this.hideBubble();
    if (!groups.length) return null;
    this.remember();
    let last = null;
    for (const g of groups) {
      last = { id: uid(), kind, page: g.page, colour, quads: g.quads, frame: g.frame, note: '' };
      this.marks.push(last);
    }
    this.changed(groups.map((g) => g.page));
    this.showBar(false);
    return last;
  }

  showMarkBubble() {
    const m = this.chosen;
    if (!m) return;
    const box = this.view.boxOf(m.page + 1);
    const sel = box?.querySelector('.pm-sel');
    if (!sel) return;
    const recolour = (key) => { this.remember(); m.colour = key; if (m.strokes && !m.sig) m.marker = !!colourOf(key).marker; this.changed([m.page]); this.showMarkBubble(); };
    const remove = () => this.removeChosen();
    let buttons;
    if (m.kind === 'edit') {
      buttons = [this.round('edit', 'Change these words', () => { this.hideBubble(); this.editLine(m.page, null, m.edit); }),
        this.round('undo', 'Put the old words back', remove)];
    } else if (m.quads) {
      buttons = [...this.swatches(m.kind === 'highlight' ? MARKERS : COLOURS, m.colour, recolour),
        h('span', { class: 'pm-sep' }),
        this.round('comment', m.note ? 'Edit the note' : 'Add a note', () => this.writeNote(m)),
        this.round('trash', 'Remove', remove)];
    } else if (m.kind === 'ink') {
      buttons = [...this.swatches(m.sig ? INKS : COLOURS, m.colour, recolour), h('span', { class: 'pm-sep' }), this.round('trash', 'Remove', remove)];
    } else if (m.kind === 'text') {
      buttons = [this.round('edit', 'Edit the words', () => this.typeIn(m)), ...this.swatches(INKS, m.colour, recolour), h('span', { class: 'pm-sep' }), this.round('trash', 'Remove', remove)];
    } else if (m.kind === 'note') {
      buttons = [this.round('comment', 'Open the note', () => this.writeNote(m)), ...this.swatches(MARKERS, m.colour, recolour), h('span', { class: 'pm-sep' }), this.round('trash', 'Remove', remove)];
    }
    this.bubble(buttons, sel.getBoundingClientRect());
  }

  removeChosen() {
    const m = this.chosen;
    if (!m) return;
    this.remember();
    if (m.kind === 'edit') this.edits = this.edits.filter((e) => e !== m.edit);
    else this.marks = this.marks.filter((x) => x !== m);
    this.chosen = null;
    this.hideBubble();
    this.changed([m.page]);
  }

  // A note, written in a small panel beside it.
  writeNote(m, anchor) {
    const box = this.view.boxOf(m.page + 1);
    if (!anchor) {
      if (this.chosen !== m) { this.chosen = m; this.paint(m.page); }
      anchor = box?.querySelector('.pm-sel');
    }
    this.hideBubble();
    if (!anchor) return;
    const area = h('textarea', { class: 'field pm-note-text', rows: 4, placeholder: 'Write a note', value: m.note || '', spellcheck: 'true', 'aria-label': 'Note' });
    const before = m.note || '';
    let pop;
    const done = h('button', { type: 'button', class: 'btn btn-small btn-main', onclick: () => pop.close() }, 'Done');
    const panel = h('div', { class: 'pm-note-panel' },
      h('div', { class: 'pm-label' }, 'Note'),
      area,
      h('div', { class: 'pm-note-foot' },
        h('button', { type: 'button', class: 'btn btn-small btn-quiet', onclick: () => { area.value = ''; pop.close(); } }, m.kind === 'note' ? 'Remove' : 'Clear'),
        done));
    pop = openPopover(anchor, panel, {
      className: 'pop-panel pm-note-pop',
      onClose: () => {
        const text = area.value.trim();
        const fresh = this.fresh?.mark === m ? this.fresh : null;
        this.fresh = null;
        if (m.kind === 'note' && !text) {
          if (this.marks.includes(m)) { if (!fresh) this.remember(); this.marks = this.marks.filter((x) => x !== m); }
          this.chosen = null;
          if (fresh) this.paint(m.page); else this.changed([m.page]);
          return;
        }
        if (text === before && !fresh) { this.paint(m.page); return; }
        if (fresh) { this.history.push(fresh.before); this.future = []; } else this.remember();
        m.note = text;
        this.changed([m.page]);
      },
    });
    area.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); pop.close(); } });
    requestAnimationFrame(() => area.focus());
  }

  // ------------------------------------------------ changing the words of a line

  lineAt(i, vx, vy) {
    const content = this.view.text.get(i + 1);
    const vp = this.view.info.get(i + 1)?.vp;
    if (!content || !vp) return null;
    content.lines ||= linesOf(content);
    return content.lines.find((l) => {
      const [x0, y0, x1, y1] = bboxOf(editCorners({ ...l, newLen: 0 }).map(([x, y]) => toView(vp, x, y)));
      return vx >= x0 && vx <= x1 && vy >= y0 && vy <= y1;
    }) || null;
  }

  lineOfRange(range) {
    const r = range.getBoundingClientRect();
    const box = range.startContainer.parentElement?.closest('.vw-pdf-page');
    if (!box || !box.contains(range.endContainer)) return null;
    const i = Number(box.dataset.n) - 1;
    const vp = this.view.info.get(i + 1)?.vp;
    if (!vp) return null;
    const br = box.getBoundingClientRect();
    const k = vp.width / br.width;
    const line = this.lineAt(i, ((r.left + r.right) / 2 - br.left) * k, ((r.top + r.bottom) / 2 - br.top) * k);
    return line ? { page: i, line } : null;
  }

  // Edits one line (or an earlier change) in place, over the page.
  editLine(i, line, earlier = null) {
    const info = this.view.info.get(i + 1);
    const box = this.view.boxOf(i + 1);
    if (!info || !box) return;
    const { vp, page } = info;
    let e = earlier;
    if (!e) {
      const already = this.edits.find((x) => x.page === i && Math.hypot(x.at[0] - line.at[0], x.at[1] - line.at[1]) < 0.5);
      if (already) e = already;
    }
    if (!e) {
      const tip = toView(vp, line.at[0] + line.u[0], line.at[1] + line.u[1]);
      const o = toView(vp, ...line.at);
      if (Math.abs(tip[1] - o[1]) > 0.05) { toast('Only words that run across the page can be changed.'); return; }
      const { face, bold, italic } = faceOfLine(line, page);
      const corners = editCorners({ ...line, newLen: 0 });
      const canvas = box.querySelector(':scope > canvas');
      const { paper, ink } = canvas ? colours(canvas, vp, corners) : { paper: [1, 1, 1], ink: [0, 0, 0] };
      e = { at: line.at, u: line.u, n: line.n, size: line.size, len: line.len, asc: line.asc, desc: line.desc, face, bold, italic, paper, ink, was: line.text, text: line.text };
    }
    const { top } = this.layers(box);
    top.querySelector('.pm-line')?.remove();
    const o = toView(vp, ...e.at);
    const [x0, y0, x1, y1] = bboxOf(editCorners(e).map(([x, y]) => toView(vp, x, y)));
    const ed = h('div', {
      class: `pm-line pm-face-${e.face}${e.bold ? ' is-bold' : ''}${e.italic ? ' is-italic' : ''}`,
      contenteditable: 'plaintext-only', spellcheck: 'true', role: 'textbox', 'aria-label': 'The line’s words',
      style: {
        left: `${(x0 / vp.width) * 100}%`, top: `${(y0 / vp.height) * 100}%`,
        '--h': `${y1 - y0}px`, '--w': `${x1 - x0}px`, '--fs': `${e.size}px`, '--base': `${o[1] - y0}px`,
        '--pm-paper': rgbHex(e.paper), '--pm-ink': rgbHex(e.ink),
      },
    }, e.text);
    if (ed.contentEditable !== 'plaintext-only') ed.contentEditable = 'true';
    top.append(ed);
    let finished = false;
    const finish = (keep) => {
      if (finished) return;
      finished = true;
      const text = ed.textContent.replace(/\s+/g, ' ').trim();
      ed.remove();
      if (!keep) return;
      if (!writable(text)) { toast('Some of those letters can’t be written into a PDF. Try plain letters.'); return; }
      if (!earlier && !this.edits.includes(e) && text === e.was) return;
      if (this.edits.includes(e) && text === e.text) return;
      this.remember();
      e.text = text;
      if (!this.edits.includes(e)) this.edits.push({ ...e, id: uid(), page: i });
      this.chosen = null;
      this.changed([i]);
      this.showBar(false);
    };
    ed.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); finish(true); }
      if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); finish(false); }
    });
    ed.addEventListener('blur', () => finish(true));
    ed.focus();
    const sel = getSelection();
    sel.selectAllChildren(ed);
    sel.collapseToEnd();
  }

  // ------------------------------------------------ text boxes

  typeIn(m) {
    const box = this.view.boxOf(m.page + 1);
    const vp = this.view.info.get(m.page + 1)?.vp;
    if (!box || !vp) return;
    this.hideBubble();
    this.typingIn = { mark: m };
    this.chosen = null;
    this.paint(m.page);
    const { top } = this.layers(box);
    const o = toView(vp, ...m.at);
    const ed = h('div', {
      class: 'pm-typing pm-face-sans', contenteditable: 'plaintext-only', spellcheck: 'true', role: 'textbox', 'aria-label': 'Text box',
      style: { left: `${(o[0] / vp.width) * 100}%`, top: `${(o[1] / vp.height) * 100}%`, '--fs': `${m.size}px`, '--pm-ink': colourOf(m.colour).hex },
    }, m.text);
    if (ed.contentEditable !== 'plaintext-only') ed.contentEditable = 'true';
    top.append(ed);
    const before = m.text;
    const isNew = !this.marks.includes(m);
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      const text = ed.innerText.replace(/\n+$/, '').replace(/\r/g, '');
      const k = box.getBoundingClientRect().width / vp.width;
      const w = ed.offsetWidth / k;
      ed.remove();
      this.typingIn = null;
      if (!text.trim()) {
        if (!isNew) { this.remember(); this.marks = this.marks.filter((x) => x !== m); this.changed([m.page]); } else this.paint(m.page);
        return;
      }
      if (!writable(text)) { toast('Some of those letters can’t be written into a PDF. Try plain letters.'); this.paint(m.page); return; }
      if (text === before && !isNew) { this.paint(m.page); return; }
      this.remember();
      m.text = text;
      m.w = Math.max(w, m.size);
      m.h = m.size * (FIRST + 0.3 + (text.split('\n').length - 1) * LEAD);
      if (isNew) this.marks.push(m);
      this.changed([m.page]);
      this.choose(m);
    };
    ed.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' || (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey))) { ev.preventDefault(); ev.stopPropagation(); ed.blur(); }
    });
    ed.addEventListener('blur', finish);
    ed.focus();
    const sel = getSelection();
    sel.selectAllChildren(ed);
    sel.collapseToEnd();
  }

  // ------------------------------------------------ the bar

  showBar(focus = true) {
    if (this.open) return;
    this.open = true;
    this.view.markBtn?.setAttribute('aria-pressed', 'true');
    this.buildBar();
    this.view.wrap.classList.add('is-marking');
    this.syncBar();
    if (focus) this.barEl.querySelector('button')?.focus({ preventScroll: true });
  }

  hideBar() {
    if (!this.open) return;
    this.open = false;
    this.setTool(null);
    this.choose(null);
    this.view.markBtn?.setAttribute('aria-pressed', 'false');
    this.view.wrap.classList.remove('is-marking');
    if (this.barEl) { this.barEl.inert = true; exit(this.barEl); }
    this.barEl = null;
    this.statusEl = null;
    this.save();
  }

  toggle() {
    this.ready.then(() => (this.open ? this.hideBar() : this.showBar()), (err) => toast(err.message));
  }

  buildBar() {
    this.toolBtns = new Map();
    const tools = TOOLS.map((t) => {
      const b = h('button', {
        type: 'button', class: 'btn btn-quiet btn-round', 'aria-label': t.label, title: t.label, 'aria-pressed': 'false',
        onclick: () => (t.key === 'sign' ? this.signMenu(b) : this.setTool(this.tool === t.key ? null : t.key)),
      }, icon(t.icon));
      this.toolBtns.set(t.key, b);
      return b;
    });
    this.colourBtn = h('button', {
      type: 'button', class: 'swatch pm-colour', 'aria-label': 'Colour and line', title: 'Colour and line', 'aria-haspopup': 'dialog',
      onclick: () => this.colourPanel(),
    });
    this.undoBtn = this.round('undo', 'Undo', () => this.undo());
    this.redoBtn = this.round('redo', 'Redo', () => this.redo());
    this.statusEl = h('span', { class: 'pm-status', role: 'status' });
    this.barEl = h('div', { class: 'pm-bar bar-glass', role: 'toolbar', 'aria-label': 'Mark up' },
      ...tools,
      h('span', { class: 'pm-sep' }),
      this.colourBtn,
      h('span', { class: 'pm-sep' }),
      this.undoBtn, this.redoBtn,
      this.statusEl,
      h('button', { type: 'button', class: 'btn btn-small btn-main pm-done', onclick: () => this.hideBar() }, 'Done'));
    this.view.wrap.append(this.barEl);
  }

  syncBar() {
    if (!this.barEl) return;
    for (const [key, b] of this.toolBtns) b.setAttribute('aria-pressed', String(this.tool === key));
    const now = this.tool === 'text' ? this.typing.colour : this.pen.colour;
    this.colourBtn.style.setProperty('--c', colourOf(now).hex);
    this.undoBtn.disabled = !this.history.length;
    this.redoBtn.disabled = !this.future.length;
  }

  colourPanel() {
    const typing = this.tool === 'text';
    const current = typing ? this.typing : this.pen;
    const row = h('div', { class: 'pm-swatches' });
    const fill = () => row.replaceChildren(...this.swatches(typing ? INKS : COLOURS, current.colour, (key) => { current.colour = key; fill(); this.syncBar(); }));
    fill();
    const panel = h('div', { class: 'pm-panel' },
      h('div', { class: 'pm-label' }, 'Colour'), row,
      h('div', { class: 'pm-label' }, typing ? 'Size' : 'Line'),
      typing
        ? segmented([['small', 'Small'], ['regular', 'Regular'], ['large', 'Large']], current.size, (v) => { current.size = v; }, { label: 'Size' })
        : segmented([['fine', 'Fine'], ['medium', 'Medium'], ['bold', 'Bold']], current.width, (v) => { current.width = v; }, { label: 'Line' }));
    openPopover(this.colourBtn, panel, { className: 'pop-panel pm-colour-pop' });
  }

  async signMenu(btn) {
    const mine = mySignature();
    if (!mine) { await this.newSignature(); return; }
    openMenu(btn, [
      { icon: 'sign', label: 'Place my signature', run: () => this.setTool('sign') },
      { icon: 'edit', label: 'Sign again', run: () => this.newSignature() },
    ]);
  }

  async newSignature() {
    const made = await drawSignature();
    if (made) this.setTool('sign');
  }

  setTool(key) {
    this.tool = key;
    this.choose(null);
    getSelection().removeAllRanges();
    this.view.wrap.dataset.tool = key || '';
    for (const box of this.view.pages.querySelectorAll('.vw-pdf-page')) {
      box.querySelector('.pm-catch')?.remove();
      if (key && this.view.info.has(Number(box.dataset.n))) this.layers(box).top.append(this.catcher(box));
    }
    this.syncBar();
  }

  // ------------------------------------------------ a tool at work on a page

  catcher(box) {
    const el = h('div', { class: 'pm-catch' });
    const i = Number(box.dataset.n) - 1;
    const point = (e) => {
      const r = box.getBoundingClientRect();
      const vp = this.view.info.get(i + 1).vp;
      const k = vp.width / r.width;
      return [(e.clientX - r.left) * k, (e.clientY - r.top) * k, vp];
    };
    el.addEventListener('pointermove', (e) => {
      if (this.tool !== 'edit' || e.buttons) return;
      const [vx, vy, vp] = point(e);
      const line = this.lineAt(i, vx, vy);
      if (line === this.hoverLine) return;
      this.hoverLine = line;
      el.querySelector('.pm-hover')?.remove();
      if (!line) return;
      const [x0, y0, x1, y1] = bboxOf(editCorners({ ...line, newLen: 0 }).map(([x, y]) => toView(vp, x, y)));
      el.append(h('div', { class: 'pm-hover', style: { left: `${(x0 / vp.width) * 100}%`, top: `${(y0 / vp.height) * 100}%`, width: `${((x1 - x0) / vp.width) * 100}%`, height: `${((y1 - y0) / vp.height) * 100}%` } }));
    });
    el.addEventListener('pointerleave', () => { this.hoverLine = null; el.querySelector('.pm-hover')?.remove(); });
    el.addEventListener('pointerdown', (e) => {
      if (e.button) return;
      const [vx, vy, vp] = point(e);
      const [px, py] = toPdf(vp, vx, vy);
      const frame = frameOf(vp);
      if (this.tool === 'pen') { e.preventDefault(); this.drawStroke(el, e, i, point); return; }
      e.preventDefault();
      // The click that ends this press isn't a click on the page.
      this.swallow = true;
      setTimeout(() => { this.swallow = false; }, 600);
      if (this.tool === 'edit') {
        const line = this.lineAt(i, vx, vy);
        if (line) this.editLine(i, line);
        return;
      }
      if (this.tool === 'text') {
        const size = TEXT_SIZES[this.typing.size];
        const [ax, ay] = toPdf(vp, vx, vy - size * 0.6);
        const m = { id: uid(), kind: 'text', page: i, colour: this.typing.colour, at: [ax, ay], size, text: '', w: size, h: size * 1.25, frame };
        this.setTool(null);
        this.typeIn(m);
        return;
      }
      if (this.tool === 'note') {
        this.setTool(null);
        const m = { id: uid(), kind: 'note', page: i, colour: 'yellow', at: [px, py], note: '' };
        this.fresh = { mark: m, before: this.snapshot() };
        this.marks.push(m);
        this.paint(i);
        this.chosen = m;
        this.paint(i);
        this.writeNote(m, this.view.boxOf(i + 1).querySelector('.pm-sel'));
        return;
      }
      if (this.tool === 'sign') {
        const sig = mySignature();
        this.setTool(null);
        if (!sig) return;
        const wide = Math.min(170, vp.width * 0.3);
        const [ox, oy] = [vx - wide / 2, vy - (wide * sig.ratio) / 2];
        const strokes = sig.strokes.map((s) => {
          const out = [];
          for (let k = 0; k < s.length; k += 2) out.push(...toPdf(vp, ox + s[k] * wide, oy + s[k + 1] * wide));
          return out;
        });
        this.remember();
        const m = { id: uid(), kind: 'ink', page: i, colour: 'black', strokes, width: Math.max(1, wide / 110), sig: true, note: '', nm: `mutt-sig-${uid()}` };
        this.marks.push(m);
        this.changed([i]);
        this.choose(m);
      }
    });
    return el;
  }

  drawStroke(el, e, i, point) {
    el.setPointerCapture(e.pointerId);
    const [, , vp] = point(e);
    const flat = this.layers(this.view.boxOf(i + 1));
    const c = colourOf(this.pen.colour);
    const width = PEN_WIDTHS[this.pen.width] * (c.marker ? 4 : 1);
    const pts = [point(e).slice(0, 2)];
    const path = svg('path', { fill: 'none', stroke: c.hex, 'stroke-width': f(width), 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-opacity': c.marker ? MARKER_ALPHA : null });
    (c.marker ? flat.multiply : flat.flat).append(path);
    const redraw = () => path.setAttribute('d', `M${pts.map((p) => p.map(f).join(' ')).join('L')}${pts.length === 1 ? 'h0.01' : ''}`);
    redraw();
    const move = (ev) => {
      for (const one of ev.getCoalescedEvents?.() || [ev]) {
        const p = point(one).slice(0, 2);
        const last = pts[pts.length - 1];
        if (Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.6) pts.push(p);
      }
      redraw();
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      // A little smoothing: each point leans toward its neighbours.
      const smooth = pts.map((p, k) => (k && k < pts.length - 1 ? [(pts[k - 1][0] + p[0] * 2 + pts[k + 1][0]) / 4, (pts[k - 1][1] + p[1] * 2 + pts[k + 1][1]) / 4] : p));
      this.remember();
      this.marks.push({ id: uid(), kind: 'ink', page: i, colour: c.key, strokes: [smooth.flatMap(([x, y]) => toPdf(vp, x, y))], width, marker: !!c.marker, note: '' });
      this.changed([i]);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up, { once: true });
    el.addEventListener('pointercancel', up, { once: true });
  }

  // ------------------------------------------------ listening

  listen() {
    const { pages } = this.view;
    const on = (target, type, fn, opts) => { target.addEventListener(type, fn, opts); this.offs.push(() => target.removeEventListener(type, fn, opts)); };
    // A click on the page (not on picked words) chooses the mark under it.
    on(pages, 'click', (e) => {
      if (this.swallow) { this.swallow = false; return; }
      if (this.tool || !this.lib || e.target.closest('.pm-top > :not(.pm-catch)')) return;
      if (!getSelection().isCollapsed) return;
      const box = e.target.closest('.vw-pdf-page');
      if (!box) { this.choose(null); return; }
      const i = Number(box.dataset.n) - 1;
      const vp = this.view.info.get(i + 1)?.vp;
      if (!vp) return;
      const r = box.getBoundingClientRect();
      const k = vp.width / r.width;
      const found = this.hit(i, (e.clientX - r.left) * k, (e.clientY - r.top) * k);
      this.choose(found);
    });
    on(pages, 'scroll', () => { this.hideBubble(); }, { passive: true });
    on(window, 'keydown', (e) => {
      if (document.querySelector('.scrim, .pop')) return;
      const typing = isEditable(document.activeElement);
      if (e.key === 'Escape' && !typing && (this.tool || this.chosen || this.bubbleEl)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (this.bubbleEl && !this.chosen) getSelection().removeAllRanges();
        if (this.tool) this.setTool(null);
        else this.choose(null);
        this.hideBubble();
        return;
      }
      // With nothing else to put down, Escape finishes marking up before it closes the file.
      if (e.key === 'Escape' && !typing && this.open) {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.hideBar();
        this.view.markBtn?.focus({ preventScroll: true });
        return;
      }
      if (typing) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && this.chosen) { e.preventDefault(); this.removeChosen(); return; }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && (this.open || this.history.length)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (e.shiftKey) this.redo(); else this.undo();
      }
    }, true);
    on(window, 'beforeunload', (e) => { if (this.saved && this.snapshot() !== this.saved) { this.save(); e.preventDefault(); } });
    on(document, 'selectionchange', () => { if (this.bubbleEl && !this.chosen && !this.range()) this.hideBubble(); });
  }

  destroy() {
    this.gone = true;
    this.hideBubble();
    this.offs.forEach((off) => off());
    this.view.onPage = null;
    // Anything not yet written goes now.
    if (this.lib && this.snapshot() !== this.saved) { this.flushing = true; this.save(); }
  }
}

// One set of tools per PDF opened in the file view.
// The lines whose words Mutt changed, page by page, for reading a marked-up PDF's words out
// (making it a document): the old words are still under each patch, so they are swapped for the new.
export async function changedLines(bytes) {
  const lib = await loadPdfLib();
  const doc = await lib.PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: true });
  const r = reader(lib, doc.context);
  return doc.getPages().map((page) => {
    const kept = r.get(page.node, 'MuttEdits');
    if (!kept) return [];
    try {
      return JSON.parse(r.text(kept)).map((e) => {
        const corners = editCorners(e);
        return { box: [Math.min(...corners.map((c) => c[0])), Math.min(...corners.map((c) => c[1])), Math.max(...corners.map((c) => c[0])), Math.max(...corners.map((c) => c[1]))], at: e.at, size: e.size, text: e.text, len: e.newLen || e.len };
      });
    } catch { return []; }
  });
}

// A page's words with each changed line's old words taken out and its new words put in their place.
export function withChangedLines(items, lines) {
  if (!lines?.length) return items;
  const out = [];
  const placed = new Set();
  for (const it of items) {
    const [x, y] = [it.transform[4], it.transform[5]];
    const line = lines.find((l) => x >= l.box[0] && x <= l.box[2] && y >= l.box[1] && y <= l.box[3]);
    if (!line) { out.push(it); continue; }
    if (placed.has(line)) continue;
    placed.add(line);
    if (line.text) out.push({ str: line.text, dir: 'ltr', transform: [line.size, 0, 0, line.size, line.at[0], line.at[1]], width: line.len, height: line.size, fontName: it.fontName, hasEOL: false });
  }
  return out;
}

export function markup(view) {
  const m = new Markup(view);
  m.ready.catch(() => {});   // said when the tools are first asked for (toggle, picked)
  return {
    toggle: () => m.toggle(),
    picked: () => m.picked(),
    destroy: () => m.destroy(),
  };
}
