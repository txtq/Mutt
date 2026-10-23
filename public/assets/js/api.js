// Talking to the Mutt server.

export const session = { user: null, signups: true };

export class ApiError extends Error {
  constructor(status, message, data = {}) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

let onSignedOut = () => {};
export function whenSignedOut(fn) {
  onSignedOut = fn;
}

async function request(method, url, body) {
  const init = { method, headers: { 'X-Mutt': '1' }, credentials: 'same-origin' };
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiError(0, 'Could not reach Mutt. Check your connection.');
  }
  let data = {};
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith('/api/auth') && !url.startsWith('/api/me')) onSignedOut();
    throw new ApiError(res.status, data.error || 'Something went wrong.', data);
  }
  return data;
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body = {}) => request('POST', url, body),
  patch: (url, body) => request('PATCH', url, body),
  put: (url, body) => request('PUT', url, body),
  del: (url) => request('DELETE', url),
};

// Raw upload with progress (fetch can't report upload progress yet).
export function sendFile(url, blob, { type, onProgress, signal } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('X-Mutt', '1');
    xhr.setRequestHeader('Content-Type', type || blob.type || 'application/octet-stream');
    xhr.responseType = 'json';
    if (onProgress) xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      const data = xhr.response || {};
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else {
        if (xhr.status === 401) onSignedOut();
        reject(new ApiError(xhr.status, data.error || 'Upload failed.', data));
      }
    };
    xhr.onerror = () => reject(new ApiError(0, 'Upload failed. Check your connection.'));
    xhr.onabort = () => reject(new ApiError(0, 'Upload cancelled.'));
    signal?.addEventListener('abort', () => xhr.abort());
    xhr.send(blob);
  });
}
