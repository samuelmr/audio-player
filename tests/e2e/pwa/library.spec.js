import { test, expect, folder, queue, playing, audioState, expectPlaying } from '../fixtures.js'

const titles = (page) => queue(page).locator('.name a')

// the folder's own row, not the + link or its contents
const openFolder = (page, name) => folder(page, name).click({position: {x: 5, y: 5}})

test.beforeEach(async ({page}) => {
  await page.goto('./')
})

test('lists the folders and playlists at the top of the bucket', async ({page}) => {
  await expect(page.locator('audio-browser > nav:not(#skipNav) > ol:not(.playlists) > li.folder')).toHaveText(['ABBA', 'Björk', 'Miles Davis'])
  // a shortcut for each first letter, after the player's and the playlists'
  await expect(page.locator('#skipNav ol a')).toHaveText(['', '#', 'A', 'B', 'M'])
  // the playlist is on the second page of the listing
  await page.locator('#playlists > li.folder').click({position: {x: 5, y: 5}})
  await expect(page.locator('#playlists li.playlist')).toHaveText(['Road trip.json'])
})

test('opens a folder', async ({page}) => {
  await openFolder(page, 'ABBA')
  await expect(folder(page, 'ABBA/Arrival')).toBeVisible()
  await expect(folder(page, 'ABBA/Arrival').locator('li.song')).toHaveText([
    '01 Dancing Queen.mp3',
    '02 Knowing Me, Knowing You.mp3',
    '03 Money, Money, Money.mp3',
  ])
})

test('adds a folder to the queue, in order, and plays it', async ({page}) => {
  await folder(page, 'ABBA').locator('> a.add').click()
  await expect(titles(page)).toHaveText(['Dancing Queen', 'Knowing Me, Knowing You', 'Money, Money, Money'])
  await expect(queue(page).first().locator('.artist')).toHaveText('ABBA')
  await expect(queue(page).first().locator('.album')).toHaveText('Arrival')
  await expect(queue(page).first().locator('span.duration')).toHaveText('0:02')
  await expect(page.locator('audio-player .collection li')).toHaveText(['ABBA'])
  await expectPlaying(page, 'Dancing Queen')
  expect(page.url()).toContain('#ABBA')
})

test('adds a single song', async ({page}) => {
  await openFolder(page, 'Miles Davis')
  await folder(page, 'Miles Davis/Kind of Blue').locator('li.song', {hasText: 'Freddie'}).locator('a.add').click()
  await expect(titles(page)).toHaveText(['Freddie Freeloader'])
  await expectPlaying(page, 'Freddie Freeloader')
})

test('adds a playlist, in its order', async ({page}) => {
  await page.locator('#playlists > li.folder').click({position: {x: 5, y: 5}})
  await page.locator('#playlists li.playlist').locator('a.add').click()
  await expect(titles(page)).toHaveText(['So What', 'Dancing Queen'])
  await expectPlaying(page, 'So What')
})

test('a link to a folder adds it to the queue', async ({page}) => {
  await page.goto('./#Miles%20Davis')
  // only a new load reads the address, not a change of the hash
  await page.reload()
  await expect(titles(page)).toHaveText(['So What', 'Freddie Freeloader'])
})

test('removing a source from the queue removes its tracks and stops them', async ({page}) => {
  await folder(page, 'Miles Davis').locator('> a.add').click()
  await expect(titles(page)).toHaveCount(2)
  await folder(page, 'Björk').locator('> a.add').click()
  await expect(titles(page)).toHaveCount(3)
  await expectPlaying(page, 'So What')

  await page.locator('audio-player .collection li', {hasText: 'Miles Davis'}).locator('a').click()
  await expect(titles(page)).toHaveText(['Human Behaviour'])
  await expect(playing(page)).toHaveCount(0)
  expect((await audioState(page)).paused).toBe(true)
  await expect(page.locator('#trackTitle')).toHaveValue('')
})
