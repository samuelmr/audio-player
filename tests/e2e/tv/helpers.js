import { expect, folder, queue, expectPlaying } from '../fixtures.js'

export const focused = (page) => page.locator(':focus')

// puts the focus somewhere to start from, the way the app moves it
export async function focusOn(locator) {
  await locator.evaluate((element) => {
    if (!element.hasAttribute('tabindex')) element.tabIndex = -1
    element.focus()
  })
  await expect(locator).toBeFocused()
}

export const toast = (page) => page.locator('.toast')

// the library is listed, and the folder's tracks are queued and playing
export async function queueFolder(page, remote, name, firstTitle) {
  await focusOn(folder(page, name))
  await remote.press('OK')
  await expectPlaying(page, firstTitle)
}

export { queue }
