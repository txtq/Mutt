// Turning a PDF into reading format: its words, without the printed page.
// pdf.js reads each page's text with where it sits and how big it is; from
// that we drop running heads and page numbers, mend words split across
// lines, rebuild paragraphs and headings, and split it into chapters (by the
// PDF's own outline when it has one). Runs in the browser; the result is
// saved on the server as JSON for every reader of the book.

import { loadPdfjs } from './pdfjs.js';

const TERMINAL = /[.!?…:;"”’»)\]]$/;
const PAGE_NUMBER = /^\s*(?:page\s*)?[\divxlc]{1,6}(?:\s*(?:of|\/)\s*\d+)?\s*$/i;
const CHAPTER_WORD = /^(?:chapter|part|book|prologue|epilogue|introduction|preface|foreword|afterword|appendix|contents)\b/i;

const median = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

// Text items on one page -> lines, top to bottom.
function linesOf(items, pageIndex, height) {
  const parts = items
    .filter((it) => it.str && it.str.trim() !== '' || it.hasEOL)
    .map((it) => {
      const [a, b, c, d, e, f] = it.transform;
      const size = Math.hypot(c, d) || Math.hypot(a, b) || it.height || 10;
      return { str: it.str, x: e, y: f, w: it.width, size, font: it.fontName };
    })
    .filter((p) => p.str.trim());
  parts.sort((p, q) => (Math.abs(q.y - p.y) > Math.min(p.size, q.size) * 0.45 ? q.y - p.y : p.x - q.x));
  const lines = [];
  for (const p of parts) {
    const line = lines[lines.length - 1];
    if (line && Math.abs(line.y - p.y) <= Math.min(line.size, p.size) * 0.5) {
      const gap = p.x - line.right;
      const space = gap > p.size * 0.12 && !/\s$/.test(line.text) && !/^\s/.test(p.str);
      line.text += (space ? ' ' : '') + p.str;
      line.right = Math.max(line.right, p.x + p.w);
      line.chars.push([p.size, p.str.length]);
    } else {
      lines.push({ page: pageIndex, y: p.y, x: p.x, right: p.x + p.w, text: p.str, size: p.size, chars: [[p.size, p.str.length]], height });
    }
  }
  for (const line of lines) {
    // The line's size is what most of its letters are set in.
    const tally = new Map();
    for (const [s, n] of line.chars) tally.set(Math.round(s * 2) / 2, (tally.get(Math.round(s * 2) / 2) || 0) + n);
    line.size = [...tally].sort((a, b) => b[1] - a[1])[0][0];
    line.text = line.text.replace(/\s+/g, ' ').trim();
    delete line.chars;
  }
  return lines.filter((l) => l.text);
}

// Running heads, feet and page numbers: short lines near a page's top or
// bottom that repeat across pages (numbers aside).
function dropFurniture(pages) {
  const seen = new Map();
  const key = (l) => l.text.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ');
  const edge = (l) => l.y > l.height * 0.9 || l.y < l.height * 0.1;
  for (const lines of pages) {
    const keys = new Set(lines.filter(edge).map(key));
    for (const k of keys) seen.set(k, (seen.get(k) || 0) + 1);
  }
  const often = Math.max(3, pages.length * 0.2);
  return pages.map((lines) => lines.filter((l) => {
    if (!edge(l)) return true;
    if (PAGE_NUMBER.test(l.text)) return false;
    return !((seen.get(key(l)) || 0) >= often && l.text.length < 120);
  }));
}

function join(a, b) {
  if (/[A-Za-zÀ-ÿ]-$/.test(a) && /^[a-zà-ÿ]/.test(b)) return a.slice(0, -1) + b;
  return `${a} ${b}`;
}

// Lines -> headings and paragraphs, in reading order.
function assemble(pages) {
  const body = [];
  for (const lines of pages) for (const l of lines) body.push(l);
  if (!body.length) return { blocks: [], bodySize: 0 };
  const tally = new Map();
  for (const l of body) tally.set(l.size, (tally.get(l.size) || 0) + l.text.length);
  const bodySize = [...tally].sort((a, b) => b[1] - a[1])[0][0];

  const gaps = [];
  const lefts = [];
  const rights = [];
  for (const lines of pages) {
    for (let i = 1; i < lines.length; i++) {
      const a = lines[i - 1];
      const b = lines[i];
      if (Math.abs(a.size - bodySize) < 0.6 && Math.abs(b.size - bodySize) < 0.6) gaps.push(a.y - b.y);
    }
    for (const l of lines) if (Math.abs(l.size - bodySize) < 0.6) { lefts.push(l.x); rights.push(l.right); }
  }
  const lineGap = median(gaps.filter((g) => g > 0)) || bodySize * 1.3;
  const left = median(lefts);
  const right = median(rights.filter((r) => r > left + bodySize * 10)) || Math.max(...rights);

  const blocks = [];
  let para = null;
  let last = null;
  const flush = () => { if (para) blocks.push(para); para = null; };
  for (const l of body) {
    const big = l.size >= bodySize * 1.18 && l.text.length <= 140;
    const named = CHAPTER_WORD.test(l.text) && l.text.length <= 60 && (l.size >= bodySize * 1.05 || l.text === l.text.toUpperCase());
    if (big || named) {
      flush();
      const level = l.size >= bodySize * 1.55 || (named && !big) ? 1 : 2;
      const prev = blocks[blocks.length - 1];
      // A heading set over two lines is one heading.
      if (prev && prev.t === `h${level}` && last && last.page === l.page && Math.abs(last.size - l.size) < 0.6 && last.y - l.y < l.size * 2) {
        prev.x = `${prev.x} ${l.text}`;
      } else {
        blocks.push({ t: `h${level}`, x: l.text, page: l.page });
      }
      last = l;
      continue;
    }
    let fresh = !para;
    if (para && last) {
      const samePage = last.page === l.page;
      const gap = samePage ? last.y - l.y : 0;
      const indent = l.x > left + bodySize * 0.9 && l.x < left + bodySize * 6;
      const shortBefore = last.right < right - bodySize * 3 && TERMINAL.test(last.text);
      if (samePage && (gap > lineGap * 1.45 || gap < -lineGap)) fresh = true;
      else if (indent && TERMINAL.test(para.x)) fresh = true;
      else if (shortBefore) fresh = true;
      else if (!samePage && (TERMINAL.test(para.x) && indent)) fresh = true;
      if (Math.abs(l.size - last.size) > 1.2 && Math.abs(last.size - bodySize) < 0.6 !== Math.abs(l.size - bodySize) < 0.6) fresh = true;
    }
    if (fresh) {
      flush();
      para = { t: Math.abs(l.size - bodySize) < 0.6 || l.size > bodySize ? 'p' : 'small', x: l.text, page: l.page };
    } else {
      para.x = join(para.x, l.text);
    }
    last = l;
  }
  flush();
  return { blocks, bodySize };
}

export async function outlineOf(doc) {
  try {
    const outline = await doc.getOutline();
    if (!outline || outline.length < 2) return null;
    const out = [];
    for (const item of outline.slice(0, 400)) {
      let dest = item.dest;
      if (typeof dest === 'string') dest = await doc.getDestination(dest);
      if (!Array.isArray(dest) || !dest[0]) continue;
      const page = typeof dest[0] === 'number' ? dest[0] : await doc.getPageIndex(dest[0]);
      if (item.title?.trim()) out.push({ title: item.title.trim().slice(0, 200), page });
    }
    out.sort((a, b) => a.page - b.page);
    return out.length >= 2 ? out : null;
  } catch {
    return null;
  }
}

function chapters(blocks, outline, pageCount) {
  const out = [];
  const strip = (b) => ({ t: b.t, x: b.x });
  if (outline) {
    let at = 0;
    const firstPage = outline[0].page;
    const before = blocks.filter((b) => b.page < firstPage);
    if (before.some((b) => b.t === 'p')) out.push({ title: 'Opening', blocks: before.map(strip) });
    at = before.length;
    outline.forEach((o, i) => {
      const end = i + 1 < outline.length ? outline[i + 1].page : Infinity;
      const mine = [];
      while (at < blocks.length && blocks[at].page < end) mine.push(blocks[at++]);
      if (mine.length) out.push({ title: o.title, blocks: mine.map(strip) });
    });
    return out;
  }
  const heads = blocks.filter((b) => b.t === 'h1');
  if (heads.length >= 2) {
    let cur = { title: 'Opening', blocks: [] };
    for (const b of blocks) {
      if (b.t === 'h1') {
        if (cur.blocks.some((x) => x.t === 'p') || cur.title !== 'Opening') out.push(cur);
        cur = { title: b.x.slice(0, 200), blocks: [] };
      }
      cur.blocks.push(strip(b));
    }
    out.push(cur);
    return out.filter((c) => c.blocks.length);
  }
  // No chapters to find: parts of about twenty pages each.
  const per = 20;
  for (let start = 0; start < pageCount; start += per) {
    const mine = blocks.filter((b) => b.page >= start && b.page < start + per).map(strip);
    if (mine.length) out.push({ title: `Pages ${start + 1}–${Math.min(pageCount, start + per)}`, blocks: mine });
  }
  return out;
}

export class NoText extends Error {}

export async function pdfToBook(url, { onProgress = () => {}, signal } = {}) {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ url, isEvalSupported: false, withCredentials: true }).promise;
  try {
    const pages = [];
    let chars = 0;
    for (let i = 1; i <= doc.numPages; i++) {
      if (signal?.aborted) throw new DOMException('Stopped', 'AbortError');
      const page = await doc.getPage(i);
      const { height } = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const lines = linesOf(content.items, i - 1, height);
      chars += lines.reduce((n, l) => n + l.text.length, 0);
      pages.push(lines);
      page.cleanup();
      onProgress(i / doc.numPages);
      if (i % 8 === 0) await new Promise((r) => setTimeout(r));
    }
    if (chars < doc.numPages * 60) throw new NoText('This PDF is pictures of pages, with no text to read out.');
    const { blocks } = assemble(dropFurniture(pages));
    const outline = await outlineOf(doc);
    const meta = await doc.getMetadata().catch(() => null);
    const list = chapters(blocks, outline, doc.numPages);
    if (!list.length) throw new NoText('There was no text to turn into reading format.');
    return {
      v: 1,
      title: meta?.info?.Title?.trim() || null,
      author: meta?.info?.Author?.trim() || null,
      pages: doc.numPages,
      made: Date.now(),
      chapters: list,
    };
  } finally {
    doc.destroy();
  }
}
