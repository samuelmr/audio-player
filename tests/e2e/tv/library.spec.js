// The library worked with the remote (tizen-library.js, spatial-navigation.js)
import { test, expect, folder, queue, expectPlaying, TIZEN_KEYS } from '../fixtures.js'
import { focused, focusOn, toast, queueFolder } from './helpers.js'

test.beforeEach(async ({page}) => {
  await page.goto('./')
  await expect(folder(page, 'ABBA')).toBeVisible()
})

test('registers the media keys of the remote', async ({page}) => {
  expect(await page.evaluate(() => tizenCalls.registeredKeys)).toEqual(Object.keys(TIZEN_KEYS))
})

test('the arrows reach the library from the player', async ({page, remote}) => {
  await remote.press('Down')
  await expect(page.locator('audio-player :focus')).toHaveCount(1)
  for (let i = 0; i < 10 && !await page.locator('audio-browser li:focus').count(); i++) {
    await remote.press('Down')
  }
  await expect(page.locator('audio-browser li:focus')).toHaveCount(1)
})

test('Right opens a folder and moves into it, Left closes it and moves out', async ({page, remote}) => {
  await focusOn(folder(page, 'ABBA'))
  await remote.press('Right')
  await expect(folder(page, 'ABBA')).toHaveClass(/open/)
  await expect(folder(page, 'ABBA/Arrival')).toBeVisible()
  await remote.press('Right')
  await expect(folder(page, 'ABBA/Arrival')).toBeFocused()
  await remote.press('Right')
  const songs = folder(page, 'ABBA/Arrival').locator('li.song')
  await expect(songs).toHaveCount(3)
  await remote.press('Right')
  await expect(songs.first()).toBeFocused()
  await remote.press('Down')
  await expect(songs.nth(1)).toBeFocused()
  // nothing below the last song
  await remote.press('Down', {times: 2})
  await expect(songs.nth(2)).toBeFocused()

  await remote.press('Left')
  await expect(folder(page, 'ABBA/Arrival')).toBeFocused()
  await remote.press('Left')
  await expect(folder(page, 'ABBA/Arrival')).not.toHaveClass(/open/)
  await remote.press('Left')
  await expect(folder(page, 'ABBA')).toBeFocused()
})

test('OK adds a folder to the queue, and says so', async ({page, remote}) => {
  await focusOn(folder(page, 'Miles Davis'))
  await remote.press('OK')
  await expect(toast(page)).toHaveText('Added Miles Davis: 2 tracks')
  await expect(queue(page).locator('.name a')).toHaveText(['So What', 'Freddie Freeloader'])
  await expectPlaying(page, 'So What')
  // the focus stays in the library, for adding more
  await expect(folder(page, 'Miles Davis')).toBeFocused()
})

test('OK adds a song', async ({page, remote}) => {
  await focusOn(folder(page, 'Björk'))
  await remote.press('Right')
  await remote.press('Right')
  await expect(focused(page)).toHaveAttribute('data-folder', 'Björk/Debut')
  await remote.press('Right')
  await remote.press('Right')
  await expect(focused(page)).toHaveText('01 Human Behaviour.mp3')
  await remote.press('OK')
  await expect(toast(page)).toHaveText('Added 01 Human Behaviour: 1 track')
  await expectPlaying(page, 'Human Behaviour')
})

// So What is long enough not to end during these tests
test('OK adds to the queue without interrupting the music', async ({page, remote}) => {
  await queueFolder(page, remote, 'Miles Davis', 'So What')
  await focusOn(folder(page, 'Björk'))
  await remote.press('OK')
  await expect(queue(page)).toHaveCount(3)
  await page.waitForTimeout(500)
  await expectPlaying(page, 'So What')
})

test('holding OK plays what it adds right away', async ({page, remote}) => {
  await queueFolder(page, remote, 'Miles Davis', 'So What')
  await focusOn(folder(page, 'Björk'))
  // the second keydown without a keyup is a repeat
  await page.keyboard.down('Enter')
  await page.keyboard.down('Enter')
  await page.keyboard.up('Enter')
  await expectPlaying(page, 'Human Behaviour')
})

test('the Play key adds the focused item and plays it', async ({page, remote}) => {
  await queueFolder(page, remote, 'Miles Davis', 'So What')
  await focusOn(folder(page, 'Björk'))
  await remote.press('MediaPlay')
  await expectPlaying(page, 'Human Behaviour')
})

test('opens a playlist and adds a track from it', async ({page, remote}) => {
  await focusOn(page.locator('#playlists > li.folder'))
  await remote.press('Right')
  await remote.press('Right')
  await expect(focused(page)).toHaveText('Road trip.json')
  await remote.press('Right')
  const tracks = page.locator('#playlists li.playlist li.song')
  await expect(tracks).toHaveText(['So What', 'Dancing Queen'])
  await remote.press('Right')
  await remote.press('Down')
  await expect(tracks.nth(1)).toBeFocused()
  await remote.press('OK')
  await expectPlaying(page, 'Dancing Queen')
})

test('the shortcuts move the focus to their letter', async ({page, remote}) => {
  await focusOn(folder(page, 'ABBA'))
  // Back goes to the shortcut of the item's letter
  await remote.press('Back')
  await expect(page.locator('#skipNav a[href="#A"]')).toBeFocused()
  await remote.press('Right', {times: 2})
  await expect(page.locator('#skipNav a[href="#M"]')).toBeFocused()
  await remote.press('OK')
  await expect(folder(page, 'Miles Davis')).toBeFocused()
})

test('text fields open the keyboard only on OK', async ({page, remote}) => {
  const search = page.locator('#skipNav input[type=search]')
  await expect(search).toHaveJSProperty('readOnly', true)
  await focusOn(search)
  await remote.press('OK')
  await expect(search).toHaveJSProperty('readOnly', false)
  await search.pressSequentially('miles')
  await expect(page.locator('.search-results li .name').first()).toHaveText('Miles Davis')
})
