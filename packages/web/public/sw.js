// Push-only service worker: no fetch handler, so nothing is cached and every
// deploy is picked up immediately. Payload = server PushMessage
// { title, body, url, tag }; the tag makes a newer notification replace an
// older one for the same session.
self.addEventListener('push', event => {
  const message = event.data.json()
  event.waitUntil(
    self.registration.showNotification(message.title, {
      body: message.body,
      tag: message.tag,
      data: { url: message.url },
      icon: '/icons/icon-192.png',
    }),
  )
})

// Take over pages that were already open when push was enabled, so a click can
// navigate them (WindowClient.navigate only works on controlled clients).
self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = event.notification.data.url
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(windows => {
      const open = windows[0]
      if (!open) return self.clients.openWindow(url)
      return open.focus().then(client => client.navigate(url))
    }),
  )
})
