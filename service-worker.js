"use strict";

const APP_VERSION = "7.1.0";
const CACHE_PREFIX = "clair-courses-";
const CACHE_NAME = CACHE_PREFIX + "v" + APP_VERSION;
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/icon.svg",
  "./assets/icon-180.png",
  "./assets/icon-192.png",
  "./assets/icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL.map(path => new Request(path,{cache:"reload"})))));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("message", event => {if(event.data?.type === "SKIP_WAITING") self.skipWaiting();});
self.addEventListener("fetch", event => {
  const request=event.request,url=new URL(request.url);
  if(request.method!=="GET" || url.origin!==self.location.origin) return;
  if(request.mode==="navigate"){
    event.respondWith(fetch(request,{cache:"no-store"}).then(response=>{if(response?.ok){const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put("./index.html",copy));}return response;}).catch(()=>caches.match("./index.html").then(cached=>cached||caches.match("./"))));
    return;
  }
  event.respondWith(caches.match(request).then(cached=>{const network=fetch(request,{cache:"no-cache"}).then(response=>{if(response?.ok){const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(request,copy));}return response;});if(cached){event.waitUntil(network.catch(()=>{}));return cached;}return network.catch(()=>caches.match("./index.html"));}));
});
