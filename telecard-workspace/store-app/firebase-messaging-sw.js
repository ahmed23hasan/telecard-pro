// ============================================================================
// 🔔 عامل خدمة الإشعارات (Firebase Messaging SW) - Enterprise V20.0.0 💎
// 🎯 الوظيفة: العمل في خلفية النظام لاستقبال الإشعارات وتوجيه المستخدم بذكاء.
// 🚀 التحديثات المعمارية الصارمة (V20.0.0 - Canonical targetType & targetId):
// 1. Canonical Payload Alignment 🏛️: توحيد (targetType, targetId) مع triggersEngine.js في السيرفر.
// 2. FCM_MSG Decoupler 🛡️: استخراج البيانات المدفونة من إشعارات فايربيز التلقائية لمنع النقر الميت.
// 3. Subfolder Origin Fix 🛡️: استخدام (self.location.href) لحماية مسارات المجلدات الفرعية.
// ============================================================================

importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

const firebaseConfig = {
    apiKey: "AIzaSyAKcMFLGday4sqp4wrbAIN3OEzH-kmhGK0",
    authDomain: "telecard-1.firebaseapp.com",
    projectId: "telecard-1",
    storageBucket: "telecard-1.firebasestorage.app",
    messagingSenderId: "698672838633",
    appId: "1:698672838633:web:743c8809615bd8308bfd78"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const messaging = firebase.messaging();

// ============================================================================
// 📬 1. اعتراض الإشعار ورسمه على شاشة الهاتف (والمتجر مغلق/في الخلفية)
// ============================================================================
messaging.onBackgroundMessage((payload) => {
    // 🛡️ Double-Ping Shield: حماية ضد الإشعارات المزدوجة
    if (payload.notification) {
        return;
    }
    
    const dataPayload = payload.data || {};
    const notificationTitle = dataPayload.title || 'تنبيه من المتجر';
    const notificationBody = dataPayload.message || 'لديك تحديث جديد، تفضل بالدخول.';
    const notificationId = dataPayload.targetId ? String(dataPayload.targetId) : 'telecard-general-alert';
    
    const notificationOptions = {
        body: notificationBody,
        icon: dataPayload.image || 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
        badge: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
        dir: 'rtl',
        vibrate: [200, 100, 200],
        data: dataPayload,
        tag: notificationId,
        requireInteraction: false
    };
    
    return self.registration.showNotification(notificationTitle, notificationOptions);
});

// ============================================================================
// 🖱️ 2. التوجيه الديناميكي المتقدم عند النقر على الإشعار
// ============================================================================
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    
    let notificationData = event.notification.data || {};
    if (notificationData.FCM_MSG && notificationData.FCM_MSG.data) {
        notificationData = { ...notificationData, ...notificationData.FCM_MSG.data };
    }
    
    // 📌 [توحيد معماري - triggersEngine.js]: المعرفان القياسيان هما targetType و targetId
    const targetType = String(notificationData.targetType || '').trim();
    const targetId = String(notificationData.targetId || '').trim();
    
    const defaultStoreUrl = new URL('./store.html', self.location.href).href;
    let targetUrl = (notificationData.click_action && typeof notificationData.click_action === 'string') ?
        notificationData.click_action :
        defaultStoreUrl;
    
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            const basePath = new URL('./', self.location.href).href;
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if (client.url.includes(basePath) && 'focus' in client) {
                    return client.focus().then(() => {
                        if (targetType && targetId && targetType !== 'undefined' && targetId !== 'undefined') {
                            client.postMessage({
                                type: 'FCM_NOTIFICATION_CLICK',
                                payload: { targetType, targetId }
                            });
                        }
                    });
                }
            }
            
            if (clients.openWindow) {
                if (targetType && targetId && targetType !== 'undefined' && targetId !== 'undefined') {
                    try {
                        const urlObj = new URL(targetUrl, self.location.href);
                        urlObj.searchParams.set('action', 'view');
                        urlObj.searchParams.set('type', targetType);
                        urlObj.searchParams.set('id', targetId);
                        targetUrl = urlObj.href;
                    } catch (e) {
                        targetUrl = defaultStoreUrl;
                    }
                }
                return clients.openWindow(targetUrl);
            }
        })
    );
});