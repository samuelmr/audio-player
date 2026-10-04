import { S3Client } from "@aws-sdk/client-s3"
import { HeadObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { EXPIRE_SECONDS } from './constants.js'
import { db, dbReady } from './db.js'

export let s3, bucketName

export const S3_SETTINGS = [
  'accessKeyId',
  'secretAccessKey',
  'endpoint',
  'region',
  'bucketName'
]

export function connectS3() {
  const params = {}
  S3_SETTINGS.forEach(key => {
    params[key] = localStorage.getItem(key)
    if (!params[key]) {
      throw new Error(`S3 ${key} is missing`)
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
    region: params['region']
  }
  bucketName = params['bucketName']
  s3 = new S3Client(s3opts)
}

// signing doesn't need the network
export function signedUrl(key) {
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
