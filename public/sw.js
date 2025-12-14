// Service Worker for Antigravity
// Allows for background notifications and PWA capabilities
// Version: 2.0 (Force cache refresh)

self.addEventListener('install', (event) => {
    // Force this SW to become the active one, bypassing the waiting state
    self.skipWaiting()
})

self.addEventListener('activate', (event) => {
    // Take control of all open pages immediately
    event.waitUntil(clients.claim())
})

// Handle notification clicks - also send message to client for TTS
self.addEventListener('notificationclick', (event) => {
    const notificationBody = event.notification.body
    event.notification.close()

    // Focus the window if open, otherwise open new
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // If a window is already open, focus it and send TTS message
            for (const client of clientList) {
                if (client.url && 'focus' in client) {
                    // Send notification body to client for TTS playback
                    client.postMessage({
                        type: 'NOTIFICATION_CLICK',
                        body: notificationBody
                    })
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
