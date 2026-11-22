// Network-first cache for the app itself (HTML, scripts, manifest, icons,
// fonts), so that the app opens offline and still gets updates when online.
// Audio and S3 requests are left alone: saved tracks live in IndexedDB.

// Raising the version deletes the older caches. Version 2 has the scripts
// under names with a content hash, and none of the files of version 1 are
// needed any more.
const CACHE = 'app-shell-2'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(activate()))

async function activate() {
  try {
    const names = await caches.keys()
    await Promise.all(names.filter(name => name != CACHE).map(name => caches.delete(name)))
  }
  catch (e) {
    console.warn('Deleting old caches failed:', e)
  }
  await self.clients.claim()
}

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
    // Hosts such as GitHub Pages let browsers keep files for minutes
    // (max-age=600), which would keep the old app for that long after a
    // deployment. 'no-cache' asks the host every time; an unchanged file only
    // costs a "not modified" reply.
    const response = await fetch(request, {cache: 'no-cache'})
    if (response.ok) {
      store(cache, request, response.clone())
        .catch(e => console.warn(`Caching ${request.url} failed:`, e))
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

// Scripts are named with a hash of their content, such as
// audioplayer.0123456789abcdef.js, so each version of the app adds new ones.
// Only the newest of each is kept.
const hashed = /^(.*)\.[0-9a-f]{8,}\.js$/

async function store(cache, request, response) {
  await cache.put(request, response)
  const name = new URL(request.url).pathname.match(hashed)
  if (!name) return
  for (const old of await cache.keys()) {
    const path = new URL(old.url).pathname
    if (path != name[0] && path.match(hashed)?.[1] == name[1]) {
      await cache.delete(old)
    }
  }
}
