// Documents, in and out of the editor's HTML.
//
// A document is still a note: its words are kept as the note's text, in the
// light Markdown every note uses (md.js), so search, autosort, list mode and
// the file view all read it as before. The editor keeps a fuller version
// beside it (headings, alignment, colours, tables, pictures).
//
// This file turns a note into editor HTML (fromMarkdown), editor HTML back
// into the note's text (toMarkdown), cleans HTML that comes in from outside
// (cleanHtml, the same allowlist as mutt/documents.py), and reads a document
// into plain blocks and runs for the PDF and Word makers (readBlocks).

import { inline } from './md.js';

// ------------------------------------------------------------ note -> HTML

export function fromMarkdown(src = '') {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let para = [];
  let list = null;
  const flushPara = () => {
    if (para.length) out.push(`<p>${para.map(inline).join('<br>')}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list) {
      const cls = list.check ? ' class="check"' : '';
      out.push(`<${list.tag}${cls}>${list.items.map((i) => `<li${i.done ? ' data-done=""' : ''}>${inline(i.text) || '<br>'}</li>`).join('')}</${list.tag}>`);
    }
    list = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^```/.test(line)) {
      flushPara(); flushList();
      const code = [];
      while (++i < lines.length && !/^```/.test(lines[i])) code.push(lines[i]);
      out.push(`<pre>${escapeHtml(code.join('\n')) || '<br>'}</pre>`);
      continue;
    }
    let m;
    if ((m = /^(#{1,4})\s+(.*)$/.exec(line))) {
      flushPara(); flushList();
      const n = m[1].length;
      out.push(`<h${n}>${inline(m[2])}</h${n}>`);
    } else if ((m = /^\s*[-*•]\s+\[( |x|X)\]\s*(.*)$/.exec(line))) {
      flushPara();
      if (!list || !list.check) { flushList(); list = { tag: 'ul', check: true, items: [] }; }
      list.items.push({ text: m[2], done: m[1] !== ' ' });
    } else if ((m = /^\s*[-*•]\s+(.*)$/.exec(line)) || (m = /^\s*\d+[.)]\s+(.*)$/.exec(line))) {
      flushPara();
      const tag = /^\s*\d/.test(line) ? 'ol' : 'ul';
      if (!list || list.tag !== tag || list.check) { flushList(); list = { tag, items: [] }; }
      list.items.push({ text: m[1] });
    } else if ((m = /^>\s?(.*)$/.exec(line))) {
      flushPara(); flushList();
      const quote = [m[1]];
      while (i + 1 < lines.length && /^>\s?/.test(lines[i + 1])) quote.push(lines[++i].replace(/^>\s?/, ''));
      out.push(`<blockquote>${quote.map(inline).join('<br>')}</blockquote>`);
    } else if (/^\s*(---|\*\*\*)\s*$/.test(line)) {
      flushPara(); flushList();
      out.push('<hr>');
    } else if (!line.trim()) {
      flushPara(); flushList();
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara(); flushList();
  return out.join('') || '<p><br></p>';
}

export const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ------------------------------------------------------------ HTML -> note

function inlineMd(node) {
  let out = '';
  for (const n of node.childNodes) {
    if (n.nodeType === 3) { out += n.data.replace(/ /g, ' '); continue; }
    if (n.nodeType !== 1) continue;
    const tag = n.tagName.toLowerCase();
    if (n.classList.contains('de-gap')) continue;
    if (tag === 'br') { out += '\n'; continue; }
    if (tag === 'img') continue;
    const inner = inlineMd(n);
    if (!inner.trim()) { out += inner; continue; }
    const wrap = (mark) => {
      const lead = inner.match(/^\s*/)[0];
      const trail = inner.match(/\s*$/)[0];
      return `${lead}${mark}${inner.trim()}${mark}${trail}`;
    };
    if (tag === 'strong' || tag === 'b') out += wrap('**');
    else if (tag === 'em' || tag === 'i') out += wrap('*');
    else if (tag === 's' || tag === 'del' || tag === 'strike') out += wrap('~~');
    else if (tag === 'code') out += `\`${inner}\``;
    else if (tag === 'a' && /^https?:/i.test(n.getAttribute('href') || '')) {
      const href = n.getAttribute('href');
      out += inner.trim() === href ? href : `[${inner}](${href})`;
    } else out += inner;
  }
  return out;
}

function listMd(list, depth, lines) {
  let n = Number(list.getAttribute('start')) || 1;
  for (const li of list.children) {
    if (li.tagName !== 'LI') continue;
    const nested = [...li.children].filter((c) => c.tagName === 'UL' || c.tagName === 'OL');
    const clone = li.cloneNode(true);
    clone.querySelectorAll(':scope > ul, :scope > ol').forEach((x) => x.remove());
    const text = inlineMd(clone).replace(/\n+/g, ' ').trim();
    const pad = '  '.repeat(depth);
    let mark = list.tagName === 'OL' ? `${n++}.` : '-';
    if (list.classList.contains('check')) mark = `- [${li.hasAttribute('data-done') ? 'x' : ' '}]`;
    lines.push(`${pad}${mark} ${text}`);
    for (const sub of nested) listMd(sub, depth + 1, lines);
  }
}

export function toMarkdown(root) {
  const parts = [];
  for (const el of root.children) {
    const tag = el.tagName.toLowerCase();
    if (el.classList.contains('de-gap') || el.classList.contains('pb')) continue;
    if (/^h[1-4]$/.test(tag)) {
      parts.push(`${'#'.repeat(Math.min(3, Number(tag[1])))} ${inlineMd(el).replace(/\n+/g, ' ').trim()}`);
    } else if (tag === 'ul' || tag === 'ol') {
      const lines = [];
      listMd(el, 0, lines);
      parts.push(lines.join('\n'));
    } else if (tag === 'blockquote') {
      const text = el.querySelector('p') ? [...el.children].map((c) => inlineMd(c)).join('\n') : inlineMd(el);
      parts.push(text.trim().split('\n').map((l) => `> ${l}`).join('\n'));
    } else if (tag === 'pre') {
      parts.push(`\`\`\`\n${el.textContent.replace(/\n$/, '')}\n\`\`\``);
    } else if (tag === 'hr') {
      parts.push('---');
    } else if (tag === 'table') {
      const rows = [...el.querySelectorAll('tr')].map((tr) => [...tr.children].map((c) => inlineMd(c).replace(/\s+/g, ' ').trim()).join(' | '));
      parts.push(rows.join('\n'));
    } else if (tag === 'figure' || (tag === 'p' && el.querySelector('img') && !el.textContent.trim())) {
      continue;
    } else {
      const text = inlineMd(el).replace(/\n+$/, '');
      if (text.trim()) parts.push(text.replace(/[ \t]+$/gm, ''));
    }
  }
  return parts.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}

// The words alone, a line per paragraph.
export function toPlain(root) {
  const md = [];
  for (const el of root.children) {
    if (el.classList.contains('de-gap') || el.classList.contains('pb')) continue;
    md.push(el.innerText ?? el.textContent);
  }
  return md.join('\n\n').replace(/ /g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

// A copy of the editor's contents, without the page gaps it adds while you write.
export function cleanCopy(flow) {
  const copy = flow.cloneNode(true);
  copy.querySelectorAll('.de-gap').forEach((g) => g.remove());
  copy.querySelectorAll('[data-push]').forEach((el) => {
    el.style.removeProperty('margin-top');
    el.style.removeProperty('height');
    el.removeAttribute('data-push');
    if (!el.getAttribute('style')) el.removeAttribute('style');
  });
  copy.querySelectorAll('[contenteditable]').forEach((el) => el.removeAttribute('contenteditable'));
  copy.normalize();
  return copy;
}

// ------------------------------------------------------------ cleaning HTML from outside

const BLOCK = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'blockquote', 'pre', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'figure', 'figcaption', 'div']);
const INLINE = new Set(['strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del', 'sub', 'sup', 'code', 'a', 'span', 'mark', 'br', 'img', 'hr', 'font']);
const DROP = new Set(['script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template', 'head', 'title', 'svg', 'math', 'video', 'audio', 'canvas', 'form', 'select', 'textarea', 'button', 'input', 'meta', 'link']);
const RENAME = { b: 'strong', i: 'em', strike: 's', del: 's', font: 'span' };
const CLASSES = new Set(['pb', 'check', 'done', 'title', 'subtitle', 'stanza', 'wide', 'left', 'right', 'center']);
const COLOR = /^(?:#[0-9a-f]{3,8}|rgba?\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?\s*(?:,\s*[\d.]+%?\s*)?\)|transparent|inherit)$/i;
const FAMILIES = new Set(['serif', 'sans', 'mono', 'type']);
const STYLES = {
  'text-align': /^(?:left|right|center|justify|start|end)$/,
  color: COLOR,
  'background-color': COLOR,
  'font-size': /^(?:\d{1,2}(?:\.\d+)?(?:pt|px)|x-small|small|medium|large|x-large|xx-large|xxx-large)$/,
  'font-weight': /^(?:bold|normal|[1-9]00)$/,
  'font-style': /^(?:italic|normal)$/,
  'text-decoration-line': /^(?:underline|line-through|none|underline line-through)$/,
  'margin-left': /^\d{1,3}(?:\.\d+)?(?:px|em|pt)$/,
  width: /^\d{1,3}(?:\.\d+)?%$/,
  'line-height': /^(?:1|1\.15|1\.5|2|normal)$/,
};

function cleanStyle(el, tag, own) {
  const out = [];
  for (const prop of el.style) {
    let value = el.style.getPropertyValue(prop).trim().toLowerCase();
    if (prop === 'font-family') {
      const name = value.split(',')[0].trim().replace(/["']/g, '');
      if (FAMILIES.has(name)) out.push(`font-family: ${name}`);
      continue;
    }
    if (prop === 'text-decoration') value = value.split(' ')[0];
    const key = prop === 'text-decoration' ? 'text-decoration-line' : prop;
    const rule = STYLES[key];
    if (!rule || !rule.test(value)) continue;
    if ((key === 'margin-left' || key === 'line-height') && !BLOCK.has(tag)) continue;
    if (key === 'width' && !['img', 'td', 'th', 'figure'].includes(tag)) continue;
    // Pasted text keeps the look of where it came from only where it means something.
    if (!own && (key === 'color' && /^(?:rgb\(0, 0, 0\)|#000(?:000)?|black)$/.test(value))) continue;
    if (!own && key === 'font-size') continue;
    out.push(`${key}: ${value}`);
  }
  return out.slice(0, 8).join('; ');
}

// own: HTML the editor made itself (kept as is) rather than pasted from elsewhere.
export function cleanHtml(raw, { own = false } = {}) {
  const doc = new DOMParser().parseFromString(`<body>${raw}</body>`, 'text/html');
  const out = document.createElement('div');
  const walk = (src, dest) => {
    for (const n of src.childNodes) {
      if (n.nodeType === 3) { dest.append(n.data); continue; }
      if (n.nodeType !== 1) continue;
      const tag = n.tagName.toLowerCase();
      if (DROP.has(tag)) continue;
      if (!BLOCK.has(tag) && !INLINE.has(tag)) { walk(n, dest); continue; }
      const name = RENAME[tag] || tag;
      const el = document.createElement(name);
      if (tag === 'font') {
        const face = (n.getAttribute('face') || '').split(',')[0].trim();
        if (FAMILIES.has(face)) el.style.fontFamily = face;
        if (COLOR.test(n.getAttribute('color') || '')) el.style.color = n.getAttribute('color');
      } else {
        const style = cleanStyle(n, name, own);
        if (style) el.setAttribute('style', style);
      }
      const classes = [...n.classList].filter((c) => CLASSES.has(c));
      if (classes.length) el.className = classes.join(' ');
      if (name === 'a') {
        const href = (n.getAttribute('href') || '').trim();
        if (/^(?:https?:\/\/|mailto:|#)[^\s"'<>]*$/i.test(href)) {
          el.setAttribute('href', href);
          if (!href.startsWith('#')) { el.target = '_blank'; el.rel = 'noopener noreferrer'; }
        }
      }
      if (name === 'img') {
        const src2 = (n.getAttribute('src') || '').trim();
        if (!/^\/api\/docs\/[\w-]{1,40}\/img\/[\w-]{1,40}$/.test(src2)) continue;
        el.setAttribute('src', src2);
        el.setAttribute('alt', (n.getAttribute('alt') || '').slice(0, 300));
      }
      if (name === 'td' || name === 'th') {
        for (const key of ['colspan', 'rowspan']) {
          const v = Number(n.getAttribute(key));
          if (v > 1 && v <= 20) el.setAttribute(key, String(v));
        }
      }
      if (name === 'li' && n.hasAttribute('data-done')) el.setAttribute('data-done', '');
      if (name === 'ol' && /^\d+$/.test(n.getAttribute('start') || '')) el.setAttribute('start', n.getAttribute('start'));
      if (name === 'div' && el.classList.contains('pb')) el.setAttribute('contenteditable', 'false');
      dest.append(el);
      walk(n, el);
    }
  };
  walk(doc.body, out);
  return out.innerHTML;
}

// ------------------------------------------------------------ reading a document for export

const KEYWORD_PT = { 'x-small': 0.75, small: 0.88, medium: 1, large: 1.2, 'x-large': 1.5, 'xx-large': 2, 'xxx-large': 2.5 };

function sizeOf(value, base) {
  if (!value) return null;
  if (KEYWORD_PT[value]) return base * KEYWORD_PT[value];
  const m = /^([\d.]+)(pt|px)$/.exec(value);
  if (!m) return null;
  return m[2] === 'pt' ? Number(m[1]) : Number(m[1]) * 0.75;
}

export function parseColor(value) {
  if (!value || value === 'transparent' || value === 'inherit') return null;
  let m = /^#([0-9a-f]{3,8})$/i.exec(value);
  if (m) {
    let hex = m[1];
    if (hex.length <= 4) hex = [...hex].map((c) => c + c).join('');
    return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  }
  m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(value);
  if (m) {
    if (m[4] !== undefined && Number(m[4]) === 0) return null;
    return [m[1], m[2], m[3]].map((v) => Math.min(255, Number(v)) / 255);
  }
  return null;
}

// What a run of text looks like, inherited down the tree.
function runsOf(node, base, look = {}, out = []) {
  for (const n of node.childNodes) {
    if (n.nodeType === 3) {
      const text = n.data.replace(/ /g, ' ');
      if (text) out.push({ ...look, text });
      continue;
    }
    if (n.nodeType !== 1 || n.classList.contains('de-gap')) continue;
    const tag = n.tagName.toLowerCase();
    if (tag === 'br') { out.push({ ...look, br: true, text: '' }); continue; }
    if (tag === 'img' || tag === 'ul' || tag === 'ol') continue;
    const next = { ...look };
    if (tag === 'strong' || tag === 'b') next.b = true;
    if (tag === 'em' || tag === 'i') next.i = true;
    if (tag === 'u') next.u = true;
    if (tag === 's' || tag === 'del' || tag === 'strike') next.s = true;
    if (tag === 'code') next.code = true;
    if (tag === 'sup') next.sup = true;
    if (tag === 'sub') next.sub = true;
    if (tag === 'a' && /^(?:https?:|mailto:)/i.test(n.getAttribute('href') || '')) next.href = n.getAttribute('href');
    const st = n.style;
    if (st) {
      if (/bold|[6-9]00/.test(st.fontWeight)) next.b = true;
      if (st.fontStyle === 'italic') next.i = true;
      const deco = st.textDecorationLine || st.textDecoration || '';
      if (deco.includes('underline')) next.u = true;
      if (deco.includes('line-through')) next.s = true;
      const color = parseColor(st.color);
      if (color) next.color = color;
      const bg = parseColor(st.backgroundColor);
      if (bg) next.bg = bg;
      const size = sizeOf(st.fontSize, base);
      if (size) next.size = size;
      const fam = (st.fontFamily || '').replace(/["']/g, '').split(',')[0].trim();
      if (FAMILIES.has(fam)) next.font = fam;
    }
    runsOf(n, base, next, out);
  }
  return out;
}

const alignOf = (el) => {
  const a = el.style?.textAlign;
  return a === 'center' || a === 'right' || a === 'justify' ? a : 'left';
};
const indentOf = (el) => {
  const m = /^([\d.]+)(px|pt|em)$/.exec(el.style?.marginLeft || '');
  if (!m) return 0;
  return m[2] === 'pt' ? Number(m[1]) : m[2] === 'em' ? Number(m[1]) * 12 : Number(m[1]) * 0.75;
};

// The document as a list of blocks, each with its runs of text.
// base: the body text size in points.
export function readBlocks(root, base = 12) {
  const blocks = [];
  const images = (el) => [...el.querySelectorAll('img')].map((img) => ({
    type: 'img', src: img.getAttribute('src'), alt: img.alt || '', width: parseFloat(img.style.width) || null,
  }));
  let group = 0;
  const lists = (list, level) => {
    if (!level) group++;
    let n = Number(list.getAttribute('start')) || 1;
    const kind = list.tagName === 'OL' ? 'ol' : list.classList.contains('check') ? 'check' : 'ul';
    for (const li of list.children) {
      if (li.tagName !== 'LI') continue;
      blocks.push({ type: 'li', list: { kind, level, group, index: n++, done: li.hasAttribute('data-done') }, align: alignOf(li), runs: runsOf(li, base) });
      for (const sub of li.children) if (sub.tagName === 'UL' || sub.tagName === 'OL') lists(sub, level + 1);
    }
  };
  for (const el of root.children) {
    const tag = el.tagName.toLowerCase();
    if (el.classList.contains('de-gap')) continue;
    if (el.classList.contains('pb')) { blocks.push({ type: 'pb' }); continue; }
    if (tag === 'hr') { blocks.push({ type: 'hr' }); continue; }
    if (tag === 'ul' || tag === 'ol') { lists(el, 0); continue; }
    if (tag === 'table') {
      const rows = [...el.querySelectorAll('tr')].map((tr) => [...tr.children].map((c) => ({ head: c.tagName === 'TH', runs: runsOf(c, base) })));
      if (rows.length) blocks.push({ type: 'table', rows });
      continue;
    }
    if (tag === 'pre') { blocks.push({ type: 'code', runs: [{ text: el.textContent.replace(/\n$/, ''), code: true }] }); continue; }
    if (tag === 'figure') { blocks.push(...images(el)); continue; }
    if (tag === 'blockquote') {
      const inner = el.querySelector(':scope > p') ? [...el.children] : [el];
      for (const p of inner) blocks.push({ type: 'quote', align: alignOf(p), runs: runsOf(p, base) });
      continue;
    }
    const imgs = images(el);
    const runs = runsOf(el, base);
    if (imgs.length && !runs.some((r) => r.text.trim())) { blocks.push(...imgs); continue; }
    let type = /^h[1-4]$/.test(tag) ? tag : 'p';
    if (el.classList.contains('title')) type = 'title';
    if (el.classList.contains('subtitle')) type = 'subtitle';
    blocks.push({ type, align: alignOf(el), indent: indentOf(el), spacing: Number(el.style.lineHeight) || null, runs });
    blocks.push(...imgs);
  }
  return blocks;
}

// Sizes for each kind of block, relative to the body text.
export const BLOCK_SCALE = { title: 2.4, subtitle: 1.35, h1: 1.8, h2: 1.4, h3: 1.17, h4: 1.0, p: 1, quote: 1, li: 1, code: 0.9 };

// Does this read as a poem? Short lines, kept as they were written.
export function looksLikePoem(root) {
  const lines = [];
  for (const el of root.children) {
    if (!/^(P|H\d|BLOCKQUOTE)$/.test(el.tagName)) { if (el.textContent.trim()) return false; continue; }
    if (/^H/.test(el.tagName)) continue;
    lines.push(...(el.innerText || el.textContent).split('\n').filter((l) => l.trim()));
  }
  if (lines.length < 3) return false;
  const avg = lines.reduce((a, l) => a + l.length, 0) / lines.length;
  const ends = lines.filter((l) => /[.!?]$/.test(l.trim())).length;
  return avg < 52 && ends <= lines.length / 2;
}

// Page sizes (points) and margins (points), shared by the editor and the makers.
export const PAGE_SIZES = { a4: [595.28, 841.89], letter: [612, 792] };
export const MARGIN_PT = { narrow: 36, normal: 72, wide: 108 };
