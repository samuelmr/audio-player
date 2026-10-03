// pwa/sw.js, run with stand-ins for the service worker globals
import { describe, test, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'

const source = fs.readFileSync('pwa/sw.js', 'utf8')
const ORIGIN = 'https://app.example'

function fakeCaches() {
  const entries = new Map() // url -> response
  const cache = {
    put: vi.fn(async (request, response) => { entries.set(request.url, response) }),
    match: vi.fn(async (request, {ignoreSearch} = {}) => {
      const key = (url) => ignoreSearch ? url.split('?')[0] : url
      for (const [url, response] of entries) {
        if (key(url) == key(request.url)) return response
      }
    }),
  }
  return {entries, cache, open: vi.fn(async () => cache)}
}

let listeners, caches, fetch, self

beforeEach(() => {
  listeners = {}
  caches = fakeCaches()
  fetch = vi.fn(async () => new Response('from the network'))
  self = {
    location: new URL(`${ORIGIN}/music/sw.js`),
    addEventListener: (type, listener) => { listeners[type] = listener },
    skipWaiting: vi.fn(),
    clients: {claim: vi.fn(() => Promise.resolve())},
  }
  new Function('self', 'caches', 'fetch', source)(self, caches, fetch)
})

const request = (url, {mode = 'no-cors', destination = '', method = 'GET', headers = {}} = {}) =>
  ({url: new URL(url, `${ORIGIN}/music/`).href, mode, destination, method, headers: new Headers(headers)})

// the response the worker gives, or undefined when it leaves the request to the browser
function dispatchFetch(req) {
  let response
  listeners.fetch({request: req, respondWith: (promise) => { response = promise }})
  return response
}

test('takes over at once, also the open pages', async () => {
  listeners.install()
  expect(self.skipWaiting).toHaveBeenCalled()
  let waited
  listeners.activate({waitUntil: (promise) => { waited = promise }})
  await waited
  expect(self.clients.claim).toHaveBeenCalled()
})

describe('handles the app itself', () => {
  test.each([
    ['the page', request('./', {mode: 'navigate', destination: 'document'})],
    ['scripts', request('audioplayer.js', {destination: 'script'})],
    ['the manifest', request('manifest.json', {destination: 'manifest'})],
    ['icons', request('play-192.png', {destination: 'image'})],
    ['stylesheets', request('styles.css', {destination: 'style'})],
  ])('%s', async (_, req) => {
    const response = dispatchFetch(req)
    expect(response).toBeDefined()
    expect(await (await response).text()).toBe('from the network')
  })
})

describe('leaves alone', () => {
  test.each([
    ['other origins', request('https://fonts.googleapis.com/css2', {destination: 'style'})],
    ['requests other than GET', request('./', {mode: 'navigate', method: 'POST'})],
    ['signed S3 requests from the same bucket', request('./song.mp3?X-Amz-Signature=abc', {destination: 'image'})],
    ['range requests', request('./song.mp3', {destination: 'image', headers: {range: 'bytes=0-'}})],
    ['audio', request('./song.mp3', {destination: 'audio'})],
    ['fetch() calls', request('./data.json')],
  ])('%s', (_, req) => {
    expect(dispatchFetch(req)).toBeUndefined()
  })
})

describe('network first', () => {
  test('gives the network response, and caches it', async () => {
    fetch.mockResolvedValue(new Response('new', {status: 200}))
    const response = await dispatchFetch(request('audioplayer.js', {destination: 'script'}))
    expect(await response.text()).toBe('new')
    expect(caches.entries.has(`${ORIGIN}/music/audioplayer.js`)).toBe(true)
  })

  test("doesn't cache errors", async () => {
    fetch.mockResolvedValue(new Response('gone', {status: 404}))
    const response = await dispatchFetch(request('audioplayer.js', {destination: 'script'}))
    expect(response.status).toBe(404)
    expect(caches.entries.size).toBe(0)
  })

  test('offline, gives the cached response', async () => {
    fetch.mockResolvedValueOnce(new Response('cached', {status: 200}))
    await dispatchFetch(request('audioplayer.js', {destination: 'script'}))
    fetch.mockRejectedValue(new TypeError('Failed to fetch'))
    const response = await dispatchFetch(request('audioplayer.js', {destination: 'script'}))
    expect(await response.text()).toBe('cached')
  })

  test('offline, opens the page from the home screen, whose address has a query string', async () => {
    fetch.mockResolvedValueOnce(new Response('page', {status: 200}))
    await dispatchFetch(request('./', {mode: 'navigate'}))
    fetch.mockRejectedValue(new TypeError('Failed to fetch'))
    const response = await dispatchFetch(request('./?homescreen=1', {mode: 'navigate'}))
    expect(await response.text()).toBe('page')
  })

  test('offline, fails what was never cached', async () => {
    fetch.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(dispatchFetch(request('audioplayer.js', {destination: 'script'}))).rejects.toThrow('Failed to fetch')
  })
})
