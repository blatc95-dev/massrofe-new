// Offline support: the app shell is cached so it opens without a connection.
// Pages are fetched network-first (so updates arrive as soon as you're online)
// and fall back to the cached copy when offline. Fonts are cached on first use.
const CACHE = 'massrofe-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png', './apple-touch-icon.png', './favicon-32.png'];

self.addEventListener('install', e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate', e=>{
  e.waitUntil(caches.keys()
    .then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
    .then(()=>self.clients.claim()));
});

function withTimeout(p, ms){
  return Promise.race([p, new Promise((_, rej)=>setTimeout(()=>rej(new Error('timeout')), ms))]);
}

self.addEventListener('fetch', e=>{
  const req = e.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);

  // Google Fonts: serve from cache, refresh in the background
  if(url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com'){
    e.respondWith(caches.open(CACHE).then(async cache=>{
      const hit = await cache.match(req);
      const net = fetch(req).then(res=>{ if(res && (res.ok || res.type==='opaque')) cache.put(req, res.clone()); return res; }).catch(()=>hit);
      return hit || net;
    }));
    return;
  }
  if(url.origin !== self.location.origin) return;

  // app files: network first (4s on a bad connection), cached copy otherwise
  e.respondWith(
    withTimeout(fetch(req), 4000).then(res=>{
      if(res && res.ok){ const copy = res.clone(); caches.open(CACHE).then(c=>c.put(req, copy)); }
      return res;
    }).catch(async ()=>{
      const hit = await caches.match(req, {ignoreSearch:true});
      if(hit) return hit;
      if(req.mode === 'navigate') return caches.match('./index.html');
      return Response.error();
    })
  );
});
