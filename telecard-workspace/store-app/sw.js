// ============================================================================
// 🧠 خادم الخلفية (Service Worker - sw.js) - Enterprise PWA V1.0 💎
// 🎯 الوظيفة: تفعيل التثبيت كـ App، تشغيل المتجر Offline، وحماية الواجهة.
// 🚀 التحذير الهندسي: هذا الملف يتجاهل عمليات Firebase عمداً لعدم كسر الـ DataManager.
// ============================================================================

const CACHE_NAME = 'telecard-static-v1.1'; // تم تحديث رقم الإصدار لضمان تجديد الكاش

// 📦 الملفات الثابتة التي نريد تخزينها ليفتح المتجر بدون إنترنت (Zero-Latency UI)
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/store.html',  // ✅ واجهة المتجر الرئيسية
  '/login.html',  // ✅ صفحة تسجيل الدخول
  '/signup.html', // ✅ صفحة إنشاء الحساب
  // أضف هنا مسار ملفات الستايل والصور الأساسية مستقبلاً، مثلاً:
  // '/assets/css/style.css',
  // '/assets/images/logo.png' 
];

// =========================================================
// 1️⃣ حدث التثبيت (Install) - يحدث مرة واحدة عند فتح المتجر لأول مرة
// =========================================================
self.addEventListener('install', (event) => {
  // إجبار المتصفح على تفعيل الخادم الجديد فوراً دون انتظار إغلاق التبويبة
  self.skipWaiting();
  
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('📦 [Service Worker] جاري تخزين واجهة المتجر والصفحات الأساسية...');
      return cache.addAll(STATIC_ASSETS);
    }).catch(err => console.warn('SW Pre-cache Warning:', err))
  );
});

// =========================================================
// 2️⃣ حدث التفعيل (Activate) - تنظيف الكاش القديم إذا تغير رقم الإصدار
// =========================================================
self.addEventListener('activate', (event) => {
  // السيطرة على كل النوافذ المفتوحة فوراً
  self.clients.claim();
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // إذا وجد كاش قديم يخصنا، نقوم بتدميره
          if (cacheName !== CACHE_NAME && cacheName.startsWith('telecard-static-')) {
            console.log(`🧹 [Service Worker] تنظيف كاش قديم: ${cacheName}`);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// =========================================================
// 3️⃣ حدث الجلب (Fetch) - عصب النظام والمقاطعة الذكية
// =========================================================
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  
  // 🛡️ الاستثناء الأول: تجاهل روابط API وفايربيس تماماً! (لأن DataManager يديرها)
  if (url.hostname.includes('googleapis.com') ||
    url.hostname.includes('firebase') ||
    url.hostname.includes('gstatic.com') ||
    url.pathname.startsWith('/_/')) {
    return; // ندع المتصفح وفايربيس يتعاملان معها بشكل طبيعي
  }
  
  // 🛡️ الاستثناء الثاني: تجاهل أي طلب ليس GET (مثل POST أو PUT لرفع الصور)
  if (request.method !== 'GET') return;
  
  // 🌟 استراتيجية 1: ملفات الـ HTML (نجلب من السيرفر أولاً، وإذا انقطع النت نجلب الكاش)
  // هذا يضمن أن العميل دائماً لديه أحدث نسخة من واجهة المستخدم.
  if (request.mode === 'navigate' || request.headers.get('accept').includes('text/html')) {
    event.respondWith(
      fetch(request)
      .then((response) => {
        // تحديث الكاش بالنسخة الجديدة في الخلفية
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        return response;
      })
      .catch(() => {
        // إذا انقطع النت، نعرض آخر نسخة HTML محفوظة!
        return caches.match(request);
      })
    );
    return;
  }
  
  // 🌟 استراتيجية 2: ملفات الـ CSS والـ JS والصور العادية 
  // استراتيجية (Stale-While-Revalidate): نعرض الكاش فوراً للسرعة، ونحدث في الخلفية
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // جلب أحدث نسخة من السيرفر بصمت وتحديث الكاش للمرة القادمة
        fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(request, networkResponse.clone()));
          }
        }).catch(() => {}); // تجاهل الخطأ إذا كان أوفلاين
        
        return cachedResponse; // إرجاع النسخة السريعة للعميل فوراً
      }
      
      // إذا لم يكن في الكاش، نجلبه من الإنترنت ونحفظه
      return fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return networkResponse;
      }).catch(() => {
        // يمكن هنا إرجاع صورة "انقطع الاتصال" إذا أردت
      });
    })
  );
});
