// ============================================================================
// 🧠 خادم الخلفية (Service Worker - sw.js) - Enterprise PWA V3.2 💎
// 🎯 الوظيفة: تفعيل التثبيت كـ App، تشغيل المتجر Offline، وحماية الواجهة.
// 🚀 التحديثات المعمارية الصارمة (V3.2):
// 1. Cache Poisoning Fix: كسر الكاش القديم المسموم برفع رقم الإصدار.
// 2. Query String Ignorance: تفعيل {ignoreSearch: true} لتجاهل متغيرات الروابط (مثل ?v=22).
// 3. Robust Offline Routing: إزالة index.html والاعتماد الكلي والآمن على store.html.
// ============================================================================

const CACHE_NAME = 'telecard-static-v3.2'; 

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
      console.log('📦 [Service Worker] جاري تخزين واجهة المتجر والصفحات الأساسية...');
      
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

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  
  if (url.hostname.includes('firestore.googleapis.com') ||
      url.hostname.includes('cloudfunctions.net') ||
      url.pathname.startsWith('/_/')) {
    return;
  }
  
  if (request.method !== 'GET') return;
  
  if (request.mode === 'navigate' || request.headers.get('accept').includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => {
          return caches.match(request, { ignoreSearch: true }).then(cachedResponse => {
              return cachedResponse || caches.match('./store.html', { ignoreSearch: true });
          });
        })
    );
    return;
  }
  
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cachedResponse) => {
      
      const fetchPromise = fetch(request).then((networkResponse) => {
        if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return networkResponse;
      }).catch((err) => {});

      return cachedResponse || fetchPromise;
    })
  );
});
