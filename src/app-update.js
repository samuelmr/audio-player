// A new version of the web app, taken into use when the app comes back to the
// front. A home screen app on iOS isn't started again when it's opened: the
// page left in the background comes back as it was, for days if need be.
//
// The scripts are named by their content (webpack.config.js), so the page on
// the host loads another script when there is a new version. The app reloads
// to it only when that loses nothing: nothing queued, no dialog open, no
// search typed. Otherwise it waits for the next time it comes to the front,
// or for the app to be closed. The TV apps run the script of their package,
// and don't check.

// the app's own script in index.html, such as audioplayer.0123456789abcdef.js
const SCRIPT = /<script[^>]*\ssrc="([^"]*audioplayer\.[0-9a-f]{8,}\.js)"/

export function initAppUpdate() {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState != 'visible') return
    // offline, or the host is down: the app goes on as it is
    checkForUpdate().catch(e => console.warn('Checking for a new version failed:', e))
  })
}

async function checkForUpdate() {
  const running = document.querySelector('script[src*="audioplayer."]')
  if (!running) return
  // fetch() calls pass the service worker (sw.js), and 'no-cache' passes the
  // browser's cache, so this is the page as the host has it now
  const response = await fetch(location.pathname, {cache: 'no-cache'})
  if (!response.ok) throw new Error(`The page gave HTTP ${response.status}`)
  const latest = (await response.text()).match(SCRIPT)
  if (!latest) return
  const path = (src, base) => new URL(src, base).pathname
  if (path(latest[1], response.url) != path(running.src) && nothingToLose()) {
    console.info(`Reloading to the new version, ${latest[1]}`)
    location.reload()
  }
}

function nothingToLose() {
  return !document.querySelector('audio-player audio-track') &&
    !document.querySelector('dialog[open]') &&
    ![...document.querySelectorAll('input[type=search]')].some(input => input.value)
}
