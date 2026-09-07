// ============================================================================
// 🧠 خادم الخلفية (Service Worker - sw.js) - Enterprise PWA V22.1 💎
// 🎯 الوظيفة: تفعيل التثبيت كـ App، تشغيل المتجر Offline، وحماية الواجهة.
// 🚀 التحديثات المعمارية الصارمة (V22.1 - Lie-Fi White Screen Patch):
// 1. Network Timeout Guard 🛡️: قاطع تيار (4 ثوانٍ) لمنع الشاشة البيضاء في الإنترنت الوهمي/المتقطع (Lie-Fi).
// 2. Direct CDN Inject 🛡️: استدعاء مكتبة dom-to-image-more مباشرة من خوادم cdnjs وتخزينها.
// 3. Hard Cache Flush 🛡️: رفع الإصدار إلى V22.1 لكسر الكاش القديم وتحديث الأصول فوراً.
// 4. Soft-404 Guard 🛡️: منع تخزين صفحات الخطأ (HTML) مكان ملفات (JS/CSS).
// ============================================================================

const CACHE_NAME = 'telecard-static-v22.1'; 

// 🛡️ الملفات الأساسية فقط (تم وضع الرابط المباشر للمكتبة هنا)
const CORE_ASSETS = [
  './',
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
  './qrcode.min.js', 
  'https://cdnjs.cloudflare.com/ajax/libs/dom-to-image-more/3.10.2/dom-to-image-more.min.js',
  './core/firebaseAdapter.js',
  './core/financialEngine.js',
  './core/renderHelpers.js',
  './ui/uiManager.js',
  './ui/uiCore.js',
  './ui/uiFinance.js',
  './ui/uiAuth.js',
  './ui/uiBuilders.js'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log('📦 [Service Worker] جاري تخزين واجهة المتجر وتحديث الأكواد...');
      for (const asset of CORE_ASSETS) {
        try {
          await cache.add(asset);
        } catch (error) {
          console.warn(`⚠️ [Service Worker] تعذر تخزين الملف: ${asset}`);
        }
      }
    })
  );
});

self.addEventListener('activate', (event) => {
  self.clients.claim();
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // 🧹 تدمير أي كاش قديم لا يحمل اسم الإصدار الحالي
          if (cacheName !== CACHE_NAME && cacheName.startsWith('telecard-static-')) {
            console.log(`🧹 [Service Worker] تنظيف كاش قديم ومسموم: ${cacheName}`);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// استقبال أمر التحديث الإجباري من الواجهة
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
      self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  
  // 🛡️ تجاهل كافة مسارات فايربيس وقواعد البيانات لتمريرها مباشرة للإنترنت
  if (url.hostname.includes('firestore.googleapis.com') ||
      url.hostname.includes('firebasestorage.googleapis.com') ||
      url.hostname.includes('identitytoolkit.googleapis.com') ||
      url.hostname.includes('cloudfunctions.net') ||
      url.pathname.startsWith('/_/')) {
    return;
  }
  
  if (request.method !== 'GET') return;
  
  const isNavigate = request.mode === 'navigate' || request.headers.get('accept').includes('text/html');
  const cacheMatchOptions = isNavigate ? { ignoreSearch: true } : {};
  
  if (isNavigate) {
    event.respondWith(
      // 🛡️ [الإصلاح المعماري]: قاطع تيار زمني (Timeout) مدته 4 ثوانٍ لإنقاذ العميل من الشاشة البيضاء في الإنترنت المتقطع
      new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => reject(new Error('Network Timeout')), 4000);
        
        fetch(request).then((response) => {
          clearTimeout(timeoutId);
          if (response.status === 200) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          resolve(response); 
        }).catch((err) => {
          clearTimeout(timeoutId);
          reject(err);
        });
      })
      .catch(() => {
        // السقوط الآمن للكاش عند انقطاع أو تأخر الشبكة (Offline Mode)
        return caches.match(request, cacheMatchOptions).then(cachedResponse => {
            if (cachedResponse) return cachedResponse;
            if (url.pathname.includes('login')) return caches.match('./login.html', { ignoreSearch: true });
            if (url.pathname.includes('signup')) return caches.match('./signup.html', { ignoreSearch: true });
            return caches.match('./store.html', { ignoreSearch: true });
        });
      })
    );
    return;
  }
  
  // استراتيجية الملفات الثابتة (Stale-While-Revalidate & Cache First)
  event.respondWith(
    caches.match(request, cacheMatchOptions).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse; 

      return fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          
          const contentType = networkResponse.headers.get('content-type') || '';
          const isJsRequest = url.pathname.endsWith('.js');
          const isCssRequest = url.pathname.endsWith('.css');
          
          // 🛡️ Soft-404 Guard: منع تخزين صفحة خطأ كودها 200 مكان ملفات ستايل أو جافاسكريبت
          if ((isJsRequest || isCssRequest) && contentType.includes('text/html')) {
              console.warn(`🚨 [Cache Guard] تم حظر تسميم الكاش للملف: ${url.pathname}`);
              return networkResponse; 
          }

          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return networkResponse;
      }).catch(() => {});
    })
  );
});
