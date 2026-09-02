// ============================================================================
// 🔔 عامل خدمة الإشعارات (Firebase Messaging Service Worker) - Enterprise V1.0
// 🎯 الوظيفة: العمل في خلفية النظام (Background Thread) لاستقبال وعرض الإشعارات
// ============================================================================

// استيراد مكتبات فايربيز الأساسية المخصصة لعامل الخدمة
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

// 🛡️ إعدادات قاعدة البيانات الخاصة بمتجر Telecard
const firebaseConfig = {
    apiKey: "AIzaSyAKcMFLGday4sqp4wrbAIN3OEzH-kmhGK0",
    authDomain: "telecard-1.firebaseapp.com",
    projectId: "telecard-1",
    storageBucket: "telecard-1.firebasestorage.app",
    messagingSenderId: "698672838633",
    appId: "1:698672838633:web:743c8809615bd8308bfd78"
};

// تهيئة فايربيز في الخلفية
firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// ============================================================================
// 📬 1. اعتراض الإشعار ورسمه على شاشة الهاتف (والمتجر مغلق)
// ============================================================================
messaging.onBackgroundMessage((payload) => {
    console.log('[Service Worker] 🔔 تم استلام نبضة إشعار في الخلفية:', payload);
    
    // استخراج البيانات من السيرفر وتجهيز قالب الإشعار
    const notificationTitle = payload.notification?.title || 'إشعار من المتجر';
    const notificationOptions = {
        body: payload.notification?.body || 'لديك تحديث جديد بخصوص طلبك.',
        // الأيقونة التي ستظهر بجانب الإشعار (يُفضل لاحقاً تغييرها لرابط لوجو متجرك)
        icon: payload.notification?.image || 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
        // أيقونة شريط الإشعارات العلوي (يجب أن تكون شفافة باللون الأبيض)
        badge: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
        dir: 'rtl', // ضبط اتجاه النص للعربية
        vibrate: [200, 100, 200], // نمط اهتزاز الهاتف عند وصول الإشعار
        data: payload.data, // حفظ بيانات إضافية (مثل رقم الطلب) لنقلها عند النقر
        requireInteraction: false // السماح للإشعار بالاختفاء تلقائياً
    };

    // أمر لنظام التشغيل (Android/Windows) برسم الإشعار
    return self.registration.showNotification(notificationTitle, notificationOptions);
});

// ============================================================================
// 🖱️ 2. توجيه العميل بذكاء عند النقر على الإشعار
// ============================================================================
self.addEventListener('notificationclick', (event) => {
    // إغلاق الإشعار من شاشة الهاتف بمجرد النقر عليه
    event.notification.close();
    
    // المسار الذي سيتم فتحه (يجب أن يتطابق مع مسار موقعك الفعلي)
    const targetUrl = '/telecard-workspace/store-app/store.html'; 
    
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            // أ) إذا كان المتجر مفتوحاً في الخلفية، اجلبه للأمام (Focus)
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if (client.url.includes('store.html') && 'focus' in client) {
                    return client.focus();
                }
            }
            // ب) إذا كان المتجر مغلقاً تماماً، قم بفتحه في نافذة جديدة
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});
