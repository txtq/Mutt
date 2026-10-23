// Block kinds — what bundles sort by.

export const KINDS = ['image', 'video', 'audio', 'pdf', 'text', 'link', 'doc', 'code', 'archive', 'other'];

export const KIND_LABEL = {
  image: 'Images', video: 'Videos', audio: 'Audio', pdf: 'PDFs', text: 'Text', link: 'Links',
  doc: 'Documents', code: 'Code', archive: 'Archives', other: 'Other files',
};

export const KIND_ONE = {
  image: 'Image', video: 'Video', audio: 'Audio', pdf: 'PDF', text: 'Text', link: 'Link',
  doc: 'Document', code: 'Code', archive: 'Archive', other: 'File',
};

const WEB_IMAGE = new Set(['jpg', 'jpeg', 'jfif', 'png', 'gif', 'webp', 'avif', 'bmp', 'svg', 'ico', 'apng']);

const EXT_KIND = {};
for (const [kind, list] of Object.entries({
  image: 'jpg jpeg jfif png gif webp avif bmp svg ico apng heic heif tif tiff',
  video: 'mp4 m4v mov webm ogv mkv avi wmv mpg mpeg 3gp',
  audio: 'mp3 wav m4a aac ogg oga opus flac aif aiff wma mid midi',
  pdf: 'pdf',
  doc: 'doc docx odt rtf pages txt md markdown xls xlsx ods csv tsv numbers ppt pptx odp key epub tex',
  code: 'js mjs cjs ts tsx jsx py rb go rs java kt swift c h cc cpp hpp cs php html htm css scss sass less json yaml yml toml xml sh bash zsh sql lua r ipynb vue svelte',
  archive: 'zip rar 7z tar gz tgz bz2 xz dmg iso',
})) for (const ext of list.split(' ')) EXT_KIND[ext] = kind;

export function extOf(name = '') {
  const m = /\.([a-z0-9]{1,10})$/i.exec(name);
  return m ? m[1].toLowerCase() : '';
}

// Best guess before the server has decided (for upload placeholders).
export function guessKind(file) {
  const ext = extOf(file.name);
  if (EXT_KIND[ext]) return EXT_KIND[ext];
  const type = file.type || '';
  if (type === 'application/pdf') return 'pdf';
  for (const k of ['image', 'video', 'audio']) if (type.startsWith(`${k}/`)) return k;
  return 'other';
}

export function showsImage(block) {
  return block.kind === 'image' && (block.thumb || WEB_IMAGE.has(block.ext || ''));
}

export function imageSrc(block) {
  if (block.kind === 'image' && (block.ext === 'gif' || block.ext === 'svg')) return block.file;
  return block.thumb || (block.kind === 'image' && WEB_IMAGE.has(block.ext || '') ? block.file : null);
}

export function extLabel(block) {
  return block.ext ? block.ext.toUpperCase() : KIND_ONE[block.kind];
}

export function displayTitle(block) {
  if (block.title) return block.title;
  if (block.kind === 'link') return block.meta?.domain || block.content;
  if (block.fileName) return block.fileName;
  return '';
}

export function countKinds(blocks) {
  const counts = {};
  for (const b of blocks) counts[b.kind] = (counts[b.kind] || 0) + 1;
  return counts;
}
