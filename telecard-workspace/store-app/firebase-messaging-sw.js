// ============================================================================
// 🔔 عامل خدمة الإشعارات (Firebase Messaging SW) - Enterprise V1.1 💎
// 🎯 الوظيفة: العمل في خلفية النظام لاستقبال الإشعارات وتوجيه المستخدم بذكاء.
// 🚀 التحديثات:
// 1. Dynamic Routing: إلغاء المسارات الميتة والاعتماد على location.origin.
// 2. Client PostMessage: تخاطب ذكي مع الواجهة لفتح الطلب المحدد عند النقر.
// 3. Notification Tagging: تجميع الإشعارات المكررة لمنع إزعاج العميل (Spam).
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
        badge: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png', // أيقونة بيضاء شفافة للشريط العلوي
        dir: 'rtl',
        vibrate: [200, 100, 200],
        data: dataPayload, // 🛡️ الاحتفاظ ببيانات السيرفر (مثل رقم الطلب) لنقلها عند النقر
        tag: dataPayload.id || 'telecard-general-alert', // لمنع تكدس الإشعارات لنفس الطلب
        requireInteraction: false
    };
    
    return self.registration.showNotification(notificationTitle, notificationOptions);
});

// ============================================================================
// 🖱️ 2. التوجيه الديناميكي المتقدم عند النقر على الإشعار
// ============================================================================
self.addEventListener('notificationclick', (event) => {
    event.notification.close(); // إغلاق الإشعار فوراً لتجربة سريعة
    
    const notificationData = event.notification.data || {};
    
    // 🛡️ التوجيه الآمن: استخدام الجذر الأساسي للموقع أياً كان الدومين
    // وإذا أرسل السيرفر رابطاً معيناً (click_action) نستخدمه.
    let targetUrl = notificationData.click_action || self.location.origin + '/';
    
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            
            // أ) إذا كان المتجر مفتوحاً في الخلفية، نجذبه للأمام
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    client.focus();
                    
                    // 🧠 التخاطب الذكي: إخبار الواجهة (UI) بالإشعار لتقوم بفتح تفاصيل الطلب فوراً
                    if (notificationData.targetId || notificationData.id) {
                        client.postMessage({
                            type: 'FCM_NOTIFICATION_CLICK',
                            payload: notificationData
                        });
                    }
                    return;
                }
            }
            
            // ب) إذا كان المتجر مغلقاً تماماً، نفتحه في نافذة جديدة
            // مع تمرير البيانات في الرابط (Query Params) لتقرأها الواجهة عند الإقلاع
            if (clients.openWindow) {
                if (notificationData.targetId && notificationData.jumpTarget) {
                    targetUrl += `?action=view&type=${notificationData.jumpTarget}&id=${notificationData.targetId}`;
                }
                return clients.openWindow(targetUrl);
            }
        })
    );
});