// Service Worker for Antigravity
// Allows for background notifications and PWA capabilities
// Version: 3.0 (Background notification scheduling)

// Store scheduled alarms
let scheduledTimes = []
let checkInterval = null

self.addEventListener('install', (event) => {
    // Force this SW to become the active one, bypassing the waiting state
    self.skipWaiting()
})

self.addEventListener('activate', (event) => {
    // Take control of all open pages immediately
    event.waitUntil(clients.claim())
    // Start the scheduler
    startScheduler()
})

// Handle messages from main app
self.addEventListener('message', (event) => {
    const { type, data } = event.data

    if (type === 'SET_SCHEDULED_TIMES') {
        // Receive scheduled notification times from main app
        scheduledTimes = data.times || [] // Array of "HH:MM" strings
        console.log('[SW] Scheduled times updated:', scheduledTimes)
        startScheduler()
    }

    if (type === 'TRIGGER_IMMEDIATE_NOTIFICATION') {
        // Main app requests immediate notification
        showNotification(data.title, data.body, data.tag)
    }

    if (type === 'KEEP_ALIVE') {
        // Keep-alive ping from main app - just acknowledge
        console.log('[SW] Keep-alive ping received')
    }
})

// Start the scheduler that checks time every minute
function startScheduler() {
    if (checkInterval) {
        clearInterval(checkInterval)
    }

    // Check every 30 seconds
    checkInterval = setInterval(() => {
        checkScheduledNotifications()
    }, 30000)

    // Also check immediately
    checkScheduledNotifications()
}

// Track which notifications have been sent to avoid duplicates
let sentNotifications = new Set()

function checkScheduledNotifications() {
    if (scheduledTimes.length === 0) return

    const now = new Date()
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    const dateKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`

    for (const time of scheduledTimes) {
        const notificationKey = `${dateKey}-${time}`

        // Check if current time matches (within the same minute)
        if (currentTime === time && !sentNotifications.has(notificationKey)) {
            sentNotifications.add(notificationKey)

            // Notify all clients to generate the notification content
            notifyClients('SCHEDULED_ALARM_TRIGGER', { time })

            console.log('[SW] Triggered scheduled alarm for:', time)
        }
    }

    // Clean up old notification keys (keep only today's)
    const keysToRemove = []
    for (const key of sentNotifications) {
        if (!key.startsWith(dateKey)) {
            keysToRemove.push(key)
        }
    }
    keysToRemove.forEach(k => sentNotifications.delete(k))
}

// Send message to all connected clients
function notifyClients(type, data) {
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        for (const client of clientList) {
            client.postMessage({ type, ...data })
        }
    })
}

// Show a notification
function showNotification(title, body, tag = 'antigravity-notification') {
    self.registration.showNotification(title, {
        body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag,
        requireInteraction: true,
        vibrate: [200, 100, 200]
    })
}

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
            // Otherwise open a new window with correct base path for GitHub Pages
            if (clients.openWindow) {
                // Use self.location to get the SW's base URL (works on both localhost and GH Pages)
                const baseUrl = self.location.origin + new URL(self.location.href).pathname.replace(/\/sw\.js$/, '/')
                return clients.openWindow(baseUrl)
            }
        })
    )
})

// Handle push notifications (for future server-side triggers)
self.addEventListener('push', (event) => {
    const data = event.data?.json() || {}
    event.waitUntil(
        showNotification(
            data.title || 'Antigravity',
            data.body || 'New notification',
            data.tag
        )
    )
})
