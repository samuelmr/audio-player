// Shared by the PWA and TV tests:
//   - only the local servers are reachable, so the tests never depend on the
//     internet (the apps load a web font from Google)
//   - the apps start with the fake bucket's settings, unless a test file
//     says test.use({settings: null})
//   - an uncaught error in the page fails the test
//   - the TV app gets a stand-in for the Tizen APIs, and `remote` presses
//     the remote control's keys
import { test as base, expect } from '@playwright/test'
import { SETTINGS, APP_PORT, S3_PORT } from './library.js'

// the codes the TV reports for the keys that tizen.js registers
export const TIZEN_KEYS = {
  MediaPlayPause: 10252,
  MediaPlay: 415,
  MediaPause: 19,
  MediaStop: 413,
  MediaTrackPrevious: 10232,
  MediaTrackNext: 10233,
  ChannelUp: 427,
  ChannelDown: 428,
  MediaRewind: 412,
  MediaFastForward: 417,
}
const BACK = 10009

// before the app's script: what tizen.js uses of the Tizen web APIs,
// and a record of the calls for the tests to check
function installTizen(keys) {
  window.tizenCalls = {registeredKeys: [], exited: false}
  window.tizen = {
    tvinputdevice: {
      registerKey: (name) => {
        if (!(name in keys)) throw new Error(`Unknown key ${name}`)
        window.tizenCalls.registeredKeys.push(name)
      },
      getKey: (name) => ({name, code: keys[name]}),
    },
    application: {
      getCurrentApplication: () => ({exit: () => { window.tizenCalls.exited = true }}),
    },
  }
}

const ARROWS = {Up: 'ArrowUp', Down: 'ArrowDown', Left: 'ArrowLeft', Right: 'ArrowRight', OK: 'Enter'}
// the TV app drops arrow repeats closer than this (spatial-navigation.js)
const PRESS_INTERVAL = 150

export const test = base.extend({
  settings: [SETTINGS, {option: true}],

  context: async ({context}, use) => {
    const local = new Set([`127.0.0.1:${APP_PORT}`, `127.0.0.1:${S3_PORT}`])
    await context.route(url => !local.has(url.host) && url.protocol != 'blob:' && url.protocol != 'data:', route => route.abort())
    await use(context)
  },

  page: async ({page, settings}, use, testInfo) => {
    if (settings) {
      // on every load, but the app's own changes stay
      await page.addInitScript((settings) => {
        if (localStorage.getItem('testSettingsSet')) return
        for (const [key, value] of Object.entries(settings)) {
          localStorage.setItem(key, value)
        }
        localStorage.setItem('testSettingsSet', '1')
      }, settings)
    }
    if (testInfo.project.name == 'tv') {
      await page.addInitScript(installTizen, TIZEN_KEYS)
    }
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    await use(page)
    expect(errors, 'uncaught errors in the page').toEqual([])
  },

  // the remote control of the TV: arrows and OK are keyboard keys,
  // Back and the media keys have codes of their own
  remote: async ({page}, use) => {
    await use({
      async press(key, {times = 1} = {}) {
        for (let i = 0; i < times; i++) {
          if (ARROWS[key]) {
            await page.keyboard.press(ARROWS[key])
          }
          else {
            const keyCode = key == 'Back' ? BACK : TIZEN_KEYS[key]
            if (!keyCode) throw new Error(`No remote key ${key}`)
            await page.evaluate((keyCode) => {
              const target = document.activeElement || document.body
              for (const type of ['keydown', 'keyup']) {
                target.dispatchEvent(new KeyboardEvent(type, {keyCode, which: keyCode, bubbles: true, cancelable: true}))
              }
            }, keyCode)
          }
          await page.waitForTimeout(PRESS_INTERVAL)
        }
      },
    })
  },
})

export { expect }

// helpers for the parts of the apps that both share

export const audioState = (page) => page.evaluate(() => {
  const audio = document.querySelector('audio-player audio')
  return {src: audio.src, paused: audio.paused, currentTime: audio.currentTime, duration: audio.duration}
})

export const queue = (page) => page.locator('audio-player audio-track')
export const playing = (page) => page.locator('audio-player audio-track.playing')
export const folder = (page, name) => page.locator(`audio-browser li.folder[data-folder="${name}"]`)

// the browser plays the track, not only shows it
export async function expectPlaying(page, title) {
  await expect(playing(page).locator('.name a')).toHaveText(title)
  await expect.poll(async () => {
    const state = await audioState(page)
    return !state.paused && state.currentTime > 0
  }, {message: `${title} is playing`}).toBe(true)
}
