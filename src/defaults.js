// The bucket the apps use when the settings don't name one. It comes from
// DEFAULT_BUCKET_URL when the apps are built, the path-style address of a
// public bucket such as https://s3.example.com/demo-music. Without it there
// is no default, and the settings are needed.
export function parseBucketUrl(address) {
  if (!address) return {}
  const url = new URL(address)
  return {
    endpoint: url.origin,
    bucketName: decodeURIComponent(url.pathname.replace(/^\/+|\/+$/g, '')),
  }
}

export const DEFAULTS = parseBucketUrl(process.env.DEFAULT_BUCKET_URL)

// the saved setting, or its default
export function setting(key) {
  return localStorage.getItem(key) || DEFAULTS[key] || ''
}
