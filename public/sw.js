const CACHE="veyro-circle-static-v1";
const STATIC=["/offline.html","/branding/veyro-systems-logo.png","/icons/veyro-circle-192.png","/icons/veyro-circle-512.png"];
self.addEventListener("install",event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(STATIC)).then(()=>self.skipWaiting())));
self.addEventListener("activate",event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))));
self.addEventListener("fetch",event=>{if(event.request.method!=="GET"||event.request.mode!=="navigate")return;event.respondWith(fetch(event.request).catch(()=>caches.match("/offline.html")));});

// Data-only FCM payloads: one private, generic notification, no chat content.
self.addEventListener("push",event=>{
  let data; try { data=event.data.json().data; } catch { return; }
  if(!data || typeof data.url!=="string") return;
  const url=new URL(data.url,self.location.origin);
  if(url.origin!==self.location.origin || url.pathname!=="/") return;
  event.waitUntil(self.registration.showNotification("Veyro Circle",{body:data.body,icon:"/icons/veyro-circle-192.png",badge:"/icons/veyro-circle-192.png",tag:data.tag,data:{url:url.href}}));
});
self.addEventListener("notificationclick",event=>{
  event.notification.close();
  const url=new URL(event.notification.data?.url || "/",self.location.origin);
  if(url.origin!==self.location.origin) return;
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:"window",includeUncontrolled:true});
    const client=windows.find(c=>new URL(c.url).origin===url.origin);
    if(client) { await client.navigate(url.href); await client.focus(); }
    else await self.clients.openWindow(url.href);
  })());
});
