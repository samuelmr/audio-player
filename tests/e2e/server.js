// The end-to-end tests' web server, started by Playwright (playwright.config.js):
//   APP_PORT serves the built apps: /pwa/ and /tizen/ from dist/
//   S3_PORT is a fake S3 bucket with the library of library.js
//
// The fake S3 answers the requests the apps make, path-style
// (/<bucket>/<key>): ListObjectsV2, HeadObject and GetObject, with range
// requests for the audio. It doesn't verify signatures, but it rejects
// requests that aren't signed with the test access key, so the settings
// really are what the requests are made with. The public bucket takes only
// requests that aren't signed, as a signature with no key would be refused.

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { APP_PORT, S3_PORT, SETTINGS, PUBLIC_SETTINGS, TRACKS, PLAYLISTS, COVER } from './library.js'

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist')

// a few objects per page, so that the apps' paging gets tested too
const PAGE_SIZE = 3

// Silent MPEG-1 Layer III: 128 kbit/s, 44.1 kHz, mono. A frame with all-zero
// side information decodes to 1152 samples of silence. Browsers estimate the
// duration from the size and the bitrate, so that's what the size is for.
const FRAME_BYTES = 417
const BYTES_PER_SECOND = 128000 / 8
function silentMp3(seconds) {
  const frames = Math.ceil(seconds * BYTES_PER_SECOND / FRAME_BYTES)
  const data = Buffer.alloc(frames * FRAME_BYTES)
  for (let i = 0; i < frames; i++) {
    data.set([0xFF, 0xFB, 0x90, 0xC0], i * FRAME_BYTES)
  }
  return data
}

// an 8×8 PNG of one color
function solidPng([r, g, b]) {
  const chunk = (type, data) => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(zlib.crc32(Buffer.concat([Buffer.from(type), data])))
    return Buffer.concat([length, Buffer.from(type), data, crc])
  }
  const size = 8
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header.set([8, 2, 0, 0, 0], 8) // 8 bits per channel, RGB
  const row = Buffer.from([0, ...Array(size).fill([r, g, b]).flat()]) // no filter
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(Array(size).fill(row)))),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const objects = new Map()
objects.set(COVER.key, {body: solidPng(COVER.rgb), type: 'image/png', meta: {}})
for (const track of TRACKS) {
  objects.set(track.key, {body: silentMp3(track.seconds), type: 'audio/mpeg', meta: track.meta})
}
for (const [key, playlist] of Object.entries(PLAYLISTS)) {
  objects.set(key, {body: Buffer.from(JSON.stringify(playlist)), type: 'application/json', meta: {}})
}
const keys = [...objects.keys()].sort()

const xmlEscape = (text) => text.replace(/[<>&'"]/g, c => `&#${c.charCodeAt(0)};`)

function cors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
  // the SDK signs with Authorization, which a '*' doesn't cover
  res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || '*')
  res.setHeader('Access-Control-Expose-Headers', '*')
}

function s3Error(res, status, code) {
  res.writeHead(status, {'Content-Type': 'application/xml'})
  res.end(`<?xml version="1.0" encoding="UTF-8"?><Error><Code>${code}</Code><Message>${code}</Message></Error>`)
}

const credentialOf = (req, url) => url.searchParams.get('X-Amz-Credential') || req.headers.authorization || ''

// ListObjectsV2: with a delimiter, the folders at that level become CommonPrefixes
function list(res, url, bucket) {
  const prefix = url.searchParams.get('prefix') || ''
  const delimiter = url.searchParams.get('delimiter')
  const entries = new Map() // name -> 'prefix' | 'key', in key order
  for (const key of keys) {
    if (!key.startsWith(prefix)) continue
    const at = delimiter ? key.indexOf(delimiter, prefix.length) : -1
    if (at >= 0) {
      entries.set(key.slice(0, at + delimiter.length), 'prefix')
    }
    else {
      entries.set(key, 'key')
    }
  }
  const all = [...entries]
  const start = Number(url.searchParams.get('continuation-token') || 0)
  const page = all.slice(start, start + PAGE_SIZE)
  const truncated = start + PAGE_SIZE < all.length
  const body = page.map(([name, kind]) => kind == 'prefix'
    ? `<CommonPrefixes><Prefix>${xmlEscape(name)}</Prefix></CommonPrefixes>`
    : `<Contents><Key>${xmlEscape(name)}</Key><LastModified>2026-01-01T00:00:00.000Z</LastModified><ETag>"${name.length}"</ETag><Size>${objects.get(name).body.length}</Size><StorageClass>STANDARD</StorageClass></Contents>`
  ).join('')
  res.writeHead(200, {'Content-Type': 'application/xml'})
  res.end(`<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Name>${xmlEscape(bucket)}</Name><Prefix>${xmlEscape(prefix)}</Prefix>${delimiter ? `<Delimiter>${xmlEscape(delimiter)}</Delimiter>` : ''}<KeyCount>${page.length}</KeyCount><MaxKeys>${PAGE_SIZE}</MaxKeys><IsTruncated>${truncated}</IsTruncated>${truncated ? `<NextContinuationToken>${start + PAGE_SIZE}</NextContinuationToken>` : ''}${body}</ListBucketResult>`)
}

function getObject(req, res, object) {
  const headers = {
    'Content-Type': object.type,
    'Accept-Ranges': 'bytes',
    'ETag': `"${object.body.length}"`,
  }
  // header values are ASCII: the uploads stored them URI encoded
  for (const [name, value] of Object.entries(object.meta)) {
    headers[`x-amz-meta-${name.toLowerCase()}`] = encodeURIComponent(value)
  }
  let body = object.body
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '')
  if (range) {
    const size = object.body.length
    const start = range[1] ? Number(range[1]) : size - Number(range[2])
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1
    body = object.body.subarray(start, end + 1)
    headers['Content-Range'] = `bytes ${start}-${end}/${size}`
    res.writeHead(206, {...headers, 'Content-Length': body.length})
  }
  else {
    res.writeHead(200, {...headers, 'Content-Length': body.length})
  }
  res.end(req.method == 'HEAD' ? undefined : body)
}

const s3 = http.createServer((req, res) => {
  cors(req, res)
  if (req.method == 'OPTIONS') {
    res.writeHead(204)
    return res.end()
  }
  const url = new URL(req.url, `http://${req.headers.host}`)
  const [, bucketPart, ...keyParts] = url.pathname.split('/')
  const bucket = decodeURIComponent(bucketPart)
  const credential = credentialOf(req, url)
  if (bucket == PUBLIC_SETTINGS.bucketName) {
    if (credential) return s3Error(res, 401, 'InvalidAccessKeyId')
    // like a cache in front of a public bucket that has kept the headers of
    // a request without an Origin: only a query string gets fresh ones
    if (!url.search) res.removeHeader('Access-Control-Expose-Headers')
  }
  else if (!credential.includes(`${SETTINGS.accessKeyId}/`)) return s3Error(res, 403, 'InvalidAccessKeyId')
  else if (bucket != SETTINGS.bucketName) return s3Error(res, 404, 'NoSuchBucket')
  const key = keyParts.map(decodeURIComponent).join('/')
  if (!key) {
    return url.searchParams.get('list-type') == '2' ? list(res, url, bucket) : s3Error(res, 400, 'InvalidRequest')
  }
  const object = objects.get(key)
  if (!object) return s3Error(res, 404, 'NoSuchKey')
  getObject(req, res, object)
})

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.png': 'image/png', '.xml': 'application/xml', '.css': 'text/css',
}

const app = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  let file = path.join(dist, decodeURIComponent(url.pathname))
  if (!file.startsWith(dist)) {
    res.writeHead(403)
    return res.end()
  }
  if (file.endsWith('/')) file += 'index.html'
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404)
      return res.end('Not found')
    }
    // like a static host: the service worker must check for updates
    res.writeHead(200, {'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache'})
    res.end(data)
  })
})

app.listen(APP_PORT, '127.0.0.1')
s3.listen(S3_PORT, '127.0.0.1', () => {
  console.log(`apps on http://127.0.0.1:${APP_PORT}/pwa/ and /tizen/, fake S3 on http://127.0.0.1:${S3_PORT}`)
})
