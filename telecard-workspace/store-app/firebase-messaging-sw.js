// ============================================================================
// 🔔 عامل خدمة الإشعارات (Firebase Messaging SW) - Enterprise V18.9.0 💎
// 🎯 الوظيفة: العمل في خلفية النظام لاستقبال الإشعارات وتوجيه المستخدم بذكاء.
// 🚀 التحديثات المعمارية الصارمة (V18.9.0 - FCM Integrity Patch):
// 1. Double-Ping Shield 🛡️: إيقاف ثغرة الإشعارات المزدوجة المزعجة التي تحدث عندما يرسم المتصفح والكود نفس الإشعار.
// 2. Data-Only Fallback 🛡️: رسم الإشعارات يدوياً حصرياً في حالة الرسائل الصامتة (Data-Only Payload).
// 3. Stringified Payload Guard 🛡️: تأمين قراءة المتغيرات كنصوص نقية لمنع تحطم الروابط عند التوجيه.
// 4. Subfolder Routing Fix 🛡️: إصلاح التوجيه ليعمل داخل المجلدات الفرعية ديناميكياً باستخدام URL Object.
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
    
    // 🛡️ Double-Ping Shield: حماية ضد الإشعارات المزدوجة!
    // إذا أرسل السيرفر كائن (notification)، المتصفح سيتولى رسمه تلقائياً بصوت وصورة.
    // لا يجب أن نتدخل يدوياً هنا لتجنب إزعاج العميل بإشعارين لنفس الطلب.
    if (payload.notification) {
        console.log('[FCM SW] الإشعار يحتوي على واجهة مرئية. المتصفح يتولى الرسم تلقائياً.');
        return;
    }

    // 🛡️ Data-Only Fallback: نرسم الإشعار يدوياً فقط إذا كانت الرسالة "صامتة" (تحتوي على Data فقط)
    // وتتطلب من العميل الانتباه لتحديث مهم.
    const dataPayload = payload.data || {};
    
    // تأمين جلب النصوص (FCM Data Payloads are strictly Strings)
    const notificationTitle = dataPayload.title || 'تنبيه من المتجر';
    const notificationBody = dataPayload.message || 'لديك تحديث جديد، تفضل بالدخول.';
    const notificationId = dataPayload.id ? String(dataPayload.id) : 'telecard-general-alert';
    
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
    
    const notificationData = event.notification.data || {};
    
    // 🛡️ Stringified Payload Guard: التأكد من تحويل المعرفات لنصوص صريحة
    const actionType = String(notificationData.targetType || notificationData.jumpTarget || notificationData.type || '').trim();
    const actionId = String(notificationData.targetId || notificationData.id || '').trim();
    
    // بناء المسار بناءً على موقع ملف العامل الحالي لضمان دعم المجلدات الفرعية
    const defaultStoreUrl = new URL('./store.html', self.location.href).href;
    let targetUrl = (notificationData.click_action && typeof notificationData.click_action === 'string') 
                    ? notificationData.click_action 
                    : defaultStoreUrl;
    
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            
            // أ) إذا كان المتجر مفتوحاً في الخلفية (في نفس النطاق)
            const basePath = new URL('./', self.location.href).href;
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if (client.url.includes(basePath) && 'focus' in client) {
                    client.focus();
                    
                    // التخاطب الذكي مع الواجهة بمتغيرات موحدة
                    if (actionType && actionId && actionType !== 'undefined' && actionId !== 'undefined') {
                        client.postMessage({
                            type: 'FCM_NOTIFICATION_CLICK',
                            payload: { type: actionType, id: actionId }
                        });
                    }
                    return;
                }
            }
            
            // ب) إذا كان المتجر مغلقاً تماماً، نفتحه في نافذة جديدة مع دمج المتغيرات بذكاء
            if (clients.openWindow) {
                if (actionType && actionId && actionType !== 'undefined' && actionId !== 'undefined') {
                    try {
                        const urlObj = new URL(targetUrl);
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
