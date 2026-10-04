// Service worker for watchlist price-move push notifications. Registered
// from push.js. Does nothing else (no offline caching) -- the dashboard
// itself isn't an offline-first app, this file exists purely so the
// browser has somewhere to deliver push events while the tab is closed.

self.addEventListener('push', (event) => {
  let payload = { title: 'Market Pulse', body: 'A watchlist alert fired.' };
  try { payload = event.data.json(); } catch (e) { /* keep default */ }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/avatar.jpg',
      tag: payload.title, // collapses rapid duplicate notifications for the same symbol+direction
      data: { url: payload.url || '/' }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
