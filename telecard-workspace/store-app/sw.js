// ============================================================================
// 🧠 خادم الخلفية (Service Worker - sw.js) - Enterprise PWA V21.3 💎
// 🎯 الوظيفة: تفعيل التثبيت كـ App، تشغيل المتجر Offline، وحماية الواجهة.
// 🚀 التحديثات المعمارية الصارمة (V21.3 - Cache Poisoning & Soft-404 Patch):
// 1. Soft-404 Guard 🛡️: منع تخزين صفحات الخطأ (HTML) مكان ملفات (JS/CSS) لحماية المتجر من الشاشة البيضاء.
// 2. Navigation Error Guard 🛡️: رفض تخزين الاستجابات الفاشلة (404/500) وتقديم صفحات الأوفلاين فوراً بدلاً منها.
// 3. Firebase Storage Guard: إعفاء صور فايربيس وأنظمة المصادقة من الكاش لمنع امتلاء هواتف العملاء.
// 4. Local QR Integration: إضافة مكتبة قفل الـ 2FA للكاش المحلي لتعمل بدون إنترنت.
// ============================================================================

const CACHE_NAME = 'telecard-static-v21.3'; 

// 🛡️ الملفات الأساسية فقط (لا تضع أي روابط ديناميكية هنا)
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
  './qrcode.min.js', // 🛡️ تمت إضافته ليعمل الأمان بدون إنترنت
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

// 🛡️ التحديث المعماري: استقبال أمر التحديث الإجباري من script.js
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
      self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  
  // 🛡️ القاعدة الذهبية لسلامة التخزين: تجاهل كافة مسارات فايربيس (قاعدة بيانات + صور + مصادقة)
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
          // 🛡️ Navigation Error Guard: التأكد من نجاح الطلب (200 OK) قبل التخزين
          if (!response.ok) {
              throw new Error('Server returned non-200 status');
          }
          
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => {
          return caches.match(request, cacheMatchOptions).then(cachedResponse => {
              // 🛡️ توجيه أوفلاين ذكي: إذا طلب صفحة تسجيل الدخول وهو أوفلاين، نعطيه login، وإلا store
              if (cachedResponse) return cachedResponse;
              if (url.pathname.includes('login.html')) return caches.match('./login.html', { ignoreSearch: true });
              if (url.pathname.includes('signup.html')) return caches.match('./signup.html', { ignoreSearch: true });
              return caches.match('./store.html', { ignoreSearch: true });
          });
        })
    );
    return;
  }
  
  event.respondWith(
    caches.match(request, cacheMatchOptions).then((cachedResponse) => {
      // ⚡ O(1) Cache-First للأصول الثابتة
      if (cachedResponse) return cachedResponse; 

      return fetch(request).then((networkResponse) => {
        // نرفض تخزين الـ opaque لكي لا تتضخم الذاكرة بملفات لا نعرف حجمها
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          
          const contentType = networkResponse.headers.get('content-type') || '';
          
          // 🛡️ Soft-404 Guard: حماية الكاش من التسمم إذا أعاد السيرفر HTML بدلاً من كود برمجي
          const isJsRequest = url.pathname.endsWith('.js');
          const isCssRequest = url.pathname.endsWith('.css');
          
          if ((isJsRequest || isCssRequest) && contentType.includes('text/html')) {
              console.warn(`🚨 [Cache Guard] تم حظر تسميم الكاش: السيرفر أعاد HTML بدلاً من ${isJsRequest ? 'JS' : 'CSS'}`);
              return networkResponse; // نمرر الملف المعطوب لكن لا نخزنه أبداً لحماية الزيارات القادمة
          }

          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return networkResponse;
      }).catch(() => {});
    })
  );
});
