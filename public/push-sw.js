/* Synapta Web Push service worker: muestra los avisos (video listo/fallido)
 * aunque la app esté cerrada y abre Mis generaciones al tocarlos. */
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_) {
    payload = { notification: { title: 'Synapta', body: event.data ? event.data.text() : '' } };
  }
  const n = payload.notification || {};
  const data = n.data || {};
  const options = { body: n.body || '', data, tag: data.task_id || 'synapta' };
  if (n.icon) options.icon = n.icon;
  if (n.badge) options.badge = n.badge;
  event.waitUntil(self.registration.showNotification(n.title || 'Synapta', options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = '/my-generations';
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windows) => {
        for (const w of windows) {
          if (w.url.includes('/my-generations') && 'focus' in w) return w.focus();
        }
        if (self.clients.openWindow) return self.clients.openWindow(url);
        return undefined;
      }),
  );
});
