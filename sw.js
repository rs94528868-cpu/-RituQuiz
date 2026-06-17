const CACHE='rituquiz-v1';
const URLS=['index.html','style.css','app.js','icon.svg','manifest.json',
  'subjects/science.js','subjects/history.js','subjects/geography.js','subjects/economics.js','subjects/polity.js','subjects/gk.js'];

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(URLS)));
  self.skipWaiting();
});

self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch',e=>{
  e.respondWith(
    caches.match(e.request).then(r=>r||fetch(e.request).catch(()=>caches.match('index.html')))
  );
});
