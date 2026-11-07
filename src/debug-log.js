// TEMPORARY, for finding out why iOS 18.1 stops the music when a track ends.
// Keeps a log of the events of the audio element and of the page lifecycle in
// localStorage (it survives the page being killed), and shows it in a panel
// opened by the "log" button in the corner. Not meant for main.
const KEY = 'debugLog'
const MAX = 800
const t0 = Date.now()
let entries = []
try {
  entries = JSON.parse(localStorage.getItem(KEY)) || []
} catch (e) { /* start with an empty log */ }

const clock = () => new Date().toTimeString().slice(0, 8)

let currentAudio
export function debugLog(message, element) {
  const a = element || currentAudio?.()
  const state = a ? ` [${document.visibilityState} rs${a.readyState} t${a.currentTime.toFixed(1)}/${Number.isFinite(a.duration) ? a.duration.toFixed(1) : '?'}${a.paused ? ' paused' : ''}${a.ended ? ' ended' : ''}]` : ''
  entries.push(`${clock()} +${((Date.now() - t0) / 1000).toFixed(1)}s ${message}${state}`)
  if (entries.length > MAX) entries = entries.slice(-MAX)
  try {
    localStorage.setItem(KEY, JSON.stringify(entries))
  } catch (e) { /* the log is only for debugging */ }
  if (panelText) panelText.textContent = entries.join('\n')
}

let panelText

// Requests of the S3 client, counted by kind (HeadObject, ListObjectsV2, GetObject),
// with how long they took from the call to the answer. That includes the time a
// request waits in the browser for a free connection.
const net = {}
export function trackNet(kind) {
  const n = net[kind] ||= {inflight: 0, done: 0, failed: 0, ms: 0, maxInflight: 0}
  n.inflight++
  n.maxInflight = Math.max(n.maxInflight, n.inflight)
  const start = Date.now()
  return (failed) => {
    n.inflight--
    n[failed ? 'failed' : 'done']++
    n.ms += Date.now() - start
  }
}

// what the page has loaded, by what asked for it (img, css, fetch, audio...)
const resources = {}
try {
  new PerformanceObserver(list => {
    for (const entry of list.getEntries()) {
      resources[entry.initiatorType] = (resources[entry.initiatorType] || 0) + 1
    }
  }).observe({type: 'resource', buffered: true})
} catch (e) { /* no resource timing */ }

let lastSummary = ''
function summary() {
  const kinds = Object.entries(net).map(([kind, n]) =>
    `${kind.replace(/Command|Object/g, '')} ${n.inflight} now/${n.maxInflight} max/${n.done} done${n.failed ? '/' + n.failed + ' failed' : ''}/avg ${n.done ? Math.round(n.ms / n.done) : 0}ms`)
  const loaded = Object.entries(resources).map(([type, count]) => `${type} ${count}`)
  const text = `net: ${kinds.join(', ')}; loaded: ${loaded.join(', ')}; queue ${document.querySelectorAll('audio-track').length}`
  // only when something changed
  if (text != lastSummary) {
    lastSummary = text
    debugLog(text)
  }
}

export function initDebugLog(getAudio, elements) {
  // the TV app has no use for it, and its remote would focus the button
  if (typeof tizen !== 'undefined') return
  currentAudio = getAudio
  debugLog(`page loaded, standalone=${navigator.standalone}, audioSession=${navigator.audioSession?.type}, ${navigator.userAgent}`)

  for (const audio of elements) {
    for (const type of ['loadstart', 'loadedmetadata', 'canplay', 'canplaythrough', 'play', 'playing', 'pause',
      'waiting', 'stalled', 'suspend', 'abort', 'emptied', 'ended', 'seeking', 'error']) {
      audio.addEventListener(type, () => {
        const src = audio.currentSrc.startsWith('blob:') ? 'blob' : audio.currentSrc ? 'remote' : 'none'
        // the events of the silent unlocking only clutter the log
        if (audio.dataset.unlocking) return
        debugLog(`${audio.dataset.name}${audio === getAudio() ? '' : ' (standby)'} ${type} (${src}${audio.error ? ', error ' + audio.error.code + ' ' + audio.error.message : ''})`, audio)
      })
    }
  }
  for (const type of ['visibilitychange', 'freeze', 'resume']) {
    document.addEventListener(type, () => debugLog(`document ${type}`))
  }
  for (const type of ['pagehide', 'pageshow', 'online', 'offline']) {
    window.addEventListener(type, () => debugLog(`window ${type}`))
  }

  setInterval(summary, 2000)

  // a timer that is late shows that the page was throttled or suspended
  let last = Date.now()
  setInterval(() => {
    const now = Date.now()
    if (now - last > 2500) debugLog(`timer was ${((now - last) / 1000).toFixed(1)}s late`)
    last = now
  }, 1000)

  const button = document.createElement('button')
  button.textContent = 'log'
  button.style.cssText = 'position:fixed;right:4px;bottom:4px;z-index:10000;opacity:.6;font-size:12px;padding:2px 6px'
  const panel = document.createElement('div')
  panel.style.cssText = 'position:fixed;left:0;right:0;top:0;bottom:0;z-index:9999;background:#000;color:#0f0;display:none;flex-direction:column;font:11px/1.3 monospace'
  const bar = document.createElement('div')
  panel.appendChild(bar)
  panelText = document.createElement('pre')
  panelText.style.cssText = 'flex:1;overflow:auto;margin:0;padding:4px;white-space:pre-wrap;word-break:break-all'
  panel.appendChild(panelText)
  const action = (label, fn) => {
    const b = document.createElement('button')
    b.textContent = label
    b.style.cssText = 'margin:4px;padding:4px 8px'
    b.onclick = fn
    bar.appendChild(b)
  }
  action('Close', () => { panel.style.display = 'none' })
  action('Clear', () => { entries = []; debugLog('log cleared') })
  action('Copy', () => navigator.clipboard?.writeText(entries.join('\n')).catch(e => debugLog('copy failed: ' + e.name)))
  action('Bottom', () => { panelText.scrollTop = panelText.scrollHeight })
  button.onclick = () => {
    panelText.textContent = entries.join('\n')
    panel.style.display = 'flex'
    panelText.scrollTop = panelText.scrollHeight
  }
  document.body.append(panel, button)
}
