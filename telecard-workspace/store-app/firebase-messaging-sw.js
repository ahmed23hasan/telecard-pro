// ============================================================================
// 🔔 عامل خدمة الإشعارات (Firebase Messaging SW) - Enterprise V18.9.1 💎
// 🎯 الوظيفة: العمل في خلفية النظام لاستقبال الإشعارات وتوجيه المستخدم بذكاء.
// 🚀 التحديثات المعمارية الصارمة (V18.9.1 - Deep Routing & FCM Target Patch):
// 1. FCM_MSG Decoupler 🛡️: استخراج البيانات المدفونة من إشعارات فايربيز التلقائية لمنع النقر الميت.
// 2. Subfolder Origin Fix 🛡️: استخدام (self.location.href) بدلاً من (origin) لحماية مسارات المجلدات الفرعية.
// 3. Double-Ping Shield 🛡️: إيقاف ثغرة الإشعارات المزدوجة المزعجة للمتصفح.
// 4. Data-Only Fallback 🛡️: رسم الإشعارات يدوياً حصرياً في حالة الرسائل الصامتة.
// ============================================================================

importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

// 🛡️ إعدادات قاعدة البيانات الأساسية
const firebaseConfig = {
    apiKey: "AIzaSyAKcMFLGday4sqp4wrbAIN3OEzH-kmhGK0",
    authDomain: "telecard-1.firebaseapp.com",
    projectId: "telecard-1",
    storageBucket: "telecard-1.firebasestorage.app",
    messagingSenderId: "698672838633",
    appId: "1:698672838633:web:743c8809615bd8308bfd78"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// 🚀 تفعيل فوري لضمان عدم بقاء العامل القديم عالقاً في الذاكرة
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());

// ============================================================================
// 📬 1. اعتراض الإشعار ورسمه على شاشة الهاتف (والمتجر مغلق/في الخلفية)
// ============================================================================
messaging.onBackgroundMessage((payload) => {
    console.log('[FCM SW] 🔔 نبضة إشعار في الخلفية تم استلامها.');
    
    // 🛡️ Double-Ping Shield: حماية ضد الإشعارات المزدوجة
    if (payload.notification) {
        console.log('[FCM SW] الإشعار مرئي. المتصفح يتولى الرسم تلقائياً.');
        return;
    }

    // 🛡️ Data-Only Fallback: رسم يدوي للرسائل الصامتة
    const dataPayload = payload.data || {};
    
    const notificationTitle = dataPayload.title || 'تنبيه من المتجر';
    const notificationBody = dataPayload.message || 'لديك تحديث جديد، تفضل بالدخول.';
    const notificationId = dataPayload.id ? String(dataPayload.id) : 'telecard-general-alert';
    
    const notificationOptions = {
        body: notificationBody,
        icon: dataPayload.image || 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
        badge: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
        dir: 'rtl',
        vibrate: [200, 100, 200],
        data: dataPayload, // البيانات تمرر مباشرة هنا للإشعار اليدوي
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
    
    // 🛡️ [الإصلاح المعماري 1]: فك تشفير بيانات فايربيز (FCM_MSG Trap)
    // إذا كان الإشعار مرسوماً تلقائياً من فايربيز، ستكون بياناتك مخفية داخل FCM_MSG
    let notificationData = event.notification.data || {};
    if (notificationData.FCM_MSG && notificationData.FCM_MSG.data) {
        notificationData = { ...notificationData, ...notificationData.FCM_MSG.data };
    }
    
    const actionType = String(notificationData.targetType || notificationData.jumpTarget || notificationData.type || '').trim();
    const actionId = String(notificationData.targetId || notificationData.id || '').trim();
    
    const defaultStoreUrl = new URL('./store.html', self.location.href).href;
    let targetUrl = (notificationData.click_action && typeof notificationData.click_action === 'string') 
                    ? notificationData.click_action 
                    : defaultStoreUrl;
    
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            
            // أ) إذا كان المتجر مفتوحاً في الخلفية
            const basePath = new URL('./', self.location.href).href;
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if (client.url.includes(basePath) && 'focus' in client) {
                    return client.focus().then(() => {
                        if (actionType && actionId && actionType !== 'undefined' && actionId !== 'undefined') {
                            client.postMessage({
                                type: 'FCM_NOTIFICATION_CLICK',
                                payload: { type: actionType, id: actionId }
                            });
                        }
                    });
                }
            }
            
            // ب) إذا كان المتجر مغلقاً تماماً، نفتحه في نافذة جديدة مع دمج المتغيرات بذكاء
            if (clients.openWindow) {
                if (actionType && actionId && actionType !== 'undefined' && actionId !== 'undefined') {
                    try {
                        // 🛡️ [الإصلاح المعماري 2]: استخدام self.location.href لحماية المجلدات الفرعية
                        const urlObj = new URL(targetUrl, self.location.href);
                        urlObj.searchParams.set('action', 'view');
                        urlObj.searchParams.set('type', actionType);
                        urlObj.searchParams.set('id', actionId);
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
