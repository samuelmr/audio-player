// The installed app and its offline playlists (sw.js, offline.js)
import { test, expect, folder, queue, audioState, expectPlaying } from '../fixtures.js'

const offlineFolder = (page) => page.locator('#offline-playlists > li.folder')
const offlinePlaylist = (page, title) => page.locator('#offline-playlists li.playlist', {hasText: title})

// the service worker caches the app as it's loaded under its control
async function loadUnderServiceWorker(page) {
  await page.goto('./')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  await expect(folder(page, 'ABBA')).toBeVisible()
}

async function saveQueueOffline(page, name) {
  await page.locator('audio-player button.save-offline').click()
  const dialog = page.locator('dialog#save-offline')
  await expect(dialog.locator('#offlineNameInput')).toHaveValue(name)
  await dialog.getByRole('button', {name: 'Save offline'}).click()
}

const storedKeys = (page) => page.evaluate(() => new Promise((resolve, reject) => {
  const request = indexedDB.open('audio-library')
  request.onerror = () => reject(request.error)
  request.onsuccess = () => {
    const keys = request.result.transaction('offlineAudio').objectStore('offlineAudio').getAllKeys()
    keys.onsuccess = () => resolve(keys.result)
  }
}))

test('can be installed', async ({page, request}) => {
  await page.goto('./')
  const href = await page.locator('link[rel=manifest]').getAttribute('href')
  const manifest = await (await request.get(href)).json()
  expect(manifest.name).toBeTruthy()
  expect(['fullscreen', 'standalone', 'minimal-ui']).toContain(manifest.display)
  for (const icon of manifest.icons) {
    expect((await request.get(icon.src)).ok(), icon.src).toBe(true)
  }
  expect((await request.get(manifest.start_url)).ok()).toBe(true)
})

test('opens offline, also from the home screen', async ({page, context}) => {
  await loadUnderServiceWorker(page)
  await context.setOffline(true)
  await page.reload()
  await expect(page.locator('audio-player #buttons')).toBeVisible()
  // the manifest's start_url has a query string, which the cache ignores
  await page.goto('./?homescreen=1')
  await expect(page.locator('audio-player #buttons')).toBeVisible()
  await context.setOffline(false)
})

test('saves the queue for offline use, and plays it offline', async ({page, context}) => {
  await loadUnderServiceWorker(page)
  await folder(page, 'ABBA').locator('> a.add').click()
  await expect(queue(page)).toHaveCount(3)
  await saveQueueOffline(page, 'ABBA')
  await expect(offlinePlaylist(page, 'ABBA').locator('.offline-status')).toHaveText('3/3')
  await expect(queue(page).and(page.locator('.offline-saved'))).toHaveCount(3)

  await context.setOffline(true)
  await page.reload()
  // offline, the offline playlists are open, as they are all there is to play
  await expect(offlineFolder(page)).toHaveClass(/open/)
  await offlinePlaylist(page, 'ABBA').locator('a.add').click()
  await expect(queue(page).locator('.name a')).toHaveText(['Dancing Queen', 'Knowing Me, Knowing You', 'Money, Money, Money'])
  await expectPlaying(page, 'Dancing Queen')
  expect((await audioState(page)).src).toMatch(/^blob:/)
  await context.setOffline(false)
})

test('removes an offline playlist and its tracks', async ({page}) => {
  await page.goto('./')
  await folder(page, 'Björk').locator('> a.add').click()
  await expect(queue(page)).toHaveCount(1)
  await saveQueueOffline(page, 'Björk')
  await expect(offlinePlaylist(page, 'Björk').locator('.offline-status')).toHaveText('1/1')
  expect(await storedKeys(page)).toEqual(['Björk/Debut/01 Human Behaviour.mp3'])

  await offlineFolder(page).click({position: {x: 5, y: 5}})
  page.once('dialog', dialog => dialog.accept())
  await offlinePlaylist(page, 'Björk').locator('a.remove').click()
  await expect(page.locator('#offline-playlists')).toBeHidden()
  await expect(queue(page).first()).not.toHaveClass(/offline-saved/)
  await expect.poll(() => storedKeys(page)).toEqual([])
})

test('marks the tracks that fail to download', async ({page}) => {
  await page.route(url => url.pathname.includes('Knowing') && url.searchParams.has('X-Amz-Signature'), route => route.fulfill({status: 500}))
  await page.goto('./')
  await folder(page, 'ABBA').locator('> a.add').click()
  await expect(queue(page)).toHaveCount(3)
  await saveQueueOffline(page, 'ABBA')
  await expect(offlinePlaylist(page, 'ABBA').locator('.offline-status')).toHaveText('2/3')
  await expect(queue(page).nth(1)).toHaveClass(/offline-failed/)
})
