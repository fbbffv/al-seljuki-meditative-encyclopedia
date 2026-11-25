/*
  عامل خدمة موسوعة السلجوقي — التخزين الشامل v43
  - يخزن الملفات الأساسية كلّاً على حدة حتى لا يفشل التخزين بسبب ملف واحد مفقود.
  - يحفظ كل صفحة/مقال/فهرس يزوره المستخدم من النطاق نفسه.
  - زر التنزيل وجرس التحديث يحفظان كامل قائمة المحتوى في Cache Storage.
*/
const CACHE_VERSION = 'suljuki-v44';
const MOST_READ_CACHE = 'suljuki-most-read-persistent-v1';
const MOST_READ_PATHS = ['/qa/most-read.json', '/articles/most-read.json'];
const CORE_ASSETS = [
  './', './index.html', './sitemap-page.html', './articles-manifest.json',
  './service-worker.js', './articles/index_article453.html',
  './manifest.json', './icon.png', './sheikh.png', './logo-header.png',
  './about.html', './en/index.html'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    // لا نستخدم addAll هنا: فشل ملف منفرد لا ينبغي أن يمنع حفظ بقية الملفات.
    await Promise.all(CORE_ASSETS.map(async (asset) => {
      try {
        const response = await fetch(asset, {cache:'reload'});
        if (response && response.ok) await cache.put(asset, response.clone());
      } catch (error) {
        // سيعاد طلب الملف عند زيارة الصفحة أو عند تشغيل التنزيل الشامل.
      }
    }));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('suljuki-v') && key !== CACHE_VERSION).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // بيان الإصدارات يجب أن يأتي من الشبكة أولاً حتى يستطيع جرس التحديث اكتشاف النسخة المنشورة.
  if (url.pathname.endsWith('/articles-manifest.json')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_VERSION);
      const canonical = new Request(new URL('articles-manifest.json', self.registration.scope).href);
      try {
        const fresh = await fetch(request, {cache:'no-store'});
        if (fresh && fresh.ok) await cache.put(canonical, fresh.clone());
        return fresh;
      } catch (error) {
        const saved = await cache.match(canonical, {ignoreSearch:true});
        if (saved) return saved;
        throw error;
      }
    })());
    return;
  }

  if (MOST_READ_PATHS.some((path) => url.pathname.endsWith(path))) {
    event.respondWith((async () => {
      const cache = await caches.open(MOST_READ_CACHE);
      try {
        const response = await fetch(request);
        if (response && response.ok) await cache.put(request, response.clone());
        return response;
      } catch (error) {
        const saved = await cache.match(request, {ignoreSearch:true});
        if (saved) return saved;
        throw error;
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_VERSION);
    const cached = await cache.match(request, {ignoreSearch:true});
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response && response.ok) await cache.put(request, response.clone());
      return response;
    } catch (error) {
      const fallback = await cache.match(request, {ignoreSearch:true});
      if (fallback) return fallback;
      throw error;
    }
  })());
});
