// ============================================================================
// 🔔 عامل خدمة الإشعارات (Firebase Messaging SW) - Enterprise V1.2 💎
// 🎯 الوظيفة: العمل في خلفية النظام لاستقبال الإشعارات وتوجيه المستخدم بذكاء.
// 🚀 التحديثات:
// 1. Subfolder Routing Fix 🛡️: إصلاح التوجيه ليعمل داخل المجلدات الفرعية ديناميكياً.
// 2. Safe URL Construction 🛡️: استخدام URL Object لمنع تكسر الروابط عند دمج الـ Query Params.
// 3. Client PostMessage: تخاطب ذكي مع الواجهة لفتح الطلب المحدد عند النقر.
// ============================================================================

importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

// 🛡️ إعدادات قاعدة البيانات
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
    console.log('[FCM SW] 🔔 نبضة إشعار في الخلفية:', payload);
    
    const dataPayload = payload.data || {};
    const notificationTitle = payload.notification?.title || dataPayload.title || 'تنبيه من المتجر';
    
    const notificationOptions = {
        body: payload.notification?.body || dataPayload.message || 'لديك تحديث جديد، تفضل بالدخول.',
        icon: payload.notification?.image || 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
        badge: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
        dir: 'rtl',
        vibrate: [200, 100, 200],
        data: dataPayload, 
        tag: dataPayload.id || 'telecard-general-alert', 
        requireInteraction: false
    };
    
    return self.registration.showNotification(notificationTitle, notificationOptions);
});

// ============================================================================
// 🖱️ 2. التوجيه الديناميكي المتقدم عند النقر على الإشعار
// ============================================================================
self.addEventListener('notificationclick', (event) => {
    event.notification.close(); 
    
    const notificationData = event.notification.data || {};
    
    // 🛡️ التحديث المعماري: بناء المسار بناءً على موقع ملف العامل الحالي لضمان دعم المجلدات الفرعية
    const defaultStoreUrl = new URL('./store.html', self.location.href).href;
    let targetUrl = notificationData.click_action || defaultStoreUrl;
    
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            
            // أ) إذا كان المتجر مفتوحاً في الخلفية (نفس المسار الأساسي)
            const basePath = new URL('./', self.location.href).href;
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if (client.url.includes(basePath) && 'focus' in client) {
                    client.focus();
                    
                    if (notificationData.targetId || notificationData.id) {
                        client.postMessage({
                            type: 'FCM_NOTIFICATION_CLICK',
                            payload: notificationData
                        });
                    }
                    return;
                }
            }
            
            // ب) إذا كان المتجر مغلقاً تماماً، نفتحه في نافذة جديدة مع دمج المتغيرات بذكاء
            if (clients.openWindow) {
                if (notificationData.targetId && notificationData.jumpTarget) {
                    try {
                        const urlObj = new URL(targetUrl);
                        urlObj.searchParams.set('action', 'view');
                        urlObj.searchParams.set('type', notificationData.jumpTarget);
                        urlObj.searchParams.set('id', notificationData.targetId);
                        targetUrl = urlObj.href;
                    } catch (e) {
                        // في حال فشل التحليل، نعتمد الرابط الأساسي كأمان
                        targetUrl = defaultStoreUrl;
                    }
                }
                return clients.openWindow(targetUrl);
            }
        })
    );
});
