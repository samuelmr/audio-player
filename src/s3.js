import { S3Client } from "@aws-sdk/client-s3"
import { HeadObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { EXPIRE_SECONDS } from './constants.js'
import { db, dbReady } from './db.js'
import { locale } from './locale.js'
import { setting } from './defaults.js'

export let s3, bucketName
// the address of a public bucket, read without keys
let publicUrl
const PUBLIC_QUERY = 'x-cors'

export const S3_SETTINGS = [
  'accessKeyId',
  'secretAccessKey',
  'endpoint',
  'region',
  'bucketName'
]

// Without keys the bucket is public: the requests aren't signed, and the
// tracks and covers are at their plain addresses. The region only matters
// for signing, so any will do when it's not set.
export function connectS3() {
  const params = {}
  S3_SETTINGS.forEach(key => {
    params[key] = setting(key)
  })
  const isPublic = !params['accessKeyId'] && !params['secretAccessKey']
  const required = isPublic ? ['endpoint', 'bucketName'] : ['accessKeyId', 'secretAccessKey', 'endpoint', 'bucketName']
  required.forEach(key => {
    if (!params[key]) {
      throw new Error(locale.missingSetting(key))
    }
  })
  const s3opts = {
    credentials: {
      accessKeyId: params['accessKeyId'],
      secretAccessKey: params['secretAccessKey'],
    },
    endpoint: params['endpoint'],
    s3BucketEndpoint: true,
    forcePathStyle: true,
    region: params['region'] || 'us-east-1'
  }
  if (isPublic) {
    s3opts.signer = { sign: async request => request }
  }
  bucketName = params['bucketName']
  publicUrl = isPublic ? `${params['endpoint'].replace(/\/+$/, '')}/${encodeURIComponent(bucketName)}` : null
  s3 = new S3Client(s3opts)
  // A cache in front of a public bucket may answer by the address alone,
  // with the headers of a request that had no Origin, such as the audio
  // element's: then the browser hides the metadata. The app's own requests
  // get an address of their own, which only requests with an Origin use.
  if (isPublic) {
    s3.middlewareStack.add(next => args => {
      args.request.query[PUBLIC_QUERY] = '1'
      return next(args)
    }, {step: 'build', name: 'publicQuery'})
  }
}

// signing doesn't need the network
export function objectUrl(key) {
  if (publicUrl) {
    return Promise.resolve(`${publicUrl}/${key.split('/').map(encodeURIComponent).join('/')}`)
  }
  const command = new GetObjectCommand({Bucket: bucketName, Key: key})
  return getSignedUrl(s3, command, { expiresIn: EXPIRE_SECONDS })
}

export async function getObjectText(key) {
  const res = await s3.send(new GetObjectCommand({Bucket: bucketName, Key: key}))
  return res.Body.transformToString()
}

// the bucket listing may arrive before the database has opened.
// The metadata is cached with the time the object was last modified, from the
// listing: an object uploaded again is newer, and its metadata is fetched
// again. Not its ETag, which stays the same when only the metadata changes.
// Without the time, the cached metadata is used.
export async function getS3Meta(key, lastModified) {
  const modified = lastModified ? new Date(lastModified).toISOString() : ''
  await dbReady
  return new Promise(
    function(resolve, reject) {
      let meta
      const tx = db.transaction("meta", "readonly")
      const cache = tx.objectStore("meta")
      const index = cache.index("key")
      const dbRequest = index.get(key)
      dbRequest.onerror = function(event) {
        reject(new Error(event))
      }
      dbRequest.onsuccess = async function() {
        const matching = dbRequest.result
        if (matching !== undefined && (!modified || matching.modified == modified)) {
          meta = matching
          resolve(meta)
        } else {
          try {
            const get = new HeadObjectCommand({Bucket: bucketName, Key: key})
            const metaQuery = await s3.send(get)
            meta = metaQuery.Metadata
            meta.key = key
            meta.modified = modified || metaQuery.LastModified?.toISOString()
            const putx = db.transaction("meta", "readwrite")
            putx.objectStore("meta").put(meta)
            resolve(meta)
          }
          catch(e) {
            console.warn(`Error retrieving metadata for '${key}' from S3 bucket '${bucketName}'`)
            console.log(e)
            reject(new Error(e))
          }
        }
      }
    }
  )
}
