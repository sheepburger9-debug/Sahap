/* ============================================================
   سحاب — Service Worker v1
   الاستراتيجية:
   - Network-First لـ HTML/JS/CSS/JSON  → التحديثات تظهر فورًا
   - Cache-First للصور والخطوط         → تسريع + عمل offline
   - تجاهل كامل لـ Supabase و CDN      → بيانات دائمًا live
   ============================================================ */

const CACHE_VERSION = 'sahab-v1.0.0';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './favicon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

/* ---------- INSTALL ---------- */
self.addEventListener('install', (event) => {
  // خلي الـ SW الجديد يستلم المهمة فورًا بدل ما ينتظر
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => {
        // addAll بيفشل كله لو ملف واحد ناقص — بنستخدم add لكل ملف عشان ما نقعش
        return Promise.all(
          CORE_ASSETS.map(url =>
            cache.add(url).catch(err => console.warn('[SW] skip cache:', url, err.message))
          )
        );
      })
  );
});

/* ---------- ACTIVATE ---------- */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_VERSION)
          .map(key => {
            console.log('[SW] deleting old cache:', key);
            return caches.delete(key);
          })
      ))
      .then(() => self.clients.claim())
  );
});

/* ---------- FETCH ---------- */
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // تجاهل: أي طلب غير GET
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch { return; }

  // تجاهل: الطلبات الخارجية (Supabase / CDN / Google Fonts)
  // دول لازم يروحوا للشبكة مباشرة عشان البيانات دايمًا محدّثة
  if (url.origin !== self.location.origin) return;

  // تجاهل: endpoints المصادقة والـ REST (احتياطيًا)
  if (url.pathname.includes('/auth/') || url.pathname.includes('/rest/')) return;

  // هل الملف من الملفات "الأساسية" اللي لازم تتحدث؟
  const isCoreAsset =
    req.mode === 'navigate' ||
    /\.(html|js|css|json)$/i.test(url.pathname) ||
    url.pathname.endsWith('/');

  if (isCoreAsset) {
    // ===== Network-First =====
    event.respondWith(
      fetch(req)
        .then(res => {
          // خزّن نسخة جديدة في الكاش من غير ما نعطّل الرد
          if (res && res.ok && res.type === 'basic') {
            const clone = res.clone();
            caches.open(CACHE_VERSION).then(c => c.put(req, clone)).catch(() => {});
          }
          return res;
        })
        .catch(async () => {
          // لو الشبكة فشلت → ارجع للكاش
          const cached = await caches.match(req);
          if (cached) return cached;

          // لو مش موجود في الكاش → ارجع index.html (SPA fallback)
          const fallback = await caches.match('./index.html');
          if (fallback) return fallback;

          // آخر حل: صفحة offline بسيطة
          return new Response(
            '<!doctype html><html><head><meta charset="utf-8"><title>غير متصل</title></head>' +
            '<body style="font-family:sans-serif;text-align:center;padding:40px;direction:rtl">' +
            '<h1>📡 أنت غير متصل</h1><p>اتصل بالإنترنت وحاول مرة أخرى</p></body></html>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        })
    );
    return;
  }

  // ===== Cache-First =====
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;

      return fetch(req)
        .then(res => {
          // خزّن فقط ردود نفس الأصل وناجحة
          if (res && res.ok && res.type === 'basic') {
            const clone = res.clone();
            caches.open(CACHE_VERSION).then(c => c.put(req, clone)).catch(() => {});
          }
          return res;
        })
        .catch(() => new Response('', { status: 504, statusText: 'Offline' }));
    })
  );
});

/* ---------- MESSAGE ---------- */
// استقبال أمر من الصفحة لتفعيل SW الجديد فورًا
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
