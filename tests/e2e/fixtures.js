// Shared by the PWA and TV tests:
//   - only the local servers are reachable, so the tests never depend on the
//     internet (the apps load a web font from Google)
//   - the apps start with the fake bucket's settings, unless a test file
//     says test.use({settings: null})
//   - an uncaught error in the page fails the test
//   - the TV apps get a stand-in for their platform: the Tizen APIs, or
//     what the Google TV app's activity adds to the page; `remote` presses
//     the remote control's keys, the way each platform sends them
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
  window.tvCalls = {registeredKeys: [], exited: false}
  window.tizen = {
    tvinputdevice: {
      registerKey: (name) => {
        if (!(name in keys)) throw new Error(`Unknown key ${name}`)
        window.tvCalls.registeredKeys.push(name)
      },
      getKey: (name) => ({name, code: keys[name]}),
    },
    application: {
      getCurrentApplication: () => ({exit: () => { window.tvCalls.exited = true }}),
    },
  }
}

// what the Google TV app's activity (android/) adds to the page
function installAndroidTv() {
  window.tvCalls = {exited: false}
  window.AndroidTv = {exit: () => { window.tvCalls.exited = true }}
}

const TV_PROJECTS = ['tizen', 'androidtv']

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
    if (testInfo.project.name == 'tizen') {
      await page.addInitScript(installTizen, TIZEN_KEYS)
    }
    else if (testInfo.project.name == 'androidtv') {
      await page.addInitScript(installAndroidTv)
    }
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    await use(page)
    expect(errors, 'uncaught errors in the page').toEqual([])
  },

  // The remote control of the TV: arrows and OK are keyboard keys. On the
  // Samsung TVs, Back and the media keys have codes of their own; the Google
  // TV app's activity sends them as a keydown named by the web's key value.
  remote: async ({page}, use, testInfo) => {
    if (!TV_PROJECTS.includes(testInfo.project.name)) throw new Error('The remote is for the TV apps')
    const android = testInfo.project.name == 'androidtv'
    await use({
      async press(key, {times = 1} = {}) {
        for (let i = 0; i < times; i++) {
          if (ARROWS[key]) {
            await page.keyboard.press(ARROWS[key])
          }
          else {
            if (key != 'Back' && !TIZEN_KEYS[key]) throw new Error(`No remote key ${key}`)
            const init = android
              ? {key: key == 'Back' ? 'GoBack' : key, types: ['keydown']}
              : {keyCode: key == 'Back' ? BACK : TIZEN_KEYS[key], types: ['keydown', 'keyup']}
            await page.evaluate(({types, ...init}) => {
              const target = document.activeElement || document.body
              for (const type of types) {
                target.dispatchEvent(new KeyboardEvent(type, {...init, which: init.keyCode, bubbles: true, cancelable: true}))
              }
            }, init)
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
  const audio = document.querySelector('audio-player audio.current')
  return {src: audio.src, paused: audio.paused, currentTime: audio.currentTime, duration: audio.duration}
})

export const queue = (page) => page.locator('audio-player audio-track')
export const playing = (page) => page.locator('audio-player audio-track.playing')
export const folder = (page, name) => page.locator(`audio-browser li.folder[data-folder="${name}"]`)

// The web app adds a folder from the first row of its contents, Add all.
// Right after opening it, while it may still be listed, as people would.
export async function addFolder(page, name) {
  const item = folder(page, name)
  if (!await item.evaluate(li => li.classList.contains('open'))) {
    await item.click({position: {x: 5, y: 5}})
  }
  await item.locator('> a.add').click()
}

// the browser plays the track, not only shows it
export async function expectPlaying(page, title) {
  await expect(playing(page).locator('.name a')).toHaveText(title)
  await expect.poll(async () => {
    const state = await audioState(page)
    return !state.paused && state.currentTime > 0
  }, {message: `${title} is playing`}).toBe(true)
}
