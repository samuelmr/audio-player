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
  test('is collapsed to a summary of the count and the next track', async ({page}) => {
    await expect(summary(page).locator('.count')).toHaveText('Queue: 2 tracks')
    await expect(summary(page).locator('.next')).toHaveText('Up next: Freddie Freeloader – Miles Davis')
    await expect(queue(page)).toHaveCount(2)
    await expect(queue(page).nth(0)).toBeHidden()
    await expect(queue(page).nth(1)).toBeHidden()
    await expect(page.locator('audio-player ol.collection')).toBeHidden()
    await expect(page.locator('audio-player button.save-offline')).toBeHidden()
  })

  test('expanded, shows the sources of the tracks and Save offline', async ({page, remote}) => {
    await focusOn(summary(page))
    await remote.press('OK')
    await expect(page.locator('audio-player ol.collection li')).toHaveText(['Miles Davis'])
    await expect(page.locator('audio-player button.save-offline')).toBeVisible()
  })

  test('a song added by itself has a source of its own, to remove it alone', async ({page, remote}) => {
    await focusOn(page.locator('audio-browser li.song[data-key="KLF - 3 a.m. Eternal.mp3"]'))
    await remote.press('OK')
    await expect(queue(page)).toHaveCount(3)
    await focusOn(summary(page))
    await remote.press('OK')
    const sources = page.locator('audio-player ol.collection li')
    await expect(sources).toHaveText(['Miles Davis', 'KLF - 3 a.m. Eternal.mp3'])
    await focusOn(sources.nth(1).locator('a'))
    await remote.press('OK')
    await expect(sources).toHaveText(['Miles Davis'])
    await expect(queue(page).locator('.name a')).toHaveText(['So What', 'Freddie Freeloader'])
  })

  test('the next track follows the playing one', async ({page, remote}) => {
    await remote.press('MediaTrackNext')
    await expectPlaying(page, 'Freddie Freeloader')
    await expect(summary(page).locator('.next')).toBeEmpty()
  })

  test('Right expands it and moves into it, Left collapses it', async ({page, remote}) => {
    await focusOn(summary(page))
    await remote.press('Right')
    await expect(queue(page).nth(1)).toBeVisible()
    // to the playing track
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

// The TV plays one audio element at a time: a track loaded into the other
// element stops the one that plays
test.describe('one audio element', () => {
  const current = (page) => page.evaluate(() => {
    const audio = document.querySelector('audio-player audio.current')
    return {name: audio.dataset.name, src: audio.getAttribute('src')}
  })

  test('plays the next track from memory in the same element', async ({page, remote}) => {
    await page.evaluate(() => {
      window.otherLoaded = []
      new MutationObserver((records) => {
        for (const {target} of records) {
          if (!target.classList.contains('current') && target.getAttribute('src')) {
            window.otherLoaded.push(target.getAttribute('src'))
          }
        }
      }).observe(document.querySelector('audio-player'), {subtree: true, attributes: true, attributeFilter: ['src']})
    })
    const first = await current(page)
    // the keys of the remote leave the other element alone too
    await focusOn(summary(page))
    await remote.press('OK')
    await remote.press('OK')
    await expect.poll(() => page.evaluate(() => performance.getEntriesByType('resource')
      .some(entry => entry.initiatorType == 'fetch' && entry.name.includes('Freeloader')))).toBe(true)
    await remote.press('MediaTrackNext')
    await expectPlaying(page, 'Freddie Freeloader')
    const second = await current(page)
    expect(second.name).toBe(first.name)
    expect(second.src).toMatch(/^blob:/)
    expect(await page.evaluate(() => window.otherLoaded)).toEqual([])
  })
})

test.describe('Shuffle', () => {
  test('in the open queue, OK shuffles the queue with the playing track first, and OK again unshuffles it', async ({page, remote}) => {
    await focusOn(folder(page, 'ABBA'))
    await remote.press('OK')
    await expect(queue(page)).toHaveCount(5)
    await focusOn(summary(page))
    await remote.press('OK')
    const shuffle = page.locator('audio-player button.shuffle')
    await expect(shuffle).toBeVisible()
    await focusOn(page.locator('audio-player ol.collection li').last())
    await remote.press('Right')
    await remote.press('Right')
    await expect(shuffle).toBeFocused()
    await page.evaluate(() => { Math.random = () => 0 })
    await remote.press('OK')
    await expect(queue(page).locator('.name a')).toHaveText(['So What', 'Dancing Queen', 'Knowing Me, Knowing You', 'Money, Money, Money', 'Freddie Freeloader'])
    await expect(shuffle).toBeFocused()
    await remote.press('MediaTrackNext')
    await expectPlaying(page, 'Dancing Queen')
    // OK again puts it back in the order of adding
    await remote.press('OK')
    await expect(shuffle).toHaveAttribute('aria-pressed', 'false')
    await expect(queue(page).locator('.name a')).toHaveText(['So What', 'Freddie Freeloader', 'Dancing Queen', 'Knowing Me, Knowing You', 'Money, Money, Money'])
    await expectPlaying(page, 'Dancing Queen')
  })
})
