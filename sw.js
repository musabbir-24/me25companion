// sw.js

// 1. Listen for incoming push messages
self.addEventListener('push', function(event) {
  if (!event.data) return;
  
  const data = event.data.json();
  
  const options = {
    body: data.body,
    icon: '/icon.png', // Replace with a path to your app logo (192x192px)
    badge: '/badge.png', // Optional: A small monochrome icon for the Android status bar
    data: {
      url: data.url || '/' // The URL to open when the user taps the notification
    }
  };

  // Keep the service worker alive until the notification is drawn
  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// 2. Listen for the user clicking the notification
self.addEventListener('notificationclick', function(event) {
  event.notification.close(); // Immediately dismiss the popup
  
  const urlToOpen = event.notification.data.url;

  // Check if the site is already open. If so, focus it. If not, open a new tab.
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(function(windowClients) {
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});