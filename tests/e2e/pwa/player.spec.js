import { test, expect, folder, queue, audioState, expectPlaying } from '../fixtures.js'
import { COVER } from '../library.js'

const button = (page, index) => page.locator('audio-player #buttons button').nth(index)
const previous = (page) => button(page, 0)
const play = (page) => button(page, 1)
const next = (page) => button(page, 2)

const isPaused = async (page) => (await audioState(page)).paused

test.beforeEach(async ({page}) => {
  await page.goto('./')
})

test('moves on at the end of a track, and from the last back to the first', async ({page}) => {
  // the ABBA tracks are two seconds long
  await folder(page, 'ABBA').locator('> a.add').click()
  await expectPlaying(page, 'Dancing Queen')
  await expectPlaying(page, 'Knowing Me, Knowing You')
  await expectPlaying(page, 'Money, Money, Money')
  await expectPlaying(page, 'Dancing Queen')
})

test.describe('with long tracks queued', () => {
  test.beforeEach(async ({page}) => {
    await folder(page, 'Miles Davis').locator('> a.add').click()
    await expect(queue(page)).toHaveCount(2)
    await expectPlaying(page, 'So What')
  })

  test('shows the title and length of the track', async ({page}) => {
    await expect(page.locator('#trackTitle')).toHaveValue('So What')
    await expect(page.locator('#trackLength')).toHaveValue('0:30')
    await expect(page).toHaveTitle('So What')
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
