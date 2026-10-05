import { test, expect, folder, queue, audioState, expectPlaying, addFolder } from '../fixtures.js'
import { COVER } from '../library.js'

const button = (page, index) => page.locator('audio-player #buttons button').nth(index)
const previous = (page) => button(page, 0)
const play = (page) => button(page, 1)
const next = (page) => button(page, 2)

const isPaused = async (page) => (await audioState(page)).paused
const bar = (page) => page.locator('audio-player .now')
const summary = (page) => page.locator('.queue-summary')

test.beforeEach(async ({page}) => {
  await page.goto('./')
})

test('tells how to start when nothing plays', async ({page}) => {
  await expect(bar(page).locator('.now-title')).toHaveText('Nothing playing')
  await expect(bar(page).locator('.now-subtitle')).toHaveText('Add music to the queue from the library below')
  await expect(page.locator('audio-player button.np-open')).toBeHidden()
  await expect(summary(page)).toBeHidden()
})

test('moves on at the end of a track, and from the last back to the first', async ({page}) => {
  // the ABBA tracks are two seconds long
  await addFolder(page, 'ABBA')
  await expectPlaying(page, 'Dancing Queen')
  await expectPlaying(page, 'Knowing Me, Knowing You')
  await expectPlaying(page, 'Money, Money, Money')
  await expectPlaying(page, 'Dancing Queen')
})

test.describe('with long tracks queued', () => {
  test.beforeEach(async ({page}) => {
    await addFolder(page, 'Miles Davis')
    await expect(queue(page)).toHaveCount(2)
    await expectPlaying(page, 'So What')
  })

  test('shows the title and length of the track', async ({page}) => {
    await expect(page.locator('#trackTitle')).toHaveValue('So What')
    await expect(page.locator('#trackLength')).toHaveValue('0:30')
    await expect(page).toHaveTitle('So What')
  })

  test('shows the playing track in the player bar', async ({page}) => {
    await expect(bar(page).locator('.now-title')).toHaveText('So What')
    await expect(bar(page).locator('.now-subtitle')).toHaveText('Miles Davis · Kind of Blue · 1959')
    await expect(bar(page).locator('img')).toHaveAttribute('src', /cover\.png/)
  })

  test('the queue is open, and its summary closes and opens it', async ({page}) => {
    await expect(summary(page).locator('.count')).toHaveText('Queue: 2 tracks')
    await expect(summary(page).locator('.next')).toHaveText('Up next: Freddie Freeloader – Miles Davis')
    await expect(summary(page)).toHaveAttribute('aria-expanded', 'true')
    await expect(queue(page).first()).toBeVisible()
    await expect(page.locator('audio-player .collection')).toBeVisible()

    await summary(page).click()
    await expect(summary(page)).toHaveAttribute('aria-expanded', 'false')
    await expect(queue(page).first()).toBeHidden()
    await expect(page.locator('audio-player .collection')).toBeHidden()
    // on the summary's row, so it stays
    await expect(page.locator('audio-player button.save-offline')).toBeVisible()

    await summary(page).click()
    await expect(queue(page).first()).toBeVisible()
  })

  test('Now Playing opens with the expand button, and works the player', async ({page}) => {
    const view = page.locator('#now-playing')
    await page.locator('audio-player button.np-open').click()
    await expect(view).toBeVisible()
    await expect(view.locator('.np-title')).toHaveText('So What')
    await expect(view.locator('.np-meta')).toHaveText('Jazz')
    await expect(view.locator('.up-next li')).toHaveText(['Freddie Freeloader – Miles Davis'])

    await view.locator('.np-next').click()
    await expectPlaying(page, 'Freddie Freeloader')
    await expect(view.locator('.np-title')).toHaveText('Freddie Freeloader')
    await view.locator('.np-previous').click()
    await expectPlaying(page, 'So What')
    await view.locator('.np-play').click()
    await expect.poll(() => isPaused(page)).toBe(true)
    await expect(view.locator('.paused')).toBeVisible()
    await view.locator('.np-play').click()
    await expect.poll(() => isPaused(page)).toBe(false)

    // a click on the progress bar seeks
    const progressBar = view.locator('.bar')
    const box = await progressBar.boundingBox()
    await progressBar.click({position: {x: box.width * 0.75, y: box.height / 2}})
    await expect.poll(async () => (await audioState(page)).currentTime).toBeGreaterThanOrEqual(20)

    await view.locator('.np-close').click()
    await expect(view).toBeHidden()
    await expect(page.locator('audio-player button.np-open')).toBeFocused()
  })

  test('on a computer, the expand button also makes the browser full screen', async ({page}) => {
    const view = page.locator('#now-playing')
    const isFullScreen = () => page.evaluate(() => Boolean(document.fullscreenElement))
    await page.locator('audio-player button.np-open').click()
    await expect(view).toBeVisible()
    await expect.poll(isFullScreen).toBe(true)
    await view.locator('.np-close').click()
    await expect(view).toBeHidden()
    await expect.poll(isFullScreen).toBe(false)

    // leaving full screen, as Esc does, closes Now Playing too
    await page.locator('audio-player button.np-open').click()
    await expect.poll(isFullScreen).toBe(true)
    await page.evaluate(() => document.exitFullscreen())
    await expect(view).toBeHidden()
  })

  test('the album art opens Now Playing without full screen', async ({page}) => {
    await bar(page).locator('.now-art').click()
    await expect(page.locator('#now-playing')).toBeVisible()
    expect(await page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false)
  })

  test('Now Playing opens with a tap on the album art, and Esc closes it', async ({page}) => {
    const view = page.locator('#now-playing')
    await bar(page).locator('.now-art').click()
    await expect(view).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(view).toBeHidden()
  })

  test('shows the album art, and takes its color', async ({page}) => {
    await expect(queue(page).first()).toHaveAttribute('style', /cover\.png/)
    await expect.poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue('--base-hue'))).toBe(String(COVER.hue))
  })

  test('pauses and resumes', async ({page}) => {
    await play(page).click()
    await expect.poll(() => isPaused(page)).toBe(true)
    await play(page).click()
    await expect.poll(() => isPaused(page)).toBe(false)
  })

  test('goes to the next and previous track', async ({page}) => {
    await next(page).click()
    await expectPlaying(page, 'Freddie Freeloader')
    await previous(page).click()
    await expectPlaying(page, 'So What')
  })

  test('plays a queued track when it is clicked', async ({page}) => {
    await queue(page).nth(1).locator('.name a').click()
    await expectPlaying(page, 'Freddie Freeloader')
  })

  test('plays a queued track when it is clicked anywhere, not only on its title', async ({page}) => {
    const track = queue(page).nth(1)
    const box = await track.boundingBox()
    await track.click({position: {x: box.width - 20, y: box.height / 2}})
    await expectPlaying(page, 'Freddie Freeloader')
  })

  test('seeks with the progress bar', async ({page}) => {
    await page.locator('#progress').fill('20')
    await expect.poll(async () => (await audioState(page)).currentTime).toBeGreaterThanOrEqual(20)
  })

  test('has keyboard shortcuts', async ({page}) => {
    await page.locator('body').click({position: {x: 1, y: 1}})
    await page.keyboard.press(' ')
    await expect.poll(() => isPaused(page)).toBe(true)
    await page.keyboard.press(' ')
    await expect.poll(() => isPaused(page)).toBe(false)
    await page.keyboard.press('ArrowRight')
    await expectPlaying(page, 'Freddie Freeloader')
    await page.keyboard.press('ArrowLeft')
    await expectPlaying(page, 'So What')
  })
})
