// The queue (tizen-queue.js) and the media keys of the remote (tizen.js)
import { test, expect, folder, audioState, expectPlaying } from '../fixtures.js'
import { focusOn, queueFolder, queue } from './helpers.js'

const summary = (page) => page.locator('.queue-summary')
const isPaused = async (page) => (await audioState(page)).paused
const currentTime = async (page) => (await audioState(page)).currentTime

test.beforeEach(async ({page, remote}) => {
  await page.goto('./')
  await expect(folder(page, 'ABBA')).toBeVisible()
  await queueFolder(page, remote, 'Miles Davis', 'So What')
})

test.describe('the queue', () => {
  test('is collapsed to a summary and the playing track', async ({page}) => {
    await expect(summary(page)).toHaveText('Queue: 2 tracks')
    await expect(queue(page).nth(0)).toBeVisible()
    await expect(queue(page).nth(1)).toBeHidden()
  })

  test('Right expands it and moves into it, Left collapses it', async ({page, remote}) => {
    await focusOn(summary(page))
    await remote.press('Right')
    await expect(queue(page).nth(1)).toBeVisible()
    await remote.press('Right')
    await expect(queue(page).nth(0)).toBeFocused()
    await remote.press('Down')
    await expect(queue(page).nth(1)).toBeFocused()
    await remote.press('Left')
    await expect(summary(page)).toBeFocused()
    await expect(queue(page).nth(1)).toBeHidden()
  })

  test('OK on the summary expands and collapses it', async ({page, remote}) => {
    await focusOn(summary(page))
    await remote.press('OK')
    await expect(queue(page).nth(1)).toBeVisible()
    await remote.press('OK')
    await expect(queue(page).nth(1)).toBeHidden()
  })

  test('OK on a queued track plays it', async ({page, remote}) => {
    await focusOn(summary(page))
    await remote.press('Right')
    await focusOn(queue(page).nth(1))
    await remote.press('OK')
    await expectPlaying(page, 'Freddie Freeloader')
  })
})

test.describe('the media keys', () => {
  test('play and pause', async ({page, remote}) => {
    await remote.press('MediaPlayPause')
    await expect.poll(() => isPaused(page)).toBe(true)
    await remote.press('MediaPlayPause')
    await expect.poll(() => isPaused(page)).toBe(false)
    await remote.press('MediaPause')
    await expect.poll(() => isPaused(page)).toBe(true)
    await remote.press('MediaPlay')
    await expect.poll(() => isPaused(page)).toBe(false)
    await remote.press('MediaStop')
    await expect.poll(() => isPaused(page)).toBe(true)
  })

  test('go to the next and previous track, and so do the channel keys', async ({page, remote}) => {
    await remote.press('MediaTrackNext')
    await expectPlaying(page, 'Freddie Freeloader')
    await remote.press('MediaTrackPrevious')
    await expectPlaying(page, 'So What')
    await remote.press('ChannelUp')
    await expectPlaying(page, 'Freddie Freeloader')
    await remote.press('ChannelDown')
    await expectPlaying(page, 'So What')
  })

  test('seek ten seconds', async ({page, remote}) => {
    await remote.press('MediaFastForward')
    await expect.poll(() => currentTime(page)).toBeGreaterThanOrEqual(10)
    await remote.press('MediaRewind')
    await expect.poll(() => currentTime(page)).toBeLessThan(10)
  })
})
