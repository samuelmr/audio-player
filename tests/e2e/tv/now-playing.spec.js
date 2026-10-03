// The Now Playing view (tizen-now-playing.js)
import { test, expect, folder, expectPlaying } from '../fixtures.js'
import { focusOn, queueFolder, queue } from './helpers.js'

const view = (page) => page.locator('#now-playing')

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
  await focusOn(queue(page).first())
  await remote.press('OK')
  await expect(view(page)).toBeVisible()
})

test('the remote works the player in the view, and Back closes it', async ({page, remote}) => {
  const playingTrack = queue(page).first()
  await focusOn(playingTrack)
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
