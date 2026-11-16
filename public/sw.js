// Mutt's service worker: it only shows comets (DESIGN.md "Comets"). A push from Mutt carries no
// words; this asks Mutt which comets have come and shows each as a notification. Safari takes a
// device's pushes away if one ever comes without a notification, so there is always one.
// It caches nothing and handles no page requests.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

const words = (c) => {
  const at = new Date(c.at);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const day = new Date(at); day.setHours(0, 0, 0, 0);
  const gap = Math.round((day - today) / 86400000);
  const time = c.time ? at.toLocaleTimeString(undefined, { hour: 'numeric', minute: at.getMinutes() ? '2-digit' : undefined }) : '';
  const name = gap === 0 ? 'today' : gap === 1 ? 'tomorrow' : at.toLocaleDateString(undefined, { weekday: 'long' });
  return time ? `${name}, ${time}` : name;
};
const nameOf = (c) => {
  const rest = (c.said ? c.title.replace(c.said, ' ') : c.title).replace(/\s+/g, ' ').replace(/^[\s,.:;–—-]+|[\s,.:;–—(-]+$/g, '').trim();
  return rest.length > 1 ? rest : c.title;
};

self.addEventListener('push', (e) => {
  e.waitUntil((async () => {
    let list = [];
    try {
      const res = await fetch('/api/comets/due', { credentials: 'include', cache: 'no-store' });
      if (res.ok) list = (await res.json()).comets || [];
    } catch { /* shown plainly below */ }
    if (!list.length) {
      await self.registration.showNotification('A comet in Mutt', { body: 'Something you asked to be reminded of.', tag: 'comet', data: { url: '/' } });
      return;
    }
    for (const c of list.slice(0, 3)) {
      const url = c.planet ? `/p/${c.planet}?b=${c.id}` : `/?b=${c.id}`;
      await self.registration.showNotification(`Comet: ${nameOf(c)}`, {
        body: c.due ? `Reminding you: ${words(c)}` : `Coming up: ${words(c)}`,
        tag: `comet-${c.id}-${c.due ? 'due' : 'soon'}`,
        icon: '/assets/icon-180.png',
        data: { url },
      });
    }
  })());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const here = open.find((c) => new URL(c.url).origin === self.location.origin);
    if (here) {
      await here.focus();
      return here.navigate(url).catch(() => null);
    }
    return self.clients.openWindow(url);
  })());
});
