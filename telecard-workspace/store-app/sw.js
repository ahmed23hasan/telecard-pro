// ============================================================================
// 🧠 خادم الخلفية (Service Worker - sw.js) - Enterprise PWA V3.1 💎
// 🎯 الوظيفة: تفعيل التثبيت كـ App، تشغيل المتجر Offline، وحماية الواجهة.
// 🚀 التحديثات المعمارية الصارمة (V3.1):
// 1. Cache Poisoning Fix: كسر الكاش القديم المسموم برفع رقم الإصدار.
// 2. Query String Ignorance: تفعيل {ignoreSearch: true} لتجاهل متغيرات الروابط (مثل ?v=22).
// 3. Robust Offline Routing: توجيه ذكي وآمن لصفحات الـ HTML المخبأة.
// ============================================================================

// 🚀 تم رفع الإصدار لكسر الكاش القديم وإجبار المتصفح على سحب الهيكلة الجديدة
const CACHE_NAME = 'telecard-static-v3.1'; 

// 📦 الملفات الثابتة النواة (تم إدراج كافة الـ Modules والصفحات لمنع انهيار النظام في الأوفلاين)
const CORE_ASSETS = [
  './',
  './index.html',
  './store.html',
  './login.html',
  './signup.html',
  './style.css',
  './manifest.json',
  './script.js',
  './config.js',
  './utils.js',
  './dataManager.js',
  './renderManager.js',
  './components.js',
  './core/firebaseAdapter.js',
  './core/financialEngine.js',
  './core/renderHelpers.js',
  './ui/uiManager.js',
  './ui/uiCore.js',
  './ui/uiFinance.js',
  './ui/uiAuth.js',
  './ui/uiBuilders.js'
];

// =========================================================
// 1️⃣ حدث التثبيت (Install) - آمن ضد الأخطاء الفردية للملفات
// =========================================================
self.addEventListener('install', (event) => {
  // إجبار المتصفح على تفعيل الخادم الجديد فوراً
  self.skipWaiting();
  
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log('📦 [Service Worker] جاري تخزين واجهة المتجر والصفحات الأساسية...');
      
      // 🛡️ التخزين الآمن: تحميل الملفات فرادى لمنع انهيار العملية (All-or-Nothing Fix)
      for (const asset of CORE_ASSETS) {
        try {
          await cache.add(asset);
        } catch (error) {
          console.warn(`⚠️ [Service Worker] تعذر تخزين الملف (قد يكون مفقوداً): ${asset}`);
        }
      }
    })
  );
});

// =========================================================
// 2️⃣ حدث التفعيل (Activate) - تنظيف الكاش القديم
// =========================================================
self.addEventListener('activate', (event) => {
  self.clients.claim();
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // مسح أي كاش يحمل اسماً قديماً لتفريغ مساحة هاتف العميل والتخلص من الكاش المعطوب
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
  
  // 🛡️ استثناء استدعاءات Firestore و Cloud Functions الصريحة
  // نتركها لمدير بيانات فايربيز الداخلي لكي لا تفسد البيانات
  if (url.hostname.includes('firestore.googleapis.com') ||
      url.hostname.includes('cloudfunctions.net') ||
      url.pathname.startsWith('/_/')) {
    return;
  }
  
  // تجاهل أي طلب ليس GET (مثل POST أو PUT لرفع الصور)
  if (request.method !== 'GET') return;
  
  // 🌟 استراتيجية 1: ملفات الـ HTML (التنقل)
  // Network-First with Offline Fallback
  if (request.mode === 'navigate' || request.headers.get('accept').includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => {
          // 🚀 التوجيه الذكي في الأوفلاين (مع تجاهل الـ Query Parameters)
          return caches.match(request, { ignoreSearch: true }).then(cachedResponse => {
              return cachedResponse || caches.match('./store.html', { ignoreSearch: true }) || caches.match('./index.html', { ignoreSearch: true });
          });
        })
    );
    return;
  }
  
  // 🌟 استراتيجية 2: الستايلات، السكريبتات، الصور، ومكتبات فايربيز (gstatic)
  // Stale-While-Revalidate: يعرض الكاش فوراً للسرعة، ويحدّث في الخلفية
  event.respondWith(
    // 🛡️ إضافة { ignoreSearch: true } هنا هي التي ستحل مشكلة style.css?v=22
    caches.match(request, { ignoreSearch: true }).then((cachedResponse) => {
      
      const fetchPromise = fetch(request).then((networkResponse) => {
        // تخزين الاستجابات السليمة أو المبهمة (Opaque) القادمة من CDNs مثل gstatic
        if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return networkResponse;
      }).catch((err) => {
        // الفشل صامت هنا لأننا سنعرض النسخة المخزنة للعميل
      });

      // إرجاع الكاش إن وُجد فوراً، وإلا انتظار نتيجة الجلب الشبكي
      return cachedResponse || fetchPromise;
    })
  );
});
