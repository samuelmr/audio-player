// TEMPORARY, for finding out why iOS 18.1 stops the music when a track ends.
// Keeps a log of the events of the audio element and of the page lifecycle in
// localStorage (it survives the page being killed), and shows it in a panel
// opened by the "log" button in the corner. Not meant for main.
const KEY = 'debugLog'
const MAX = 400
const t0 = Date.now()
let entries = []
try {
  entries = JSON.parse(localStorage.getItem(KEY)) || []
} catch (e) { /* start with an empty log */ }

const clock = () => new Date().toTimeString().slice(0, 8)

let audioElement
export function debugLog(message) {
  const a = audioElement
  const state = a ? ` [${document.visibilityState} rs${a.readyState} t${a.currentTime.toFixed(1)}/${Number.isFinite(a.duration) ? a.duration.toFixed(1) : '?'}${a.paused ? ' paused' : ''}${a.ended ? ' ended' : ''}]` : ''
  entries.push(`${clock()} +${((Date.now() - t0) / 1000).toFixed(1)}s ${message}${state}`)
  if (entries.length > MAX) entries = entries.slice(-MAX)
  try {
    localStorage.setItem(KEY, JSON.stringify(entries))
  } catch (e) { /* the log is only for debugging */ }
  if (panelText) panelText.textContent = entries.join('\n')
}

let panelText

export function initDebugLog(audio) {
  // the TV app has no use for it, and its remote would focus the button
  if (typeof tizen !== 'undefined') return
  audioElement = audio
  debugLog(`page loaded, standalone=${navigator.standalone}, audioSession=${navigator.audioSession?.type}, ${navigator.userAgent}`)

  for (const type of ['loadstart', 'loadedmetadata', 'canplay', 'canplaythrough', 'play', 'playing', 'pause',
    'waiting', 'stalled', 'suspend', 'abort', 'emptied', 'ended', 'seeking', 'error']) {
    audio.addEventListener(type, () => {
      const src = audio.currentSrc.startsWith('blob:') ? 'blob' : audio.currentSrc ? 'remote' : 'none'
      debugLog(`audio ${type} (${src}${audio.error ? ', error ' + audio.error.code + ' ' + audio.error.message : ''})`)
    })
  }
  for (const type of ['visibilitychange', 'freeze', 'resume']) {
    document.addEventListener(type, () => debugLog(`document ${type}`))
  }
  for (const type of ['pagehide', 'pageshow', 'online', 'offline']) {
    window.addEventListener(type, () => debugLog(`window ${type}`))
  }

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
