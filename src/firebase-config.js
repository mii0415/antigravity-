// Firebase configuration for Antigravity
import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';

const firebaseConfig = {
    apiKey: "AIzaSyBFg-xLMIjbtA-wM5Z-tZ5N8jBT3HejEP0",
    authDomain: "hasebe-4b46a.firebaseapp.com",
    projectId: "hasebe-4b46a",
    storageBucket: "hasebe-4b46a.firebasestorage.app",
    messagingSenderId: "720761857196",
    appId: "1:720761857196:web:99eadddc35a7facb3e6b09"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Cloud Messaging
let messaging = null;

export const initializeMessaging = async () => {
    try {
        // Check if notification permission is granted
        if (Notification.permission !== 'granted') {
            console.log('[FCM] Notification permission not granted yet');
            return null;
        }

        messaging = getMessaging(app);
        console.log('[FCM] Messaging initialized');
        return messaging;
    } catch (error) {
        console.error('[FCM] Error initializing messaging:', error);
        return null;
    }
};

// Get FCM token for push notifications
export const getFCMToken = async () => {
    try {
        if (!messaging) {
            messaging = getMessaging(app);
        }

        // VAPID key for web push (from Firebase Console -> Cloud Messaging -> Web configuration)
        const vapidKey = 'BEsm7y2rUoTTvcJKgz07YZNJ5xS8ar8KvH6dLSxvvL1S8b5Uenu-h5OfYrDrtnJKyDD4nXhfcVJdyii0v2nVXy0';

        const token = await getToken(messaging, {
            vapidKey,
            serviceWorkerRegistration: await navigator.serviceWorker.getRegistration()
        });

        if (token) {
            console.log('[FCM] Token obtained:', token.substring(0, 20) + '...');
            return token;
        } else {
            console.log('[FCM] No token available');
            return null;
        }
    } catch (error) {
        console.error('[FCM] Error getting token:', error);
        return null;
    }
};

// Handle foreground messages
export const onForegroundMessage = (callback) => {
    if (!messaging) {
        messaging = getMessaging(app);
    }

    return onMessage(messaging, (payload) => {
        console.log('[FCM] Foreground message received:', payload);
        callback(payload);
    });
};

export { app, messaging };
