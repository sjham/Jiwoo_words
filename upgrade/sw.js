const VERSION='jiwoo-upgrade-v2-5';
const ROOT=new URL('./',self.location.href).href;
const FILES=['./','./index.html','./app.css','./fonts/cinzel-decorative-700.ttf','./app.js','./data.js','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png','./apple-touch-icon.png'].map(p=>new URL(p,ROOT).href);
self.addEventListener('install',e=>e.waitUntil(caches.open(VERSION).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('jiwoo-upgrade-')&&k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET'||!e.request.url.startsWith(ROOT))return;
 // Only this preview's files are cached. Sibling apps and their caches are untouched.
 e.respondWith(fetch(e.request).then(res=>{
  if(res.ok&&FILES.includes(e.request.url)){const copy=res.clone();e.waitUntil(caches.open(VERSION).then(c=>c.put(e.request,copy)));}
  return res;
 }).catch(async()=>{
  const cache=await caches.open(VERSION);const hit=await cache.match(e.request);if(hit)return hit;
  if(e.request.mode==='navigate')return await cache.match(new URL('index.html',ROOT).href)||Response.error();
  return Response.error();
 }));
});
