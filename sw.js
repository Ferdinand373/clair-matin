const CACHE="clair-matin-v5-8-clair-sync-1-0";
const CACHE_PREFIX="clair-matin-";
const ASSETS=["./","./index.html","./manifest.json","./clair-sync.js","./assets/icon-192.png","./assets/icon-512.png","./assets/apple-touch-icon.png"];

async function injectClairSync(response){
  if(!response) return response;
  const text=await response.text();
  const injected=text.includes('src="./clair-sync.js"')?text:text.replace("</body>",'<script src="./clair-sync.js"></script></body>');
  const headers=new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  return new Response(injected,{status:response.status,statusText:response.statusText,headers});
}

self.addEventListener("install",event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener("activate",event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(CACHE_PREFIX)&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener("fetch",event=>{
  const request=event.request;
  if(request.method!=="GET") return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin) return;
  if(request.mode==="navigate"){
    event.respondWith(fetch(request).then(async response=>{
      if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put("./index.html",copy));}
      return injectClairSync(response);
    }).catch(async()=>{
      const cached=await caches.match("./index.html");
      return cached?injectClairSync(cached):Response.error();
    }));
    return;
  }
  event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{
    if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy));}
    return response;
  })));
});
