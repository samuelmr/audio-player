import { test, expect, folder, queue, expectPlaying } from '../fixtures.js'

const search = (page) => page.locator('#skipNav input[type=search]')
const results = (page) => page.locator('#skipNav .search-results li')
const result = (page, name) => results(page).filter({has: page.locator('.name', {hasText: name})})

test.beforeEach(async ({page}) => {
  await page.goto('./')
  // the playlists come with the listing
  await expect(folder(page, 'ABBA')).toBeVisible()
})

// tracks never seen before are known by their file names only
test('ignores case and accents, and finds folders and tracks', async ({page}) => {
  await search(page).fill('bjork')
  await expect(results(page).locator('.name')).toHaveText(['Björk', 'Björk/Debut', '01 Human Behaviour'])
  await expect(result(page, 'Human Behaviour').locator('small')).toHaveText('Björk/Debut')
})

test('finds tracks in folders that were never opened, by every word', async ({page}) => {
  await search(page).fill('abba money')
  await expect(results(page).locator('.name')).toHaveText(['03 Money, Money, Money'])
})

test('shows the titles and artists of the tracks seen before, and searches them', async ({page}) => {
  await folder(page, 'Björk').locator('> a.add').click()
  await expect(queue(page)).toHaveCount(1)
  // in the metadata only: the file is "01 Human Behaviour.mp3"
  await search(page).fill('1993')
  await expect(results(page).locator('.name')).toHaveText(['Human Behaviour'])
  await expect(results(page).locator('small')).toHaveText('Björk – Debut')
})

test('finds playlists', async ({page}) => {
  await search(page).fill('road')
  await expect(results(page).locator('.name')).toHaveText(['Road trip.json'])
  await result(page, 'Road trip').locator('a.add').click()
  await expect(queue(page).locator('.name a')).toHaveText(['So What', 'Dancing Queen'])
})

test('needs two letters, says when nothing matches, and Escape clears it', async ({page}) => {
  await search(page).fill('a')
  await page.waitForTimeout(500)
  await expect(results(page)).toHaveCount(0)
  await search(page).fill('zzz')
  await expect(results(page)).toHaveText(['No matches'])
  await search(page).press('Escape')
  await expect(search(page)).toHaveValue('')
  await expect(results(page)).toHaveCount(0)
})

test('adds a track from the results', async ({page}) => {
  await search(page).fill('freddie')
  await result(page, 'Freddie Freeloader').locator('a.add').click()
  await expect(queue(page).locator('.name a')).toHaveText(['Freddie Freeloader'])
  await expectPlaying(page, 'Freddie Freeloader')
})

test('adds a folder from the results, in order', async ({page}) => {
  await search(page).fill('arrival')
  await result(page, 'ABBA/Arrival').locator('a.add').click()
  await expect(queue(page).locator('.name a')).toHaveText(['Dancing Queen', 'Knowing Me, Knowing You', 'Money, Money, Money'])
})
