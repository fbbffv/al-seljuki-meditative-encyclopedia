/*
  عامل خدمة موسوعة السلجوقي
  - يُخزّن الصفحة الرئيسية والأيقونات لتعمل الموسوعة بلا إنترنت.
  - يُخزّن كل مقال تلقائياً بمجرد أن يزوره المستخدم مرة واحدة وهو متصل بالإنترنت.
  - عند كل زيارة جديدة وبوجود اتصال، يتحقق من وجود نسخة أحدث ويُحدّثها بصمت
    (فلا حاجة لإعادة تحميل التطبيق يدوياً، ولا لإشعارات مزعجة).
*/

const CACHE_VERSION = 'suljuki-v1';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.png',
  './sheikh.png'
];

// عند التثبيت: خزّن الهيكل الأساسي للموسوعة
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      cache.addAll(CORE_ASSETS).catch(() => { /* تجاهل أي ملف غير موجود بعد */ })
    )
  );
});

// عند التفعيل: احذف أي نسخة كاش قديمة من إصدار سابق
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// استراتيجية الجلب:
// - الصفحة الرئيسية: الشبكة أولاً (لتظهر أحدث المقالات فوراً عند الاتصال)، وسقوط للكاش عند انقطاع النت.
// - كل شيء آخر (المقالات، الصور، الأيقونات): الكاش أولاً للسرعة والعمل بلا إنترنت،
//   مع تحديث الكاش في الخلفية دائماً كي تكون الزيارة القادمة محدَّثة تلقائياً.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // لا نتدخل في طلبات خارجية (خطوط، تحليلات...)

  const isHomePage =
    req.mode === 'navigate' ||
    url.pathname.endsWith('/') ||
    url.pathname.endsWith('/index.html');

  if (isHomePage) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, res.clone()));
          return res;
        })
        .catch(() =>
          caches.match(req).then((cached) => cached || caches.match('./index.html'))
        )
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, res.clone()));
          }
          return res;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
