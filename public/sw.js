const CACHE="veyro-circle-static-v1";
const STATIC=["/offline.html","/branding/veyro-systems-logo.png","/icons/veyro-circle-192.png","/icons/veyro-circle-512.png"];
self.addEventListener("install",event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(STATIC))));
self.addEventListener("activate",event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))));
self.addEventListener("fetch",event=>{if(event.request.method!=="GET"||event.request.mode!=="navigate")return;event.respondWith(fetch(event.request).catch(()=>caches.match("/offline.html")));});
