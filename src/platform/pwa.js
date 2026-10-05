// The web app: browsers on phones and computers
import qrcode from "qrcode-generator"
import jsQR from "jsqr"
import { locale } from '../locale.js'
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
  // Not the clicks of the code, as a folder adds its songs by clicking them.
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
// doesn't scroll meanwhile.
function initNowPlayingButtons(player, now) {
  const expand = document.createElement('button')
  expand.type = 'button'
  expand.className = 'np-open'
  expand.title = locale.nowPlaying
  expand.setAttribute('aria-label', locale.nowPlaying)
  expand.innerHTML = expandSVG
  player.appendChild(expand)

  const view = initNowPlaying({controls: true, onClose: () => {
    document.documentElement.style.overflow = ''
    if (view.contains(document.activeElement)) expand.focus()
  }})
  const open = () => {
    if (!openNowPlaying()) return
    document.documentElement.style.overflow = 'hidden'
    view.querySelector('.np-close').focus()
  }
  expand.onclick = open
  now.querySelector('.now-art').onclick = open
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
      importCode(code)
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
    if (scanVideo.readyState >= scanVideo.HAVE_ENOUGH_DATA) {
      scanCanvas.width = scanVideo.videoWidth
      scanCanvas.height = scanVideo.videoHeight
      const ctx = scanCanvas.getContext('2d', { willReadFrequently: true })
      ctx.drawImage(scanVideo, 0, 0)
      const image = ctx.getImageData(0, 0, scanCanvas.width, scanCanvas.height)
      const result = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' })
      if (result?.data?.startsWith(SETTINGS_CODE_PREFIX)) {
        stopScan()
        try {
          importCode(result.data)
        } catch(e) {
          setMessage(e.message)
        }
        return
      }
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
    await scanVideo.play()
    scanButton.textContent = locale.stopScan
    requestAnimationFrame(scanFrame)
  })

  container.appendChild(qrContainer)

  dialog.addEventListener('close', () => {
    hideQR()
    stopScan()
  })
}
