// Network-first cache for the app itself (HTML, scripts, manifest, icons,
// fonts), so that the app opens offline and still gets updates when online.
// Audio and S3 requests are left alone: saved tracks live in IndexedDB.

const CACHE = 'app-shell'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method != 'GET' || url.origin != self.location.origin) return
  // the app may be served from the same S3 bucket as the music
  if (url.searchParams.has('X-Amz-Signature') || request.headers.has('range')) return
  const appFile = request.mode == 'navigate' ||
    ['script', 'manifest', 'image', 'style', 'font'].includes(request.destination)
  if (!appFile) return
  event.respondWith(networkFirst(request))
})

async function networkFirst(request) {
  const cache = await caches.open(CACHE)
  try {
    const response = await fetch(request)
    if (response.ok) {
      cache.put(request, response.clone())
    }
    return response
  }
  catch (e) {
    // the start URL has a query string (?homescreen=1)
    const cached = await cache.match(request, {ignoreSearch: request.mode == 'navigate'})
    if (cached) return cached
    throw e
  }
}
