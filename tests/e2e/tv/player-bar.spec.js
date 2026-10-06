// The player bar and the backdrop (tizen-player.js)
import { test, expect, folder, audioState } from '../fixtures.js'
import { focusOn, queueFolder } from './helpers.js'

const bar = (page) => page.locator('audio-player .now')
const backdrop = (page) => page.locator('#backdrop')
const played = (page) => page.locator('#progress').evaluate(progress => parseFloat(progress.style.getPropertyValue('--played')))

test.beforeEach(async ({page}) => {
  await page.goto('./')
  await expect(folder(page, 'ABBA')).toBeVisible()
})

test('tells how to start when nothing plays', async ({page}) => {
  await expect(bar(page)).toHaveClass(/idle/)
  await expect(bar(page).locator('.now-title')).toHaveText('Nothing playing')
  await expect(bar(page).locator('.now-subtitle')).toHaveText('Pick music from the library and press OK')
  await expect(backdrop(page)).toHaveClass(/no-art/)
})

test('shows the playing track with its art, also behind the app', async ({page, remote}) => {
  await queueFolder(page, remote, 'Miles Davis', 'So What')
  await expect(bar(page)).not.toHaveClass(/idle/)
  await expect(bar(page).locator('.now-title')).toHaveText('So What')
  await expect(bar(page).locator('.now-subtitle')).toHaveText('Miles Davis · Kind of Blue · 1959')
  await expect(bar(page).locator('img')).toHaveAttribute('src', /cover\.png/)
  await expect(backdrop(page)).not.toHaveClass(/no-art/)
  await expect(backdrop(page)).toHaveCSS('background-image', /cover\.png/)

  await remote.press('MediaTrackNext')
  await expect(bar(page).locator('.now-title')).toHaveText('Freddie Freeloader')
})

test('without art, the bar and the backdrop show the hue instead', async ({page, remote}) => {
  await queueFolder(page, remote, 'Björk', 'Human Behaviour')
  await expect(bar(page)).toHaveClass(/no-art/)
  await expect(backdrop(page)).toHaveClass(/no-art/)
})

test('the art of the track before leaves the backdrop with the next one', async ({page, remote}) => {
  await queueFolder(page, remote, 'Miles Davis', 'So What')
  await expect(backdrop(page)).toHaveCSS('background-image', /cover\.png/)
  await focusOn(folder(page, 'Björk'))
  await remote.press('MediaPlay')
  await expect(bar(page).locator('.now-title')).toHaveText('Human Behaviour')
  await expect(backdrop(page)).toHaveClass(/no-art/)
  await expect(backdrop(page)).toHaveCSS('background-image', /^radial-gradient/)
})

test('the progress bar fills as the track plays', async ({page, remote}) => {
  await queueFolder(page, remote, 'Miles Davis', 'So What')
  await expect.poll(() => played(page)).toBeGreaterThan(0)
  await remote.press('MediaFastForward')
  await expect.poll(async () => (await audioState(page)).currentTime).toBeGreaterThanOrEqual(10)
  await expect.poll(() => played(page)).toBeGreaterThanOrEqual(100 * 10 / 30)
})
