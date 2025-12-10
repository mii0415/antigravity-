// Service Worker for Antigravity
// Allows for background notifications and PWA capabilities

self.addEventListener('install', (event) => {
    // Force this SW to become the active one, bypassing the waiting state
    self.skipWaiting()
})

self.addEventListener('activate', (event) => {
    // Take control of all open pages immediately
    event.waitUntil(clients.claim())
})

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
    event.notification.close()

    // Focus the window if open, otherwise open new
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // If a window is already open, focus it
            for (const client of clientList) {
                if (client.url && 'focus' in client) {
                    return client.focus()
                }
            }
            // Otherwise open a new window (if we supported deep linking, we'd do it here)
            if (clients.openWindow) {
                return clients.openWindow('/')
            }
        })
    )
})
