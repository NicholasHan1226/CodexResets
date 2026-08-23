/* Codex Resets — push notification service worker (plain JS, no build step) */

self.addEventListener('push', function (event) {
  if (!event.data) return;

  var data;
  try {
    data = event.data.json();
  } catch (e) {
    data = { title: 'Codex Reset Alert', body: event.data.text() };
  }

  var options = {
    body: data.body || 'Reset probability has increased',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    tag: 'codex-reset-alert',
    renotify: true,
    data: {
      url: data.url || '/',
      probability: data.probability,
    },
    actions: [
      { action: 'view', title: data.actionTitle || 'Open dashboard / 打开仪表盘' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
    vibrate: [200, 100, 200],
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Codex Reset Alert', options)
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();

  if (event.action === 'dismiss') return;

  var url = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clients) {
      for (var i = 0; i < clients.length; i++) {
        var client = clients[i];
        if (client.url.indexOf(url) !== -1 && 'focus' in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});

self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});
