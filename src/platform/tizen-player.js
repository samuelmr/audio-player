// The player bar on the TV (player-bar.js), where OK opens the full Now
// Playing (tizen-now-playing.js). Behind the whole app is the album art,
// blurred and dark, as in Now Playing; without art, a gradient of the
// player's hue.

import { locale } from '../locale.js'
import { initPlayerBar as initBar } from '../player-bar.js'

export function initPlayerBar(player) {
  const backdrop = document.createElement('div')
  backdrop.id = 'backdrop'
  backdrop.className = 'no-art'
  document.body.insertBefore(backdrop, document.body.firstChild)
  const now = initBar(player, {
    hint: locale.addHint,
    onCover: (cover) => {
      backdrop.classList.toggle('no-art', !cover)
      if (cover) backdrop.style.backgroundImage = `url("${cover}")`
    },
  })
  now.tabIndex = 0
}
