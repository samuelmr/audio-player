// Back goes up a level, and from the player asks before exiting (tizen.js)
import { test, expect, folder } from '../fixtures.js'
import { focusOn, queueFolder, queue } from './helpers.js'

const exitDialog = (page) => page.locator('dialog#exit-confirm')
const playerButtons = (page) => page.locator('audio-player #buttons button')
const summary = (page) => page.locator('.queue-summary')

test.beforeEach(async ({page}) => {
  await page.goto('./')
  await expect(folder(page, 'ABBA')).toBeVisible()
})

test('from a queued track to the queue, and from there to the player', async ({page, remote}) => {
  await queueFolder(page, remote, 'Miles Davis', 'So What')
  await focusOn(summary(page))
  await remote.press('Right')
  await focusOn(queue(page).nth(1))
  await remote.press('Back')
  await expect(summary(page)).toBeFocused()
  await remote.press('Back')
  // the play button, now that a track has loaded
  await expect(playerButtons(page).nth(1)).toBeFocused()
})

test('closes an open dialog', async ({page, remote}) => {
  await page.locator('button.gear').click()
  await expect(page.locator('dialog#settings')).toBeVisible()
  await remote.press('Back')
  await expect(page.locator('dialog#settings')).toBeHidden()
})

test('from the player, asks before exiting', async ({page, remote}) => {
  await focusOn(playerButtons(page).first())
  await remote.press('Back')
  await expect(exitDialog(page)).toBeVisible()
  // Cancel has the focus, so a second Back or OK keeps the music playing
  await expect(exitDialog(page).getByRole('button', {name: 'Cancel'})).toBeFocused()
  await remote.press('Back')
  await expect(exitDialog(page)).toBeHidden()
  expect(await page.evaluate(() => tizenCalls.exited)).toBe(false)

  await remote.press('Back')
  await remote.press('Left')
  await expect(exitDialog(page).getByRole('button', {name: 'Exit'})).toBeFocused()
  await remote.press('OK')
  expect(await page.evaluate(() => tizenCalls.exited)).toBe(true)
})
