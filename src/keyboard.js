import { play, playNext, playPrevious } from './player.js'

// keyboard shortcuts for desktop browsers
export function initKeyboard() {
  window.addEventListener('keydown', (e) => {
      if (e.target.tagName.toLowerCase() == 'button') return
      if (e.target.type == 'range') return
      if (e.target.type == 'search') return
      let current = document.querySelector('audio-track:focus-within')
      let newCurrent = false
      switch(e.key) {
        case " ": e.preventDefault(); play.click(); break
        // case "Enter": play.disabled = true; audio.src = current.dataset.src; break
        case "Enter": current.querySelector('.name a')?.click(); break
        case "ArrowRight": playNext(); break
        case "ArrowLeft": playPrevious(); break
        case "ArrowDown":
          e.preventDefault()
          if (current) {
            if (current.nextElementSibling) {
              newCurrent = current.nextElementSibling
            }
            else {
              newCurrent = current.parentNode.firstElementChild
            }
          }
          break
        case "ArrowUp":
          e.preventDefault()
          if (current) {
            if (current.previousElementSibling) {
              newCurrent = current.previousElementSibling
            }
            else {
              newCurrent = current.parentNode.lastElementChild
            }
          }
          break
      }
      if (newCurrent) {
          newCurrent.focus()
      }
  })
}
