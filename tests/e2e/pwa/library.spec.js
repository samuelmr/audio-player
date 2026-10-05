import { test, expect, folder, queue, playing, audioState, expectPlaying } from '../fixtures.js'
import { S3_PORT } from '../library.js'

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

test('a click on the name of a folder adds it, and says so', async ({page}) => {
  await folder(page, 'ABBA').click()
  await expect(titles(page)).toHaveText(['Dancing Queen', 'Knowing Me, Knowing You', 'Money, Money, Money'])
  await expect(page.locator('.toast')).toHaveText('Added ABBA: 3 tracks')
})

test('a click on a song adds it', async ({page}) => {
  await openFolder(page, 'Miles Davis')
  await folder(page, 'Miles Davis/Kind of Blue').locator('li.song', {hasText: 'Freddie'}).click()
  await expect(titles(page)).toHaveText(['Freddie Freeloader'])
  await expect(page.locator('.toast')).toHaveText('Added 02 Freddie Freeloader: 1 track')
})

test('a click inside an open folder, but not on a row, keeps it open', async ({page}) => {
  await openFolder(page, 'ABBA')
  const songs = folder(page, 'ABBA/Arrival').locator('> ol')
  await expect(songs.locator('li.song')).toHaveCount(3)
  // on the guide line at the side of the songs
  await songs.click({position: {x: 1, y: 5}})
  await expect(folder(page, 'ABBA')).toHaveClass(/open/)
  await expect(folder(page, 'ABBA/Arrival')).toHaveClass(/open/)
  await expect(titles(page)).toHaveCount(0)
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

test('a click on a playlist adds it, and keeps the playlists open', async ({page}) => {
  await page.locator('#playlists > li.folder').click({position: {x: 5, y: 5}})
  await page.locator('#playlists li.playlist').click()
  await expect(titles(page)).toHaveText(['So What', 'Dancing Queen'])
  await expect(page.locator('#playlists > li.folder')).toHaveClass(/open/)
  await expect(page.locator('#playlists li.playlist')).toBeVisible()
})

test('a link to a folder adds it to the queue', async ({page}) => {
  await page.goto('./#Miles%20Davis')
  // only a new load reads the address, not a change of the hash
  await page.reload()
  await expect(titles(page)).toHaveText(['So What', 'Freddie Freeloader'])
})

test('a link to a folder inside another adds only that folder', async ({page}) => {
  await page.goto('./#ABBA%2FArrival')
  await page.reload()
  await expect(titles(page)).toHaveText(['Dancing Queen', 'Knowing Me, Knowing You', 'Money, Money, Money'])
  await expect(page.locator('audio-player .collection li')).toHaveText(['ABBA/Arrival'])
})

test('a link to a song adds only the song', async ({page}) => {
  await page.goto('./#Miles%20Davis%2FKind%20of%20Blue%2F02%20Freddie%20Freeloader.mp3')
  await page.reload()
  await expect(titles(page)).toHaveText(['Freddie Freeloader'])
})

test('a removed source is not added again on the next load', async ({page}) => {
  await folder(page, 'Björk').locator('> a.add').click()
  await expect(titles(page)).toHaveText(['Human Behaviour'])
  await page.locator('audio-player .collection li', {hasText: 'Björk'}).locator('a').click()
  expect(new URL(page.url()).hash).toBe('')

  await page.reload()
  await folder(page, 'Miles Davis').locator('> a.add').click()
  await expect(titles(page)).toHaveText(['So What', 'Freddie Freeloader'])
})

test('the metadata of a track uploaded again is fetched again, of the others not', async ({page}) => {
  await folder(page, 'ABBA').locator('> a.add').click()
  await expect(titles(page)).toHaveText(['Dancing Queen', 'Knowing Me, Knowing You', 'Money, Money, Money'])

  // Dancing Queen is uploaded again, with a new title: it's newer in the listing
  const heads = []
  await page.route(`http://127.0.0.1:${S3_PORT}/**`, async (route) => {
    const request = route.request()
    const key = decodeURIComponent(new URL(request.url()).pathname)
    if (request.method() == 'HEAD') {
      heads.push(key)
    }
    const response = await route.fetch()
    if (request.url().includes('list-type=2')) {
      const body = (await response.text()).replace(/(<Key>ABBA\/Arrival\/01 Dancing Queen\.mp3<\/Key><LastModified>)[^<]*/, (_, before) => before + '2026-10-04T12:00:00.000Z')
      return route.fulfill({response, body})
    }
    if (key.endsWith('01 Dancing Queen.mp3') && request.method() == 'HEAD') {
      return route.fulfill({response, headers: {...response.headers(), 'x-amz-meta-title': 'Dancing%20Queen%20(Remastered)'}})
    }
    return route.fulfill({response})
  })
  // the address has the folder, which adds it again
  await page.reload()
  await expect(titles(page)).toHaveText(['Dancing Queen (Remastered)', 'Knowing Me, Knowing You', 'Money, Money, Money'])
  expect(heads).toEqual(['/music/ABBA/Arrival/01 Dancing Queen.mp3'])
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
