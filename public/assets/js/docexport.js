// Taking a document away: as a PDF, a Word file, Markdown or plain text, or
// printed. Everything is made here in the browser from the document itself.
//
// PDF: laid out with pdf-lib (from cdnjs, loaded the first time) in the
// standard PDF faces (Times, Helvetica, Courier), so the text stays real,
// selectable text. Those faces only have Western letters; a document with
// others (Greek, Japanese, emoji…) goes to the print view instead, where the
// browser's own fonts can be saved as a PDF.
//
// Word: a .docx put together by hand (it's a zip of XML files): styles,
// lists, tables, pictures, links, page size and margins, header, footer and
// page numbers.

import { BLOCK_SCALE, MARGIN_PT, PAGE_SIZES, SCRIPT_PLACE, cleanCopy, listMark, readBlocks, toMarkdown, toPlain } from './docformat.js';

const PDF_LIB = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js';

let pdfLib;
function loadPdfLib() {
  pdfLib ||= new Promise((resolve, reject) => {
    if (window.PDFLib) { resolve(window.PDFLib); return; }
    const s = document.createElement('script');
    s.src = PDF_LIB;
    s.crossOrigin = 'anonymous';
    s.onload = () => (window.PDFLib ? resolve(window.PDFLib) : reject(new Error('The PDF maker didn’t load.')));
    s.onerror = () => { pdfLib = null; reject(new Error('The PDF maker couldn’t be fetched. Check your connection.')); };
    document.head.append(s);
  });
  return pdfLib;
}

export function fileNameOf(title) {
  return (title || 'Untitled document').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Document';
}

export function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// A poem without a heading of its own gets its name set above it.
function withPoemName(blocks, poem, title) {
  if (!poem || !title || /^(h\d|title)$/.test(blocks[0]?.type)) return blocks;
  return [{ type: 'h2', align: 'center', runs: [{ text: title }] }, ...blocks];
}

// The name is only written at the top when the page doesn't already open with it.
const startsWith = (body, title) => body.split('\n', 1)[0].replace(/^#+\s*/, '').replace(/[*_`]/g, '').trim().toLowerCase().startsWith(title.replace(/…$/, '').trim().toLowerCase());

export function exportMarkdown(flow, title) {
  const md = toMarkdown(cleanCopy(flow));
  saveBlob(new Blob([title && !startsWith(md, title) ? `# ${title}\n\n${md}\n` : `${md}\n`], { type: 'text/markdown;charset=utf-8' }), `${fileNameOf(title)}.md`);
}

export function exportText(flow, title) {
  const text = toPlain(cleanCopy(flow));
  saveBlob(new Blob([title && !startsWith(text, title) ? `${title}\n\n${text}\n` : `${text}\n`], { type: 'text/plain;charset=utf-8' }), `${fileNameOf(title)}.txt`);
}

// ------------------------------------------------------------ pictures

async function loadImage(src) {
  const res = await fetch(src, { credentials: 'same-origin' });
  if (!res.ok) throw new Error('picture');
  const blob = await res.blob();
  const bitmap = await createImageBitmap(blob);
  const out = { type: blob.type, width: bitmap.width, height: bitmap.height, bytes: null };
  if (blob.type === 'image/png' || blob.type === 'image/jpeg') {
    out.bytes = new Uint8Array(await blob.arrayBuffer());
  } else {
    // WebP and GIF: as a PNG, which both PDF and Word take.
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0);
    const png = await new Promise((r) => canvas.toBlob(r, 'image/png'));
    out.type = 'image/png';
    out.bytes = new Uint8Array(await png.arrayBuffer());
  }
  bitmap.close?.();
  return out;
}

// ------------------------------------------------------------ PDF

// The letters the standard PDF faces can draw (Windows-1252).
const WIN_EXTRA = new Set([0x20AC, 0x201A, 0x0192, 0x201E, 0x2026, 0x2020, 0x2021, 0x02C6, 0x2030, 0x0160, 0x2039, 0x0152, 0x017D,
  0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2013, 0x2014, 0x02DC, 0x2122, 0x0161, 0x203A, 0x0153, 0x017E, 0x0178]);
const drawable = (cp) => (cp >= 0x20 && cp <= 0x7E) || (cp >= 0xA0 && cp <= 0xFF) || WIN_EXTRA.has(cp);
const SWAPS = { '−': '-', '‐': '-', '‑': '-', '‒': '-', '―': '—', '′': "'", '″': '"', '­': '', '​': '', ' ': ' ', ' ': ' ', ' ': ' ', '\t': '    ' };

function safeText(text) {
  let out = '';
  let missing = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (drawable(cp)) { out += ch; continue; }
    if (ch in SWAPS) { out += SWAPS[ch]; continue; }
    const plain = ch.normalize('NFKD').replace(/[̀-ͯ]/g, '');
    if (plain && [...plain].every((c) => drawable(c.codePointAt(0)))) { out += plain; continue; }
    missing++;
    out += '?';
  }
  return { text: out, missing };
}

// Letters a PDF in the standard faces can't show.
export function pdfMissing(flow) {
  return safeText(cleanCopy(flow).textContent).missing;
}

const FACES = {
  serif: ['TimesRoman', 'TimesRomanBold', 'TimesRomanItalic', 'TimesRomanBoldItalic'],
  sans: ['Helvetica', 'HelveticaBold', 'HelveticaOblique', 'HelveticaBoldOblique'],
  mono: ['Courier', 'CourierBold', 'CourierOblique', 'CourierBoldOblique'],
  type: ['Courier', 'CourierBold', 'CourierOblique', 'CourierBoldOblique'],
};

export async function exportPdf(flow, { title, named, settings, author } = {}) {
  const lib = await loadPdfLib();
  const { PDFDocument, StandardFonts, rgb, PDFName, PDFString } = lib;
  const pdf = await PDFDocument.create();
  pdf.setTitle(title || 'Untitled document');
  if (author) pdf.setAuthor(author);
  pdf.setCreator('Mutt');
  pdf.setProducer('Mutt documents');

  const fonts = {};
  const faceOf = async (family, b, i) => {
    const name = FACES[family || 'serif'][(b ? 1 : 0) + (i ? 2 : 0)];
    fonts[name] ||= await pdf.embedFont(StandardFonts[name]);
    return fonts[name];
  };

  const [W, H] = PAGE_SIZES[settings.page] || PAGE_SIZES.a4;
  const M = MARGIN_PT[settings.margins] || 72;
  const CW = W - M * 2;
  const base = settings.size || 12;
  const spacing = settings.spacing || 1.15;
  const script = flow.classList.contains('is-script');
  const docFont = script ? 'type' : settings.font || 'serif';
  const ink = rgb(0.11, 0.1, 0.09);
  const grey = rgb(0.45, 0.44, 0.42);
  const copy = cleanCopy(flow);
  const poem = flow.classList.contains('is-poem');
  const blocks = withPoemName(readBlocks(copy, base), poem, named);

  let page = null;
  let y = 0;
  const pages = [];
  const newPage = () => {
    page = pdf.addPage([W, H]);
    pages.push(page);
    y = M;
  };
  newPage();
  const room = () => H - M - y;
  const ensure = (h) => { if (h > room() && y > M + 0.5) newPage(); };

  // A run, measured: pieces of words and spaces.
  const piecesOf = async (runs, blockSize, blockFont, extra = {}) => {
    const out = [];
    for (const r of runs) {
      if (r.br) { out.push({ br: true }); continue; }
      const size = (r.size || blockSize) * (r.sup || r.sub ? 0.7 : 1);
      const font = await faceOf(r.code ? 'mono' : r.font || blockFont, r.b || extra.b, r.i || extra.i);
      const { text } = safeText(r.text);
      for (const part of text.split(/( +)/)) {
        if (!part) continue;
        out.push({ text: part, space: /^ +$/.test(part), font, size, run: r, width: font.widthOfTextAtSize(part, size) });
      }
    }
    return out;
  };

  // Greedy line breaking; a word longer than a line is broken by letters.
  const linesOf = (pieces, width) => {
    const lines = [];
    let line = { items: [], width: 0, hard: false };
    const push = (hard) => {
      while (line.items.length && line.items[line.items.length - 1].space) line.width -= line.items.pop().width;
      line.hard = hard;
      lines.push(line);
      line = { items: [], width: 0, hard: false };
    };
    for (const p of pieces) {
      if (p.br) { push(true); continue; }
      if (p.space && !line.items.length) continue;
      if (line.width + p.width <= width || p.space) {
        line.items.push(p);
        line.width += p.width;
        continue;
      }
      if (line.items.length) push(false);
      if (p.width <= width) { line.items.push(p); line.width += p.width; continue; }
      let chunk = '';
      for (const ch of p.text) {
        const w = p.font.widthOfTextAtSize(chunk + ch, p.size);
        if (w > width && chunk) {
          line.items.push({ ...p, text: chunk, width: p.font.widthOfTextAtSize(chunk, p.size) });
          line.width += line.items[line.items.length - 1].width;
          push(false);
          chunk = '';
        }
        chunk += ch;
      }
      if (chunk) {
        const w = p.font.widthOfTextAtSize(chunk, p.size);
        line.items.push({ ...p, text: chunk, width: w });
        line.width += w;
      }
    }
    if (line.items.length || !lines.length) push(true);
    return lines;
  };

  const link = (x1, y1, x2, y2, url) => {
    const annot = pdf.context.obj({
      Type: 'Annot', Subtype: 'Link', Rect: [x1, y1, x2, y2], Border: [0, 0, 0],
      A: { Type: 'Action', S: 'URI', URI: PDFString.of(url) },
    });
    const ref = pdf.context.register(annot);
    const annots = page.node.lookup(PDFName.of('Annots'));
    if (annots) annots.push(ref);
    else page.node.set(PDFName.of('Annots'), pdf.context.obj([ref]));
  };

  const drawLine = (line, x0, width, align, isLast, color, lineH) => {
    const ascent = Math.max(...line.items.map((p) => p.size), base) * 0.8;
    const baseline = y + (lineH - Math.max(...line.items.map((p) => p.size), base)) / 2 + ascent;
    let x = x0;
    let gap = 0;
    if (align === 'center') x += (width - line.width) / 2;
    else if (align === 'right') x += width - line.width;
    else if (align === 'justify' && !isLast && !line.hard) {
      const spaces = line.items.filter((p) => p.space).length;
      if (spaces) gap = (width - line.width) / spaces;
    }
    for (const p of line.items) {
      const w = p.width + (p.space ? gap : 0);
      const r = p.run;
      const top = H - baseline;
      if (r.bg) page.drawRectangle({ x, y: top - p.size * 0.25, width: w, height: p.size * 1.15, color: rgb(...r.bg) });
      if (!p.space) {
        const shift = r.sup ? p.size * 0.5 : r.sub ? -p.size * 0.2 : 0;
        const c = r.color ? rgb(...r.color) : r.href ? rgb(0.13, 0.32, 0.72) : color;
        page.drawText(p.text, { x, y: top + shift, size: p.size, font: p.font, color: c });
      }
      if (r.u || r.href) page.drawLine({ start: { x, y: top - p.size * 0.12 }, end: { x: x + w, y: top - p.size * 0.12 }, thickness: Math.max(0.5, p.size / 18), color: r.color ? rgb(...r.color) : r.href ? rgb(0.13, 0.32, 0.72) : color });
      if (r.s) page.drawLine({ start: { x, y: top + p.size * 0.28 }, end: { x: x + w, y: top + p.size * 0.28 }, thickness: Math.max(0.5, p.size / 18), color: r.color ? rgb(...r.color) : color });
      if (r.href && !p.space) link(x, top - p.size * 0.25, x + w, top + p.size * 0.85, r.href);
      x += w;
    }
  };

  // A block of text: wrapped, split across pages where it has to be.
  const textBlock = async (runs, { size, font, b, i, align = 'left', indent = 0, right = 0, width = CW, before = 0, after = 0, lineFactor = spacing, color = ink, marker = null, bar = false, shade = false, keep = false }) => {
    const pieces = await piecesOf(runs.length ? runs : [{ text: '' }], size, font, { b, i });
    const lines = linesOf(pieces, width - indent - right);
    const lineHs = lines.map((l) => Math.max(size, ...l.items.map((p) => p.size)) * 1.2 * lineFactor);
    if (y > M + 0.5) y += before;
    ensure(keep ? lineHs.slice(0, 2).reduce((a, b2) => a + b2, 0) + size * 3 : lineHs[0]);
    for (let n = 0; n < lines.length; n++) {
      if (lineHs[n] > room() && y > M + 0.5) newPage();
      const x0 = M + indent + (CW - width);
      if (shade) page.drawRectangle({ x: M - 4, y: H - y - lineHs[n], width: CW + 8, height: lineHs[n], color: rgb(0.95, 0.94, 0.92) });
      if (bar) page.drawRectangle({ x: M + indent - 14, y: H - y - lineHs[n], width: 2.2, height: lineHs[n], color: rgb(0.78, 0.76, 0.72) });
      if (n === 0 && marker) await marker(x0, y, lineHs[0]);
      drawLine(lines[n], x0, width - indent - right, align, n === lines.length - 1, color, lineHs[n]);
      y += lineHs[n];
    }
    y += after;
  };

  // A poem sits as one block in the middle of the page, its lines as written.
  let poemIndent = 0;
  if (poem) {
    let longest = 0;
    for (const bl of blocks) {
      if (bl.type !== 'p' && bl.type !== 'quote') continue;
      const pieces = await piecesOf(bl.runs, base, docFont);
      let w = 0;
      for (const p of pieces) { if (p.br) { longest = Math.max(longest, w); w = 0; } else w += p.width; }
      longest = Math.max(longest, w);
    }
    poemIndent = Math.max(0, Math.min(CW * 0.4, (CW - longest) / 2));
  }

  for (let bi = 0; bi < blocks.length; bi++) {
    const bl = blocks[bi];
    const scale = BLOCK_SCALE[bl.type] || 1;
    const size = base * scale;
    if (bl.type === 'pb') { newPage(); continue; }
    if (bl.type === 'hr') {
      ensure(base * 1.6);
      y += base * 0.8;
      page.drawLine({ start: { x: M, y: H - y }, end: { x: W - M, y: H - y }, thickness: 0.6, color: rgb(0.75, 0.73, 0.7) });
      y += base * 0.8;
      continue;
    }
    if (bl.type === 'img') {
      let img;
      try { img = await loadImage(bl.src); } catch { continue; }
      const embedded = img.type === 'image/png' ? await pdf.embedPng(img.bytes) : await pdf.embedJpg(img.bytes);
      let w = Math.min(CW, bl.width ? CW * bl.width / 100 : img.width * 0.75);
      let h = w * img.height / img.width;
      const maxH = H - M * 2;
      if (h > maxH) { h = maxH; w = h * img.width / img.height; }
      y += base * 0.4;
      ensure(h);
      page.drawImage(embedded, { x: M + (CW - w) / 2, y: H - y - h, width: w, height: h });
      y += h + base * 0.6;
      continue;
    }
    if (bl.type === 'table') {
      const cols = Math.max(...bl.rows.map((r) => r.length));
      const cw = CW / cols;
      const pad = 5;
      y += base * 0.4;
      for (const row of bl.rows) {
        const cells = [];
        for (let c = 0; c < cols; c++) {
          const cell = row[c] || { runs: [] };
          const pieces = await piecesOf(cell.runs, base * 0.95, docFont, { b: cell.head });
          cells.push(linesOf(pieces, cw - pad * 2));
        }
        const lh = base * 0.95 * 1.2 * spacing;
        const rowH = Math.max(...cells.map((l) => l.length)) * lh + pad * 2;
        ensure(rowH);
        const top = y;
        for (let c = 0; c < cols; c++) {
          page.drawRectangle({ x: M + c * cw, y: H - top - rowH, width: cw, height: rowH, borderColor: rgb(0.72, 0.7, 0.66), borderWidth: 0.6, color: row[c]?.head ? rgb(0.95, 0.94, 0.92) : undefined });
          y = top + pad;
          cells[c].forEach((line, n) => { drawLine(line, M + c * cw + pad, cw - pad * 2, 'left', n === cells[c].length - 1, ink, lh); y += lh; });
        }
        y = top + rowH;
      }
      y += base * 0.6;
      continue;
    }
    if (bl.type === 'li') {
      const indent = 22 * (bl.list.level + 1);
      const markerAt = async (x0, top, lh) => {
        const mx = x0 - 15;
        const mid = H - top - lh / 2;
        if (bl.list.kind === 'check') {
          page.drawRectangle({ x: mx - 1, y: mid - base * 0.36, width: base * 0.72, height: base * 0.72, borderColor: rgb(0.35, 0.34, 0.32), borderWidth: 0.8 });
          if (bl.list.done) {
            page.drawLine({ start: { x: mx + base * 0.08, y: mid }, end: { x: mx + base * 0.28, y: mid - base * 0.2 }, thickness: 1.1, color: ink });
            page.drawLine({ start: { x: mx + base * 0.28, y: mid - base * 0.2 }, end: { x: mx + base * 0.66, y: mid + base * 0.28 }, thickness: 1.1, color: ink });
          }
        } else {
          const font = await faceOf(docFont, false, false);
          const counted = ['ol', 'alpha', 'roman'].includes(bl.list.kind);
          const mark = counted ? listMark(bl.list.kind, bl.list.index) : bl.list.kind === 'dash' ? '–' : ['•', '–', '·'][bl.list.level % 3];
          const w = font.widthOfTextAtSize(mark, base);
          page.drawText(mark, { x: counted ? x0 - 5 - w : mx, y: H - top - (lh - base) / 2 - base * 0.8, size: base, font, color: ink });
        }
      };
      const done = bl.list.kind === 'check' && bl.list.done;
      await textBlock(done ? bl.runs.map((r) => ({ ...r, s: true, color: [0.5, 0.49, 0.47] })) : bl.runs,
        { size, font: docFont, align: bl.align, indent, after: base * 0.25, marker: markerAt });
      continue;
    }
    if (bl.type === 'code') {
      await textBlock(bl.runs, { size, font: 'mono', after: base * 0.6, before: base * 0.3, lineFactor: 1.1, shade: true });
      continue;
    }
    // A script's parts sit where a screenplay puts them, single spaced.
    if (script && bl.script) {
      const at = SCRIPT_PLACE[bl.script];
      await textBlock(bl.runs, { size: base, font: docFont, b: bl.script === 'scene', align: at.align || bl.align, indent: CW * at.left, right: CW * at.right,
        before: at.above * base * 1.2, after: 0, lineFactor: 1, keep: bl.script === 'scene' || bl.script === 'char' });
      continue;
    }
    // A journal's entries open under their date, small and spaced out.
    if (bl.entry) {
      await textBlock(bl.runs.map((r) => ({ ...r, text: r.text.toUpperCase() })), { size: base * 0.85, font: docFont, b: true, align: bl.align,
        before: base * 1.8, after: base * 0.6, lineFactor: 1.1, color: grey, keep: true });
      continue;
    }
    const heading = /^(h\d|title|subtitle)$/.test(bl.type);
    const align = poem && heading && bl.align === 'left' ? 'center' : bl.align;
    const indent = poem && !heading ? poemIndent : bl.indent || 0;
    const next = blocks[bi + 1];
    await textBlock(bl.runs, {
      size,
      font: docFont,
      b: /^(h[1-3]|title)$/.test(bl.type),
      i: bl.type === 'quote' || bl.type === 'subtitle',
      align,
      indent: bl.type === 'quote' ? indent + 18 : indent,
      before: heading ? size * 0.7 : 0,
      after: heading ? size * 0.35 : poem ? base * 1.1 : base * 0.6,
      lineFactor: heading ? 1.05 : bl.spacing || (poem ? Math.max(spacing, 1.35) : spacing),
      color: bl.type === 'subtitle' ? grey : ink,
      bar: bl.type === 'quote',
      keep: heading && next && next.type !== 'pb',
    });
  }

  // Header, footer and page numbers on every page.
  const small = await faceOf(docFont, false, false);
  const sz = Math.max(8, base * 0.75);
  const header = safeText(settings.header || '').text;
  const footer = safeText(settings.footer || '').text;
  pages.forEach((p, n) => {
    if (header) p.drawText(header, { x: (W - small.widthOfTextAtSize(header, sz)) / 2, y: H - M / 2 - sz / 2, size: sz, font: small, color: grey });
    const num = settings.numbers !== 'off' ? String(n + 1) : '';
    const fy = M / 2 - sz / 2;
    if (num) {
      const w = small.widthOfTextAtSize(num, sz);
      p.drawText(num, { x: settings.numbers === 'right' ? W - M - w : (W - w) / 2, y: fy, size: sz, font: small, color: grey });
    }
    if (footer) {
      const w = small.widthOfTextAtSize(footer, sz);
      const x = num && settings.numbers === 'center' ? M : num ? M : (W - w) / 2;
      p.drawText(footer, { x, y: fy, size: sz, font: small, color: grey });
    }
  });

  const bytes = await pdf.save();
  saveBlob(new Blob([bytes], { type: 'application/pdf' }), `${fileNameOf(title)}.pdf`);
}

// ------------------------------------------------------------ Word (.docx)

const xml = (s) => String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const hex = (c) => c.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
const WORD_FONTS = { serif: 'Georgia', sans: 'Arial', mono: 'Courier New', type: 'Courier New' };
const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

export async function exportDocx(flow, { title, named, settings, author } = {}) {
  const base = settings.size || 12;
  const spacing = settings.spacing || 1.15;
  const script = flow.classList.contains('is-script');
  const docFont = WORD_FONTS[script ? 'type' : settings.font] || 'Georgia';
  const [Wpt, Hpt] = PAGE_SIZES[settings.page] || PAGE_SIZES.a4;
  const M = MARGIN_PT[settings.margins] || 72;
  const contentEmu = (Wpt - M * 2) * 12700;
  const poem = flow.classList.contains('is-poem');
  const blocks = withPoemName(readBlocks(cleanCopy(flow), base), poem, named);

  const rels = [];
  const media = [];
  const rel = (type, target, external = false) => {
    const id = `rId${rels.length + 10}`;
    rels.push(`<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${xml(target)}"${external ? ' TargetMode="External"' : ''}/>`);
    return id;
  };

  const runXml = (r, extra = {}) => {
    if (r.br) return '<w:r><w:br/></w:r>';
    const pr = [];
    if (r.code || r.font) pr.push(`<w:rFonts w:ascii="${WORD_FONTS[r.code ? 'mono' : r.font]}" w:hAnsi="${WORD_FONTS[r.code ? 'mono' : r.font]}" w:cs="${WORD_FONTS[r.code ? 'mono' : r.font]}"/>`);
    if (r.b || extra.b) pr.push('<w:b/>');
    if (r.i || extra.i) pr.push('<w:i/>');
    if (r.s || extra.s) pr.push('<w:strike/>');
    if (r.color || extra.color) pr.push(`<w:color w:val="${hex(r.color || extra.color)}"/>`);
    else if (r.href) pr.push('<w:color w:val="2252B8"/>');
    if (r.size) pr.push(`<w:sz w:val="${Math.round(r.size * 2)}"/>`);
    if (r.u || r.href) pr.push('<w:u w:val="single"/>');
    if (r.bg) pr.push(`<w:shd w:val="clear" w:color="auto" w:fill="${hex(r.bg)}"/>`);
    if (r.sup) pr.push('<w:vertAlign w:val="superscript"/>');
    if (r.sub) pr.push('<w:vertAlign w:val="subscript"/>');
    const parts = r.text.split('\t').map((t) => `<w:t xml:space="preserve">${xml(t)}</w:t>`).join('<w:tab/>');
    return `<w:r>${pr.length ? `<w:rPr>${pr.join('')}</w:rPr>` : ''}${parts}</w:r>`;
  };
  const runsXml = (runs, extra) => {
    let out = '';
    for (let n = 0; n < runs.length; n++) {
      const r = runs[n];
      if (r.href && !r.br) {
        let text = [r];
        while (runs[n + 1]?.href === r.href) text.push(runs[++n]);
        out += `<w:hyperlink r:id="${rel('hyperlink', r.href, true)}">${text.map((t) => runXml(t, extra)).join('')}</w:hyperlink>`;
      } else out += runXml(r, extra);
    }
    return out;
  };
  const jc = (align) => (align && align !== 'left' ? `<w:jc w:val="${align === 'justify' ? 'both' : align}"/>` : '');

  const nums = [];
  let lastGroup = null;
  const body = [];
  const STYLE = { title: 'Title', subtitle: 'Subtitle', h1: 'Heading1', h2: 'Heading2', h3: 'Heading3', h4: 'Heading4', quote: 'Quote', code: 'Code' };

  for (const bl of blocks) {
    if (bl.type !== 'li') lastGroup = null;
    if (bl.type === 'pb') { body.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>'); continue; }
    if (bl.type === 'hr') { body.push('<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="BFBAB2"/></w:pBdr></w:pPr></w:p>'); continue; }
    if (bl.type === 'img') {
      let img;
      try { img = await loadImage(bl.src); } catch { continue; }
      const n = media.length + 1;
      const ext = img.type === 'image/png' ? 'png' : 'jpeg';
      media.push({ name: `word/media/image${n}.${ext}`, bytes: img.bytes });
      const id = rel('image', `media/image${n}.${ext}`);
      let cx = Math.min(contentEmu, bl.width ? contentEmu * bl.width / 100 : img.width * 9525);
      let cy = cx * img.height / img.width;
      const maxCy = (Hpt - M * 2) * 12700;
      if (cy > maxCy) { cy = maxCy; cx = cy * img.width / img.height; }
      cx = Math.round(cx); cy = Math.round(cy);
      body.push(`<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${n}" name="Picture ${n}" descr="${xml(bl.alt)}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${n}" name="image${n}.${ext}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`);
      continue;
    }
    if (bl.type === 'table') {
      const cols = Math.max(...bl.rows.map((r) => r.length));
      const tw = Math.round((Wpt - M * 2) * 20);
      const grid = Array.from({ length: cols }, () => `<w:gridCol w:w="${Math.round(tw / cols)}"/>`).join('');
      const rows = bl.rows.map((row) => `<w:tr>${Array.from({ length: cols }, (_, c) => {
        const cell = row[c] || { runs: [] };
        return `<w:tc><w:tcPr><w:tcW w:w="${Math.round(tw / cols)}" w:type="dxa"/>${cell.head ? '<w:shd w:val="clear" w:color="auto" w:fill="F2F0EB"/>' : ''}</w:tcPr><w:p><w:pPr><w:spacing w:after="0"/></w:pPr>${runsXml(cell.runs, { b: cell.head })}</w:p></w:tc>`;
      }).join('')}</w:tr>`).join('');
      body.push(`<w:tbl><w:tblPr><w:tblW w:w="${tw}" w:type="dxa"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="BFBAB2"/>`).join('')}</w:tblBorders><w:tblCellMar><w:left w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${rows}</w:tbl>`);
      body.push('<w:p/>');
      continue;
    }
    if (bl.type === 'li') {
      const { kind, level, done, group } = bl.list;
      if (kind === 'check') {
        body.push(`<w:p><w:pPr><w:spacing w:after="60"/><w:ind w:left="${360 + level * 360}" w:hanging="360"/>${jc(bl.align)}</w:pPr>${runXml({ text: done ? '☒\t' : '☐\t' })}${runsXml(bl.runs, done ? { s: true, color: [0.5, 0.49, 0.47] } : {})}</w:p>`);
        continue;
      }
      let numId = kind === 'dash' ? 2 : 1;
      if (kind === 'ol' || kind === 'alpha' || kind === 'roman') {
        if (lastGroup !== group || !nums.length) nums.push({ id: nums.length + 3, abs: { ol: 1, alpha: 2, roman: 3 }[kind] });
        numId = nums[nums.length - 1].id;
      }
      lastGroup = group;
      body.push(`<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="${Math.min(level, 8)}"/><w:numId w:val="${numId}"/></w:numPr>${jc(bl.align)}</w:pPr>${runsXml(bl.runs)}</w:p>`);
      continue;
    }
    if (script && bl.script) {
      const at = SCRIPT_PLACE[bl.script];
      const tw = (Wpt - M * 2) * 20;
      body.push(`<w:p><w:pPr><w:spacing w:before="${Math.round(at.above * base * 20)}" w:after="0" w:line="240" w:lineRule="auto"/><w:ind w:left="${Math.round(tw * at.left)}" w:right="${Math.round(tw * at.right)}"/>${jc(at.align || bl.align)}${bl.script === 'scene' || bl.script === 'char' ? '<w:keepNext/>' : ''}</w:pPr>${runsXml(bl.runs, bl.script === 'scene' ? { b: true } : undefined)}</w:p>`);
      continue;
    }
    if (bl.entry) {
      body.push(`<w:p><w:pPr><w:keepNext/><w:spacing w:before="${Math.round(base * 34)}" w:after="${Math.round(base * 10)}"/>${jc(bl.align)}</w:pPr>${runsXml(bl.runs.map((r) => ({ ...r, text: r.text.toUpperCase() })), { b: true, color: [0.45, 0.44, 0.42] })}</w:p>`);
      continue;
    }
    const heading = /^(h\d|title|subtitle)$/.test(bl.type);
    const style = STYLE[bl.type];
    const align = poem && heading && bl.align === 'left' ? 'center' : bl.align;
    const pr = [];
    if (style) pr.push(`<w:pStyle w:val="${style}"/>`);
    if (bl.spacing) pr.push(`<w:spacing w:line="${Math.round(bl.spacing * 240)}" w:lineRule="auto"/>`);
    else if (poem && !heading) pr.push(`<w:spacing w:after="${Math.round(base * 22)}" w:line="${Math.round(Math.max(spacing, 1.35) * 240)}" w:lineRule="auto"/>`);
    if (bl.indent) pr.push(`<w:ind w:left="${Math.round(bl.indent * 20)}"/>`);
    else if (poem && !heading) pr.push(`<w:ind w:left="${Math.round((Wpt - M * 2) * 20 * 0.22)}"/>`);
    pr.push(jc(align));
    body.push(`<w:p>${pr.join('') ? `<w:pPr>${pr.join('')}</w:pPr>` : ''}${runsXml(bl.runs)}</w:p>`);
  }

  // Header and footer, with the page number.
  const header = settings.header ? `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ${W_NS}><w:p><w:pPr><w:pStyle w:val="Header"/><w:jc w:val="center"/></w:pPr>${runXml({ text: settings.header })}</w:p></w:hdr>` : null;
  const numberRun = '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>';
  const showNum = settings.numbers && settings.numbers !== 'off';
  const footerParts = [];
  if (settings.footer) footerParts.push(`<w:p><w:pPr><w:pStyle w:val="Footer"/>${showNum ? '' : '<w:jc w:val="center"/>'}</w:pPr>${runXml({ text: settings.footer })}</w:p>`);
  if (showNum) footerParts.push(`<w:p><w:pPr><w:pStyle w:val="Footer"/><w:jc w:val="${settings.numbers === 'right' ? 'right' : 'center'}"/></w:pPr>${numberRun}</w:p>`);
  const footer = footerParts.length ? `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${W_NS}>${footerParts.join('')}</w:ftr>` : null;
  const refs = [];
  if (header) refs.push(`<w:headerReference w:type="default" r:id="${rel('header', 'header1.xml')}"/>`);
  if (footer) refs.push(`<w:footerReference w:type="default" r:id="${rel('footer', 'footer1.xml')}"/>`);
  const tw = (pt) => Math.round(pt * 20);
  const sect = `<w:sectPr>${refs.join('')}<w:pgSz w:w="${tw(Wpt)}" w:h="${tw(Hpt)}"/><w:pgMar w:top="${tw(M)}" w:right="${tw(M)}" w:bottom="${tw(M)}" w:left="${tw(M)}" w:header="${tw(M / 2)}" w:footer="${tw(M / 2)}" w:gutter="0"/></w:sectPr>`;

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W_NS}><w:body>${body.join('')}${sect}</w:body></w:document>`;

  const hs = (pt) => Math.round(pt * 2);
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W_NS}>
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${docFont}" w:hAnsi="${docFont}" w:cs="${docFont}" w:eastAsia="${docFont}"/><w:color w:val="1C1A17"/><w:sz w:val="${hs(base)}"/><w:szCs w:val="${hs(base)}"/><w:lang w:val="en-GB"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="${Math.round(base * 12)}" w:line="${Math.round(spacing * 240)}" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="${hs(base * 6)}" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:b/><w:sz w:val="${hs(base * 2.4)}"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:rPr><w:i/><w:color w:val="6F6B64"/><w:sz w:val="${hs(base * 1.35)}"/></w:rPr></w:style>
${[1, 2, 3, 4].map((n) => `<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="${hs(base * [1.8, 1.4, 1.17, 1][n - 1] * 7)}" w:after="${hs(base * 3)}"/><w:outlineLvl w:val="${n - 1}"/></w:pPr><w:rPr>${n < 4 ? '<w:b/>' : '<w:b/><w:i/>'}<w:sz w:val="${hs(base * [1.8, 1.4, 1.17, 1][n - 1])}"/></w:rPr></w:style>`).join('\n')}
<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:pBdr><w:left w:val="single" w:sz="12" w:space="10" w:color="C7C2BA"/></w:pBdr><w:ind w:left="360"/></w:pPr><w:rPr><w:i/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="F2F0EB"/><w:spacing w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/><w:sz w:val="${hs(base * 0.9)}"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="60"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Header"><w:name w:val="header"/><w:basedOn w:val="Normal"/><w:rPr><w:color w:val="77736C"/><w:sz w:val="${hs(Math.max(8, base * 0.75))}"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Footer"><w:name w:val="footer"/><w:basedOn w:val="Normal"/><w:rPr><w:color w:val="77736C"/><w:sz w:val="${hs(Math.max(8, base * 0.75))}"/></w:rPr></w:style>
</w:styles>`;

  const level = (n, fmt, text) => `<w:lvl w:ilvl="${n}"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${text}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${720 + n * 360}" w:hanging="360"/></w:pPr>${fmt === 'bullet' ? '<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr>' : ''}</w:lvl>`;
  const bullets = Array.from({ length: 9 }, (_, n) => level(n, 'bullet', ['•', '–', '▪'][n % 3])).join('');
  const counted = (fmts) => Array.from({ length: 9 }, (_, n) => level(n, fmts[n % 3], `%${n + 1}.`)).join('');
  const dashes = Array.from({ length: 9 }, (_, n) => level(n, 'bullet', ['–', '•', '▪'][n % 3])).join('');
  const abstract = (id, lvls) => `<w:abstractNum w:abstractNumId="${id}"><w:multiLevelType w:val="hybridMultilevel"/>${lvls}</w:abstractNum>`;
  const numberingXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering ${W_NS}>${abstract(0, bullets)}${abstract(1, counted(['decimal', 'lowerLetter', 'lowerRoman']))}${abstract(2, counted(['lowerLetter', 'lowerRoman', 'decimal']))}${abstract(3, counted(['lowerRoman', 'decimal', 'lowerLetter']))}${abstract(4, dashes)}<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="4"/></w:num>${nums.map((n) => `<w:num w:numId="${n.id}"><w:abstractNumId w:val="${n.abs}"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>`).join('')}</w:numbering>`;

  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>${rels.join('')}</Relationships>`;
  const settingsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings ${W_NS}><w:defaultTabStop w:val="720"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`;
  const stamp = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(title || 'Untitled document')}</dc:title>${author ? `<dc:creator>${xml(author)}</dc:creator>` : ''}<dcterms:created xsi:type="dcterms:W3CDTF">${stamp}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${stamp}</dcterms:modified></cp:coreProperties>`;
  const types = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>${header ? '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>' : ''}${footer ? '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' : ''}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;
  const rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>';

  const files = [
    ['[Content_Types].xml', types],
    ['_rels/.rels', rootRels],
    ['docProps/core.xml', core],
    ['word/document.xml', documentXml],
    ['word/styles.xml', stylesXml],
    ['word/numbering.xml', numberingXml],
    ['word/settings.xml', settingsXml],
    ['word/_rels/document.xml.rels', docRels],
    ...(header ? [['word/header1.xml', header]] : []),
    ...(footer ? [['word/footer1.xml', footer]] : []),
    ...media.map((m) => [m.name, m.bytes]),
  ];
  saveBlob(new Blob([zip(files)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), `${fileNameOf(title)}.docx`);
}

// ------------------------------------------------------------ a plain zip (stored, not squeezed)

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

export function zip(files) {
  const enc = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  const d = new Date();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  for (const [name, content] of files) {
    const data = typeof content === 'string' ? enc.encode(content) : content;
    const nameBytes = enc.encode(name);
    const crc = crc32(data);
    const head = new DataView(new ArrayBuffer(30));
    head.setUint32(0, 0x04034b50, true);
    head.setUint16(4, 20, true);
    head.setUint16(6, 0x0800, true);
    head.setUint16(8, 0, true);
    head.setUint16(10, time, true);
    head.setUint16(12, date, true);
    head.setUint32(14, crc, true);
    head.setUint32(18, data.length, true);
    head.setUint32(22, data.length, true);
    head.setUint16(26, nameBytes.length, true);
    head.setUint16(28, 0, true);
    chunks.push(new Uint8Array(head.buffer), nameBytes, data);
    const dir = new DataView(new ArrayBuffer(46));
    dir.setUint32(0, 0x02014b50, true);
    dir.setUint16(4, 20, true);
    dir.setUint16(6, 20, true);
    dir.setUint16(8, 0x0800, true);
    dir.setUint16(10, 0, true);
    dir.setUint16(12, time, true);
    dir.setUint16(14, date, true);
    dir.setUint32(16, crc, true);
    dir.setUint32(20, data.length, true);
    dir.setUint32(24, data.length, true);
    dir.setUint16(28, nameBytes.length, true);
    dir.setUint32(42, offset, true);
    central.push(new Uint8Array(dir.buffer), nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const size = central.reduce((a, c) => a + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, size, true);
  end.setUint32(16, offset, true);
  return new Blob([...chunks, ...central, new Uint8Array(end.buffer)]);
}

// ------------------------------------------------------------ print

// The browser's own print view (and its "Save as PDF"), with the page set up as in the document.
export function printDoc(flow, { title, settings }) {
  const copy = cleanCopy(flow);
  const [W, H] = PAGE_SIZES[settings.page] || PAGE_SIZES.a4;
  const M = MARGIN_PT[settings.margins] || 72;
  const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ');
  const style = document.createElement('style');
  const num = settings.numbers === 'off' ? '' : `@bottom-${settings.numbers === 'right' ? 'right' : 'center'} { content: counter(page); font: 9pt var(--de-face); color: #77736c; }`;
  style.textContent = `@page { size: ${W}pt ${H}pt; margin: ${M}pt; ${settings.header ? `@top-center { content: "${esc(settings.header)}"; font: 9pt var(--de-face); color: #77736c; }` : ''} ${num} ${settings.footer ? `@bottom-left { content: "${esc(settings.footer)}"; font: 9pt var(--de-face); color: #77736c; }` : ''} }`;
  const holder = document.createElement('div');
  holder.className = `de-print ${flow.className.replace(/\bde-flow\b/, '')}`;
  holder.dataset.font = flow.dataset.font || 'serif';
  if (flow.dataset.name) holder.dataset.name = flow.dataset.name;
  holder.style.cssText = flow.style.cssText;
  holder.style.removeProperty('min-height');
  holder.append(...copy.childNodes);
  document.body.append(style, holder);
  document.documentElement.classList.add('is-printing-doc');
  const prevTitle = document.title;
  document.title = title || 'Document';
  const done = () => {
    holder.remove();
    style.remove();
    document.title = prevTitle;
    document.documentElement.classList.remove('is-printing-doc');
    removeEventListener('afterprint', done);
  };
  addEventListener('afterprint', done);
  setTimeout(() => { window.print(); setTimeout(done, 1000); }, 60);
}
