// Generated release identity and runtime resource list are filled by finalize-build.mjs.
const CACHE = "__BUILD_CACHE__";
const SHELL = [];
const HOME = new URL('./index.html', self.location.href).href;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL.map(url => new Request(new URL(url, self.location.href).href, { cache: "reload" })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('frankie-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  const immutable = url.searchParams.has('h') || /-[\w-]{8,}\.(js|css)$/.test(url.pathname);
  const network = async () => {
    const res = await fetch(req);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const cache = await caches.open(CACHE);
    await cache.put(req.mode === 'navigate' ? HOME : req, res.clone());
    return res;
  };
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req.mode === 'navigate' ? HOME : req);
    if (immutable && hit) return hit;
    try { return await network(); } catch { return hit ?? Response.error(); }
  })());
});
