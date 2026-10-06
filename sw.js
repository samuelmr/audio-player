// Network-first cache for the app itself (HTML, scripts, manifest, icons,
// fonts), so that the app opens offline and still gets updates when online.
// Audio and S3 requests are left alone: saved tracks live in IndexedDB.
const CACHE="app-shell";async function networkFirst(e){const t=await caches.open(CACHE);try{const n=await fetch(e);return n.ok&&t.put(e,n.clone()),n}catch(n){
// the start URL has a query string (?homescreen=1)
const a=await t.match(e,{ignoreSearch:"navigate"==e.mode});if(a)return a;throw n}}self.addEventListener("install",()=>self.skipWaiting()),self.addEventListener("activate",e=>e.waitUntil(self.clients.claim())),self.addEventListener("fetch",e=>{const t=e.request,n=new URL(t.url);if("GET"!=t.method||n.origin!=self.location.origin)return;
// the app may be served from the same S3 bucket as the music
if(n.searchParams.has("X-Amz-Signature")||t.headers.has("range"))return;("navigate"==t.mode||["script","manifest","image","style","font"].includes(t.destination))&&e.respondWith(networkFirst(t))});