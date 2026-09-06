// ============================================================================
// 🧠 خادم الخلفية (Service Worker - sw.js) - Enterprise PWA V21.4 💎
// 🎯 الوظيفة: تفعيل التثبيت كـ App، تشغيل المتجر Offline، وحماية الواجهة.
// 🚀 التحديثات المعمارية الصارمة (V21.4 - Redirect Deadlock Patch):
// 1. Redirect Deadlock Fix 🛡️: السماح بمرور التوجيهات (301/302) من استضافة Firebase دون إجهاض الطلب.
// 2. Soft-404 Guard 🛡️: منع تخزين صفحات الخطأ (HTML) مكان ملفات (JS/CSS).
// 3. Firebase Storage Guard: إعفاء مسارات فايربيز من الكاش لمنع استنزاف الذاكرة.
// ============================================================================

const CACHE_NAME = 'telecard-static-v21.4'; 

// 🛡️ الملفات الأساسية فقط
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
      console.log('📦 [Service Worker] جاري تخزين واجهة المتجر...');
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
          if (cacheName !== CACHE_NAME && cacheName.startsWith('telecard-static-')) {
            console.log(`🧹 [Service Worker] تنظيف كاش قديم: ${cacheName}`);
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
  
  // 🛡️ القاعدة الذهبية: تجاهل كافة مسارات فايربيس (قاعدة بيانات + صور + مصادقة)
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
      fetch(request)
        .then((response) => {
          // 🛡️ التحديث المعماري (V21.4):
          // السماح بمرور الاستجابة دائماً للمتصفح لتنفيذ الـ Redirects،
          // ولكننا نقوم بتخزينها في الكاش *فقط* إذا كانت 200 OK.
          if (response.status === 200) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response; 
        })
        .catch(() => {
          return caches.match(request, cacheMatchOptions).then(cachedResponse => {
              if (cachedResponse) return cachedResponse;
              // توجيه أوفلاين ذكي
              if (url.pathname.includes('login')) return caches.match('./login.html', { ignoreSearch: true });
              if (url.pathname.includes('signup')) return caches.match('./signup.html', { ignoreSearch: true });
              return caches.match('./store.html', { ignoreSearch: true });
          });
        })
    );
    return;
  }
  
  event.respondWith(
    caches.match(request, cacheMatchOptions).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse; 

      return fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          
          const contentType = networkResponse.headers.get('content-type') || '';
          const isJsRequest = url.pathname.endsWith('.js');
          const isCssRequest = url.pathname.endsWith('.css');
          
          if ((isJsRequest || isCssRequest) && contentType.includes('text/html')) {
              console.warn(`🚨 [Cache Guard] تم حظر تسميم الكاش.`);
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
