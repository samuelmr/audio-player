// Network-first cache for the app itself (HTML, scripts, manifest, icons,
// fonts), so that the app opens offline and still gets updates when online.
// Audio and S3 requests are left alone: saved tracks live in IndexedDB.
// Raising the version deletes the older caches. Version 2 has the scripts
// under names with a content hash, and none of the files of version 1 are
// needed any more.
const CACHE="app-shell-2";async function activate(){try{const e=await caches.keys();await Promise.all(e.filter(e=>e!=CACHE).map(e=>caches.delete(e)))}catch(e){console.warn("Deleting old caches failed:",e)}await self.clients.claim()}async function networkFirst(e){const t=await caches.open(CACHE);try{
// Hosts such as GitHub Pages let browsers keep files for minutes
// (max-age=600), which would keep the old app for that long after a
// deployment. 'no-cache' asks the host every time; an unchanged file only
// costs a "not modified" reply.
const a=await fetch(e,{cache:"no-cache"});return a.ok&&store(t,e,a.clone()).catch(t=>console.warn(`Caching ${e.url} failed:`,t)),a}catch(a){
// the start URL has a query string (?homescreen=1)
const n=await t.match(e,{ignoreSearch:"navigate"==e.mode});if(n)return n;throw a}}
// Scripts are named with a hash of their content, such as
// audioplayer.0123456789abcdef.js, so each version of the app adds new ones.
// Only the newest of each is kept.
self.addEventListener("install",()=>self.skipWaiting()),self.addEventListener("activate",e=>e.waitUntil(activate())),self.addEventListener("fetch",e=>{const t=e.request,a=new URL(t.url);if("GET"!=t.method||a.origin!=self.location.origin)return;
// the app may be served from the same S3 bucket as the music
if(a.searchParams.has("X-Amz-Signature")||t.headers.has("range"))return;("navigate"==t.mode||["script","manifest","image","style","font"].includes(t.destination))&&e.respondWith(networkFirst(t))});const hashed=/^(.*)\.[0-9a-f]{8,}\.js$/;async function store(e,t,a){await e.put(t,a);const n=new URL(t.url).pathname.match(hashed);if(n)for(const t of await e.keys()){const a=new URL(t.url).pathname;a!=n[0]&&a.match(hashed)?.[1]==n[1]&&await e.delete(t)}}