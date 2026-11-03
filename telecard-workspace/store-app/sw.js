// ============================================================================
// 🧠 خادم الخلفية الموحد (Service Worker - sw.js) - Enterprise PWA V24.1.0 💎
// 🎯 الوظيفة: تفعيل التثبيت كـ App، تشغيل المتجر Offline، ومعالجة إشعارات FCM بالخلفية.
// 🚀 التحديثات المعمارية الصارمة (V24.1.0 - Token Refresh Bypass & QR Parity):
// 1. Auth Token Bypass 🔐: استثناء securetoken.googleapis.com لمنع اعتراض تجديد التوكن وانقطاع الجلسة.
// 2. Offline QR Support 📱: الإبقاء على qrcode.min.js في الكاش لضمان توليد رموز 2FA دون إنترنت.
// 3. Local Asset Query Ignore 🔍: تفعيل ignoreSearch للأصول المحلية لمطابقة (style.css?v=...) مع الكاش.
// 4. Safe Accept Header Guard 🛡️: تحصين قراءة هيدر accept ضد القيم الفارغة (null).
// ============================================================================

try {
  importScripts('./firebase-messaging-sw.js');
} catch (e) {
  console.warn('⚠️ [Service Worker] تعذر تحميل وحدة إشعارات الخلفية:', e);
}

const CACHE_NAME = 'telecard-static-v27.0';

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
          if (cacheName !== CACHE_NAME && cacheName.startsWith('telecard-static-')) {
            console.log(`🧹 [Service Worker] تنظيف كاش قديم: ${cacheName}`);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  
  // 🛡️ استثناء خدمات جوجل السحابية والمصادقة الحساسة لمنع اعتراضها
  if (url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('firebasestorage.googleapis.com') ||
    url.hostname.includes('identitytoolkit.googleapis.com') ||
    url.hostname.includes('securetoken.googleapis.com') ||
    url.hostname.includes('cloudfunctions.net') ||
    url.pathname.startsWith('/_/')) {
    return;
  }
  
  if (request.method !== 'GET') return;
  
  const acceptHeader = request.headers.get('accept') || '';
  const isNavigate = request.mode === 'navigate' || acceptHeader.includes('text/html');
  const isLocalAsset = url.origin === self.location.origin;
  const cacheMatchOptions = (isNavigate || isLocalAsset) ? { ignoreSearch: true } : {};
  
  if (isNavigate) {
    event.respondWith(
      new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => reject(new Error('Network Timeout')), 8000);
        
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
  
  event.respondWith(
    caches.match(request, cacheMatchOptions).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;
      
      return fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          
          const contentType = networkResponse.headers.get('content-type') || '';
          const isJsRequest = url.pathname.endsWith('.js');
          const isCssRequest = url.pathname.endsWith('.css');
          
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