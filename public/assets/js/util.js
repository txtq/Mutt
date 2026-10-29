// Small DOM and formatting helpers shared across Mutt.

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value == null || value === false) continue;
      if (key === 'class') el.className = value;
      else if (key === 'html') el.innerHTML = value;
      else if (key === 'value') el.value = value;
      else if (key === 'dataset') Object.assign(el.dataset, value);
      else if (key === 'style' && typeof value === 'object') {
        for (const [prop, v] of Object.entries(value)) el.style.setProperty(prop, v);
      } else if (key.startsWith('on') && typeof value === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (typeof value !== 'string' && key in el) el[key] = value;
      else el.setAttribute(key, value === true ? '' : value);
    }
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
  return el;
}

export const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';
export const EASE_IN = 'cubic-bezier(0.55, 0, 1, 0.45)';

const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
// The system setting, or Motion: Off in Mutt's own settings.
export const reducedMotion = () => motionQuery.matches || document.documentElement.dataset.motion === 'off';

// The colours planets (and a few touches like toasts) are picked from.
export const PALETTE = ['#FF5C39', '#2F6BFF', '#14B86A', '#FFB020', '#A66BFF', '#FF6FB0', '#00B2C6', '#9A6240'];

// Small seeded random numbers, so the same name always gets the same look.
export function seeded(text) {
  let seed = 2166136261;
  for (let i = 0; i < text.length; i++) seed = Math.imul(seed ^ text.charCodeAt(i), 16777619);
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function fmtBytes(n) {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let i = -1;
  do { n /= 1024; i++; } while (n >= 1024 && i < units.length - 1);
  return `${n < 10 ? n.toFixed(1) : Math.round(n)} ${units[i]}`;
}

export function fmtDuration(s) {
  if (!s && s !== 0) return '';
  s = Math.round(s);
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = String(s % 60).padStart(2, '0');
  return hrs ? `${hrs}:${String(mins).padStart(2, '0')}:${secs}` : `${mins}:${secs}`;
}

const dateFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const dateYearFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

export function fmtDate(ms) {
  const d = new Date(ms);
  return (d.getFullYear() === new Date().getFullYear() ? dateFmt : dateYearFmt).format(d);
}

export function fullDate(ms) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'long', timeStyle: 'short' }).format(new Date(ms));
}

export function timeAgo(ms) {
  const s = (Date.now() - ms) / 1000;
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.round(s / 86400)}d ago`;
  return fmtDate(ms);
}

export function plural(n, one, many = one + 's') {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

export function debounce(fn, wait) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function isEditable(el) {
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

export function inViewport(el, margin = 0) {
  const r = el.getBoundingClientRect();
  return r.bottom > -margin && r.top < innerHeight + margin && r.right > 0 && r.left < innerWidth && r.width > 0;
}

export function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Tiny pub/sub so views can react to edits made elsewhere (viewer, pickers, uploads).
const busTarget = new EventTarget();
export const bus = {
  on(type, fn) {
    const handler = (e) => fn(e.detail);
    busTarget.addEventListener(type, handler);
    return () => busTarget.removeEventListener(type, handler);
  },
  emit(type, detail) {
    busTarget.dispatchEvent(new CustomEvent(type, { detail }));
  },
};

export function autosize(textarea) {
  const fit = () => {
    if (!textarea.isConnected) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  };
  textarea.addEventListener('input', fit);
  // Measure once it's actually on the page, and again if its width changes.
  new ResizeObserver(() => fit()).observe(textarea);
  return fit;
}
