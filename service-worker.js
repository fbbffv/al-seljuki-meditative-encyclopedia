/*
  عامل خدمة موسوعة السلجوقي — الإصدار الثاني (مُصحَّح)
  - يعرض الصفحة الرئيسية فوراً من الذاكرة المحفوظة (سرعة فورية)، ثم يُحدّثها بصمت في الخلفية عند توفر الإنترنت.
  - يُميّز بدقة بين الصفحة الرئيسية والمقالات، بحيث تُفتح كل المقالات المحفوظة سابقاً بلا إنترنت.
  - كل مقال يزوره المستخدم مرة واحدة (بإنترنت) يُصبح متاحاً دائماً بعدها بلا إنترنت.
*/

const CACHE_VERSION = 'suljuki-v17';
const MOST_READ_CACHE = 'suljuki-most-read-persistent-v1';
const MOST_READ_PATHS = ['/qa/most-read.json', '/articles/most-read.json'];
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.png',
  './sheikh.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      cache.addAll(CORE_ASSETS).catch(() => {})
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key.startsWith('suljuki-v') && key !== CACHE_VERSION).map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// دالة مساعدة: هل هذا الطلب هو تحديداً الصفحة الرئيسية؟ (وليس أي انتقال آخر كفتح مقال)
function isHomePageRequest(url) {
  return url.pathname.endsWith('/') || url.pathname.endsWith('/index.html');
}


// تطبيق التحديث فوراً عند طلب الصفحة الرئيسية.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // قوائم الأكثر قراءة: الشبكة أولاً، مع الاحتفاظ بآخر نسخة ناجحة دائماً.
  if (MOST_READ_PATHS.some((path) => url.pathname.endsWith(path))) {
    event.respondWith((async () => {
      const cache = await caches.open(MOST_READ_CACHE);
      try {
        const response = await fetch(req);
        if (response.ok) await cache.put(req, response.clone());
        return response;
      } catch (error) {
        const saved = await cache.match(req, {ignoreSearch:true});
        if (saved) return saved;
        throw error;
      }
    })());
    return;
  }

  if (isHomePageRequest(url)) {
    // الصفحة الرئيسية فقط: اعرض المحفوظ فوراً (بلا انتظار)، وحدّثه في الخلفية بصمت
    event.respondWith(
      caches.match(req).then((cached) => {
        const networkUpdate = fetch(req).then((res) => {
          if (res && res.status === 200) {
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, res.clone()));
          }
          return res;
        }).catch(() => cached);
        return cached || networkUpdate;
      })
    );
    return;
  }

  // كل شيء آخر (المقالات، الصور، الأيقونات): الكاش أولاً للسرعة والعمل بلا إنترنت،
  // مع تحديث الكاش في الخلفية عند توفر الإنترنت
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
