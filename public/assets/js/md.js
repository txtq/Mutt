// A small, safe Markdown subset for text blocks. Everything is escaped
// first; only the patterns below turn back into markup.

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inline(text) {
  const codes = [];
  let out = esc(text).replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
  out = out
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/(^|[\s(])(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/(^|\W)_([^_\s][^_]*)_(?=\W|$)/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<s>$1</s>');
  return out.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[Number(i)]}</code>`);
}

// Markdown with the markup removed, for tiny previews.
export function plain(src = '') {
  return src
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^\s{0,3}(#{1,6}|>|[-*•]|\d+[.)])\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/(\*\*|__|~~|`)/g, '')
    .replace(/(^|\W)[*_](\S[^*_]*)[*_](?=\W|$)/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim();
}

export function markdown(src = '') {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const html = [];
  let para = [];
  let list = null;
  const flushPara = () => {
    if (para.length) html.push(`<p>${para.map(inline).join('<br>')}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list) html.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`);
    list = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^```/.test(line)) {
      flushPara(); flushList();
      const code = [];
      while (++i < lines.length && !/^```/.test(lines[i])) code.push(lines[i]);
      html.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);
      continue;
    }
    let m;
    if ((m = /^(#{1,3})\s+(.*)$/.exec(line))) {
      flushPara(); flushList();
      html.push(`<h${m[1].length + 2}>${inline(m[2])}</h${m[1].length + 2}>`);
    } else if ((m = /^\s*[-*•]\s+(.*)$/.exec(line)) || (m = /^\s*\d+[.)]\s+(.*)$/.exec(line))) {
      flushPara();
      const tag = /^\s*\d/.test(line) ? 'ol' : 'ul';
      if (!list || list.tag !== tag) { flushList(); list = { tag, items: [] }; }
      list.items.push(m[1]);
    } else if ((m = /^>\s?(.*)$/.exec(line))) {
      flushPara(); flushList();
      html.push(`<blockquote>${inline(m[1])}</blockquote>`);
    } else if (/^\s*(---|\*\*\*)\s*$/.test(line)) {
      flushPara(); flushList();
      html.push('<hr>');
    } else if (!line.trim()) {
      flushPara(); flushList();
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara(); flushList();
  return html.join('');
}
