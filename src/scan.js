// The library scan reads the metadata of every track in the bucket into the
// metadata cache, so that the search and the sort setting know all of them.
// A track whose cached metadata is up to date costs no request.
import { getS3Meta } from './s3.js'
import { getSearchKeys, lastModified } from './search.js'

// requests at a time
const PARALLEL = 4

let running = null

// onProgress gets {done, total, failed} after each track. The result is the
// same, also when the scan was stopped before the end.
export async function scanLibrary(onProgress) {
  const state = {done: 0, total: 0, failed: 0, stopped: false}
  running = state
  try {
    const keys = await getSearchKeys()
    if (!keys) throw new Error('No bucket')
    state.total = keys.length
    onProgress(state)
    let next = 0
    const worker = async () => {
      while (!state.stopped && next < keys.length) {
        const key = keys[next++]
        try {
          await getS3Meta(key, lastModified(key))
        } catch(e) {
          state.failed++
        }
        state.done++
        onProgress(state)
      }
    }
    await Promise.all(Array.from({length: PARALLEL}, worker))
    return state
  }
  finally {
    running = null
  }
}

export function stopLibraryScan() {
  if (running) running.stopped = true
}
