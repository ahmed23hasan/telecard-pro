// ============================================================================
// 📡 خدمة الإشعارات الخلفية (firebase-messaging-sw.js) - Admin Enterprise V1.0 🚀
// 🎯 الوظيفة: استقبال الإشعارات وعرضها للمدير حتى لو كانت لوحة التحكم مغلقة أو في الخلفية.
// ============================================================================

importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

// ⚙️ إعدادات فايربيز (مطابقة لإعداداتك في adminConfig.js[span_0](start_span)[span_0](end_span))
const firebaseConfig = {
    apiKey: "AIzaSyAKcMFLGday4sqp4wrbAIN3OEzH-kmhGK0",
    authDomain: "telecard-1.firebaseapp.com",
    projectId: "telecard-1",
    storageBucket: "telecard-1.firebasestorage.app",
    messagingSenderId: "698672838633",
    appId: "1:698672838633:web:743c8809615bd8308bfd78"
};

// 1. تهيئة فايربيز في بيئة Service Worker المعزولة
firebase.initializeApp(firebaseConfig);

// 2. استدعاء محرك الإشعارات
const messaging = firebase.messaging();

// 3. معالج الإشعارات في الخلفية (Background Message Handler)
messaging.onBackgroundMessage((payload) => {
    console.log('[Admin Radar] 📡 نبضة جديدة وصلت في الخلفية:', payload);

    const notificationTitle = payload.notification?.title || 'غرفة العمليات (TeleCard)';
    const notificationOptions = {
        body: payload.notification?.body || 'يوجد تحديث جديد يحتاج لمراجعتك.',
        // يمكنك تغيير هذا المسار لاحقاً ليطابق مسار أيقونة متجرك
        icon: 'https://cdn-icons-png.flaticon.com/512/6823/6823086.png', 
        data: payload.data || {},
        vibrate: [200, 100, 200, 100, 200, 100, 200], // نمط اهتزاز قوي لتنبيه المدير
        requireInteraction: true // إجبار الإشعار على البقاء في الشاشة حتى يتفاعل معه المدير
    };

    return self.registration.showNotification(notificationTitle, notificationOptions);
});

// 4. توجيه المدير عند النقر على الإشعار
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    
    // توجيه المدير إلى مسار لوحة الإدارة عند النقر على الإشعار
    const targetUrl = '/admin.html'; 

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            // إذا كانت لوحة الإدارة مفتوحة في تاب، قم بالانتقال إليها وتنشيطها
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if (client.url.includes('admin.html') && 'focus' in client) {
                    return client.focus();
                }
            }
            // إذا كانت مغلقة بالكامل، افتح تاب جديد
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});
