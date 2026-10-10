// The address of the page follows the queue: ?folder=ABBA&track=...&playlist=...
// Opening such an address adds those folders, tracks and playlists to the queue.

// the class of a queue entry -> its name in the address
const PARAMS = {folder: 'folder', song: 'track', playlist: 'playlist'}

// what the address asks for, as sets of keys: {folder, song, playlist}
export function parseAddress(search) {
  const linked = {folder: new Set(), song: new Set(), playlist: new Set()}
  for (const [type, name] of Object.entries(PARAMS)) {
    for (const value of new URLSearchParams(search).getAll(name)) {
      if (value) linked[type].add(value)
    }
  }
  return linked
}

// the query string for queue entries, given as [class, source] pairs, in
// queue order. Offline playlists are on the device, not in the bucket.
export function buildAddress(entries) {
  const params = new URLSearchParams()
  for (const [type, source] of entries) {
    if (PARAMS[type] && source && !source.startsWith('offline:')) {
      params.append(PARAMS[type], source)
    }
  }
  const query = params.toString()
  return query ? `?${query}` : ''
}

// keeps the address as the queue is: what is added or removed shows in it
export function mirrorQueue(queue) {
  const update = () => {
    const entries = [...queue.children].map(li => [li.className, li.dataset.source])
    try {
      history.replaceState(null, '', location.pathname + buildAddress(entries))
    } catch(e) {
      // the address is a convenience; browsers limit how often it may change
      console.warn('Updating the address failed', e)
    }
  }
  new MutationObserver(update).observe(queue, {childList: true})
}
