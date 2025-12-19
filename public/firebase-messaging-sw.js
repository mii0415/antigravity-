// Firebase Messaging Service Worker
// This file is required for background push notifications via FCM

// Import Firebase scripts
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

// Firebase config
const firebaseConfig = {
    apiKey: "AIzaSyBFg-xLMIjbtA-wM5Z-tZ5N8jBT3HejEP0",
    authDomain: "hasebe-4b46a.firebaseapp.com",
    projectId: "hasebe-4b46a",
    storageBucket: "hasebe-4b46a.firebasestorage.app",
    messagingSenderId: "720761857196",
    appId: "1:720761857196:web:99eadddc35a7facb3e6b09"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize Firebase Messaging
const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
    console.log('[FCM SW] Received background message:', payload);

    const notificationTitle = payload.notification?.title || payload.data?.title || 'Antigravity';
    const notificationOptions = {
        body: payload.notification?.body || payload.data?.body || 'New notification',
        icon: payload.notification?.icon || 'https://mii0415.github.io/antigravity-/notification-icon.jpg',
        badge: 'https://mii0415.github.io/antigravity-/notification-icon.jpg',
        tag: payload.data?.tag || 'fcm-notification',
        requireInteraction: true,
        vibrate: [200, 100, 200],
        data: payload.data
    };

    return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
    console.log('[FCM SW] Notification clicked:', event);
    event.notification.close();

    // Focus or open the app
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if (client.url && 'focus' in client) {
                    // Send message to client about notification click
                    client.postMessage({
                        type: 'NOTIFICATION_CLICK',
                        body: event.notification.body,
                        data: event.notification.data
                    });
                    return client.focus();
                }
            }
            // Open new window if no existing client
            if (clients.openWindow) {
                const baseUrl = self.location.origin + '/antigravity-/';
                return clients.openWindow(baseUrl);
            }
        })
    );
});
