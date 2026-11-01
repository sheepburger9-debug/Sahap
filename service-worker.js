const CACHE = 'sahap-shell-v4';
const SHELL = ['./', './index.html', './manifest.json'];
// رفع رقم الإصدار عند كل نشر جديد عشان الكاش القديم يتمسح ومايظهرش تحديث قديم

self.addEventListener('install', (event) => {
  event.waitUntil(
    // كل ملف بيتحمّل لوحده: فشل ملف واحد ما يوقفش تثبيت الـ worker بالكامل
    caches.open(CACHE)
      .then((cache) => Promise.all(SHELL.map((u) => cache.add(u).catch((e) => console.warn('[sw] skip', u, e)))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // بيانات المنصة (Supabase) والمكتبات والخطوط تفضل على الشبكة دايماً
  if (url.origin !== self.location.origin) return;

  // التنقل بين الصفحات: الشبكة أولاً، ولو مفيش نت نرجّع النسخة المحفوظة
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // باقي ملفات الموقع: الكاش أولاً ثم الشبكة
  event.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }))
  );
});
