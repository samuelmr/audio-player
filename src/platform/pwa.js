// The web app: browsers on phones and computers
import qrcode from "qrcode-generator"
import jsQR from "jsqr"
import { locale } from '../locale.js'
import { reportError } from '../errors.js'
import { SETTINGS_CODE_PREFIX } from '../settings-code.js'
import { initKeyboard } from '../keyboard.js'
import { expandSVG } from '../icons.js'
import { playerList } from '../player.js'
import { initPlayerBar } from '../player-bar.js'
import { initQueue } from '../queue.js'
import { initAdding, itemName, startAdding } from '../adding.js'
import { initNowPlaying, open as openNowPlaying, close as closeNowPlaying, isOpen } from '../now-playing.js'

export function init() {
  const player = document.querySelector('audio-player')
  initQueue(player, playerList)
  const now = initPlayerBar(player, {hint: locale.addHintClick})
  initNowPlayingButtons(player, now)
  initAdding(playerList)
  // a click on a name in the library adds it: the add link covers the row.
  // Not the clicks of the code, such as of a link's folder or song on load.
  document.querySelector('audio-browser').addEventListener('click', (e) => {
    const add = e.isTrusted && e.target.closest('a.action.add')
    if (add) startAdding(itemName(add.parentNode))
  }, true)
  initKeyboard()
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(e => console.warn('Service worker registration failed:', e))
  }
}

// Now Playing opens with the expand button at the top right, or a tap on
// the album art, and closes with its own button or Esc. The page under it
// doesn't scroll meanwhile. On a computer, the expand button also makes the
// browser full screen, as its icon says, and leaving full screen, such as
// with Esc, closes Now Playing too. When nothing plays, there is no Now
// Playing to open, and the button only toggles full screen. Phones keep their
// browser as it is, and hide the button then: iPhones can't make a page full
// screen.
function initNowPlayingButtons(player, now) {
  const expand = document.createElement('button')
  expand.type = 'button'
  expand.className = 'np-open'
  expand.innerHTML = expandSVG
  player.appendChild(expand)

  const computer = window.matchMedia('(hover: hover) and (pointer: fine)')
  let fullScreen = false
  const view = initNowPlaying({controls: true, onClose: () => {
    document.documentElement.style.overflow = ''
    if (view.contains(document.activeElement)) expand.focus()
    if (fullScreen && document.fullscreenElement) {
      document.exitFullscreen().catch(e => console.warn('Leaving full screen failed:', e))
    }
    fullScreen = false
  }})
  // the button's text follows what it does
  const label = () => {
    const text = player.classList.contains('idle') ? locale.fullScreen : locale.nowPlaying
    expand.title = text
    expand.setAttribute('aria-label', text)
  }
  new MutationObserver(label).observe(player, {attributes: true, attributeFilter: ['class']})
  label()
  const toggleFullScreen = () => {
    const change = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()
    change.catch(e => reportError(e, locale.fullScreenFailed))
  }
  const open = (e) => {
    if (!openNowPlaying()) {
      if (e.currentTarget == expand && computer.matches && document.fullscreenEnabled) toggleFullScreen()
      return
    }
    document.documentElement.style.overflow = 'hidden'
    view.querySelector('.np-close').focus()
    if (e.currentTarget == expand && computer.matches && document.fullscreenEnabled && !document.fullscreenElement) {
      fullScreen = true
      document.documentElement.requestFullscreen().catch((e) => {
        fullScreen = false
        console.warn('Going full screen failed:', e)
      })
    }
  }
  expand.onclick = open
  now.querySelector('.now-art').onclick = open
  document.addEventListener('fullscreenchange', () => {
    if (fullScreen && !document.fullscreenElement) closeNowPlaying()
  })
  window.addEventListener('keydown', (e) => {
    if (e.key == 'Escape' && isOpen()) closeNowPlaying()
  })
}

// the settings code moves through the clipboard or a QR code
export function addTransferControls({ dialog, container, addButton, exportCode, importCode, setMessage }) {
  addButton(locale.copySettings, async () => {
    await navigator.clipboard.writeText(exportCode())
    setMessage(locale.copied)
  })

  addButton(locale.pasteSettings, async () => {
    let code
    try {
      code = await navigator.clipboard.readText()
    } catch(e) {
      // clipboard read not allowed, let the user paste manually
    }
    if (!code?.startsWith(SETTINGS_CODE_PREFIX)) {
      code = prompt(locale.pastePrompt)
    }
    if (code) {
      try {
        importCode(code)
      } catch(e) {
        setMessage(e.message)
      }
    }
  })

  const qrContainer = document.createElement('div')
  qrContainer.className = 'qr'

  const hideQR = () => {
    qrContainer.innerHTML = ''
    qrButton.textContent = locale.showQR
  }

  const qrButton = addButton(locale.showQR, () => {
    if (qrContainer.firstChild) {
      hideQR()
      return
    }
    stopScan()
    const qr = qrcode(0, 'M')
    qr.addData(exportCode())
    qr.make()
    qrContainer.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true })
    qrButton.textContent = locale.hideQR
  })

  const scanVideo = document.createElement('video')
  scanVideo.setAttribute('playsinline', '')
  scanVideo.muted = true
  const scanCanvas = document.createElement('canvas')
  let scanStream

  const stopScan = () => {
    if (scanStream) {
      scanStream.getTracks().forEach(track => track.stop())
      scanStream = null
    }
    scanVideo.srcObject = null
    scanVideo.remove()
    scanButton.textContent = locale.scanQR
  }

  const scanFrame = () => {
    if (!scanStream) {
      return
    }
    try {
      if (scanVideo.readyState >= scanVideo.HAVE_ENOUGH_DATA) {
        scanCanvas.width = scanVideo.videoWidth
        scanCanvas.height = scanVideo.videoHeight
        const ctx = scanCanvas.getContext('2d', { willReadFrequently: true })
        ctx.drawImage(scanVideo, 0, 0)
        const image = ctx.getImageData(0, 0, scanCanvas.width, scanCanvas.height)
        const result = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' })
        if (result?.data?.startsWith(SETTINGS_CODE_PREFIX)) {
          stopScan()
          importCode(result.data)
          return
        }
      }
    } catch(e) {
      // a frame that can't be read ends the scan, since the next would fail too
      stopScan()
      setMessage(e.message)
      return
    }
    requestAnimationFrame(scanFrame)
  }

  const scanButton = addButton(locale.scanQR, async () => {
    if (scanStream) {
      stopScan()
      return
    }
    hideQR()
    scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
    scanVideo.srcObject = scanStream
    qrContainer.appendChild(scanVideo)
    try {
      await scanVideo.play()
    } catch(e) {
      // the camera would stay on
      stopScan()
      throw e
    }
    scanButton.textContent = locale.stopScan
    requestAnimationFrame(scanFrame)
  })

  container.appendChild(qrContainer)

  dialog.addEventListener('close', () => {
    hideQR()
    stopScan()
  })
}
