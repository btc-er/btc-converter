const NAME="btcconv-v3";
const ASSETS=["./","index.html","app.js","manifest.json","icons/icon-180.png","icons/icon-192.png","icons/icon-512.png"];
self.addEventListener("install",e=>e.waitUntil(caches.open(NAME).then(c=>c.addAll(ASSETS))));
self.addEventListener("activate",e=>e.waitUntil(
  caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==NAME).map(k=>caches.delete(k))))));
self.addEventListener("fetch",e=>{
  const {request}=e;
  if(request.method!=="GET") return;
  if(request.url.includes("coinbase.com")) return; // network-first for API
  e.respondWith(caches.match(request).then(r=>r||fetch(request)));
});
