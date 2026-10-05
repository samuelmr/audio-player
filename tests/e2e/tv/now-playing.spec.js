// The Now Playing view (tizen-now-playing.js)
import { test, expect, folder, expectPlaying } from '../fixtures.js'
import { focusOn, queueFolder, queue } from './helpers.js'

const view = (page) => page.locator('#now-playing')
const summary = (page) => page.locator('.queue-summary')

// the queue is collapsed to its summary until Right expands it, and a
// second Right moves to the playing track
async function focusPlayingTrack(page, remote) {
  await focusOn(summary(page))
  await remote.press('Right', {times: 2})
  await expect(queue(page).first()).toBeFocused()
}

test.beforeEach(async ({page, remote}) => {
  // the view waits for the remote to be idle, so the tests move the clock
  await page.clock.install()
  await page.goto('./')
  await expect(folder(page, 'ABBA')).toBeVisible()
  await queueFolder(page, remote, 'Miles Davis', 'So What')
})

test('opens when the remote has been idle while music plays', async ({page}) => {
  await page.clock.fastForward('00:10')
  await expect(view(page)).toBeHidden()
  await page.clock.fastForward('00:11')
  await expect(view(page)).toBeVisible()
  await expect(view(page).locator('.np-title')).toHaveText('So What')
  await expect(view(page).locator('.np-artist')).toHaveText('Miles Davis')
  await expect(view(page).locator('.np-album')).toHaveText('Kind of Blue · 1959')
  await expect(view(page).locator('.np-meta')).toHaveText('Jazz')
  // the remote works it, so it has no buttons
  await expect(view(page).locator('button')).toHaveCount(0)
  await expect(view(page).locator('.up-next li')).toHaveText(['Freddie Freeloader – Miles Davis'])
  await expect(view(page).locator('.time')).toHaveText(/^0:\d\d \/ 0:30$/)
  await expect(view(page)).not.toHaveClass(/no-art/)
  await expect(view(page).locator('.cover img')).toHaveAttribute('src', /cover\.png/)
  expect(await view(page).locator('.cover img').evaluate(img => img.naturalWidth)).toBeGreaterThan(0)
})

test('stays closed while paused', async ({page, remote}) => {
  await remote.press('MediaPause')
  await page.clock.fastForward('00:30')
  await expect(view(page)).toBeHidden()
})

test('OK on the playing track opens it', async ({page, remote}) => {
  await focusPlayingTrack(page, remote)
  await remote.press('OK')
  await expect(view(page)).toBeVisible()
})

test('OK on the player bar opens it, and Back returns there', async ({page, remote}) => {
  const bar = page.locator('audio-player .now')
  await focusOn(bar)
  await remote.press('OK')
  await expect(view(page)).toBeVisible()
  await remote.press('Back')
  await expect(view(page)).toBeHidden()
  await expect(bar).toBeFocused()
})

test('closing it where the focus was hidden meanwhile goes to the player', async ({page, remote}) => {
  await focusPlayingTrack(page, remote)
  await remote.press('Down')
  await expect(queue(page).nth(1)).toBeFocused()
  await page.clock.fastForward('00:21')
  await expect(view(page)).toBeVisible()
  // the queue collapses meanwhile, hiding the track that had the focus
  await page.evaluate(() => document.querySelector('audio-player nav').classList.add('collapsed'))
  await remote.press('Back')
  await expect(page.locator('audio-player #buttons button').nth(1)).toBeFocused()
})

test('the remote works the player in the view, and Back closes it', async ({page, remote}) => {
  const playingTrack = queue(page).first()
  await focusPlayingTrack(page, remote)
  await remote.press('OK')
  await expect(view(page)).toBeVisible()

  await remote.press('Right')
  await expect(view(page).locator('.np-title')).toHaveText('Freddie Freeloader')
  await remote.press('Left')
  await expect(view(page).locator('.np-title')).toHaveText('So What')
  await expectPlaying(page, 'So What')
  await remote.press('OK')
  await expect(view(page).locator('.paused')).toBeVisible()

  await remote.press('Back')
  await expect(view(page)).toBeHidden()
  // the focus is back where it was
  await expect(playingTrack).toBeFocused()
})
