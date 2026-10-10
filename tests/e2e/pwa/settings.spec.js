import { test, expect, folder, queue, audioState, expectPlaying, addFolder } from '../fixtures.js'
import { SETTINGS, PUBLIC_SETTINGS, COVER } from '../library.js'

const dialog = (page) => page.locator('dialog#settings')
const field = (page, key) => page.locator({
  accessKeyId: '#accessKeyIdInput',
  secretAccessKey: '#secretAccessKeyInput',
  endpoint: '#endpointInput',
  region: '#regionInput',
  bucketName: '#bucketInput',
}[key])

test.describe('first start', () => {
  test.use({settings: null})

  test('asks for the settings, and lists the library once they are saved', async ({page}) => {
    await page.goto('./')
    await expect(dialog(page)).toBeVisible()
    // without keys the bucket would be a public one, at an address still to give
    await expect(dialog(page).locator('form .error')).toContainText('endpoint is missing')
    for (const [key, value] of Object.entries(SETTINGS)) {
      await field(page, key).fill(value)
    }
    await dialog(page).getByRole('button', {name: 'Save'}).click()
    await expect(dialog(page)).toBeHidden()
    await expect(folder(page, 'ABBA')).toBeVisible()
    expect(await page.evaluate(() => localStorage.getItem('bucketName'))).toBe(SETTINGS.bucketName)
  })

  test('takes the settings from the address, and hides them from it', async ({page}) => {
    await page.goto('./?' + new URLSearchParams(SETTINGS))
    await expect(folder(page, 'ABBA')).toBeVisible()
    expect(page.url()).not.toContain(SETTINGS.secretAccessKey)
    expect(await page.evaluate(() => localStorage.getItem('secretAccessKey'))).toBe(SETTINGS.secretAccessKey)
  })
})

test.describe('a public bucket', () => {
  test.use({settings: PUBLIC_SETTINGS})

  test('is read without keys, and its tracks and covers from plain addresses', async ({page}) => {
    await page.goto('./')
    await page.locator('button.gear').click()
    await expect(field(page, 'accessKeyId')).toHaveAttribute('placeholder', 'None for a public bucket')
    await page.keyboard.press('Escape')
    await addFolder(page, 'Miles Davis')
    await expectPlaying(page, 'So What')
    expect((await audioState(page)).src).not.toContain('X-Amz-')
    await expect(queue(page).first()).toHaveAttribute('style', /cover\.png/)
    await expect.poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue('--base-hue'))).toBe(String(COVER.hue))
  })

  test('needs both keys to sign, not only one', async ({page}) => {
    await page.goto('./')
    await page.locator('button.gear').click()
    await field(page, 'accessKeyId').fill(SETTINGS.accessKeyId)
    await dialog(page).getByRole('button', {name: 'Save'}).click()
    await expect(dialog(page).locator('form .error')).toContainText('secretAccessKey is missing')
  })
})

test('closing the dialog keeps the edits, and Cancel reverts them', async ({page}) => {
  await page.goto('./')
  await expect(folder(page, 'ABBA')).toBeVisible()
  await page.locator('button.gear').click()
  await field(page, 'region').fill('edited-region')
  await page.keyboard.press('Escape')
  await expect(dialog(page)).toBeHidden()

  await page.locator('button.gear').click()
  await expect(field(page, 'region')).toHaveValue('edited-region')
  await dialog(page).getByRole('button', {name: 'Cancel'}).click()
  await expect(dialog(page)).toBeHidden()

  await page.locator('button.gear').click()
  await expect(field(page, 'region')).toHaveValue(SETTINGS.region)
  expect(await page.evaluate(() => localStorage.getItem('region'))).toBe(SETTINGS.region)
})

test('keeps the player color', async ({page}) => {
  await page.goto('./')
  await page.locator('button.gear').click()
  await page.locator('#playerColor').fill('300')
  await dialog(page).getByRole('button', {name: 'Save'}).click()
  await page.reload()
  await expect(folder(page, 'ABBA')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--base-hue'))).toBe('300')
})

test.describe('on a Finnish device', () => {
  test.use({locale: 'fi-FI'})

  test('speaks Finnish, unless English is chosen', async ({page}) => {
    await page.goto('./')
    await expect(folder(page, 'ABBA')).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'fi')
    await expect(page.locator('#playlists > li.folder')).toContainText('Soittolistat')

    await page.locator('button.gear').click()
    await expect(dialog(page).locator('#languageSelect')).toHaveValue('')
    await dialog(page).locator('#languageSelect').selectOption('en')
    await dialog(page).getByRole('button', {name: 'Tallenna'}).click()
    await expect(folder(page, 'ABBA')).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.locator('#playlists > li.folder')).toContainText('Playlists')
    expect(await page.evaluate(() => localStorage.getItem('language'))).toBe('en')
  })
})

test('switches the language from the settings', async ({page}) => {
  await page.goto('./')
  await page.locator('button.gear').click()
  await dialog(page).locator('#languageSelect').selectOption('fi')
  await dialog(page).getByRole('button', {name: 'Save'}).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'fi')
  await page.locator('button.gear').click()
  await expect(dialog(page).getByRole('button', {name: 'Tallenna'})).toBeVisible()
  await expect(dialog(page).locator('#languageSelect')).toHaveValue('fi')
})

test.describe('the library order', () => {
  const artists = (page) => page.locator('audio-browser nav:not(#skipNav) > ol:not(.playlists) > li.folder')
    .evaluateAll(items => items.map(li => li.dataset.folder))
  const letters = (page) => page.locator('#skipNav li.letter a')

  test('is by folder name, and after a scan by the artists\' sort names', async ({page}) => {
    await page.goto('./')
    await expect(folder(page, 'ABBA')).toBeVisible()
    await expect.poll(() => artists(page)).toEqual(['ABBA', 'Björk', 'Miles Davis'])
    await expect(letters(page)).toHaveText(['A', 'B', 'M'])

    await page.locator('button.gear').click()
    await dialog(page).getByRole('button', {name: 'Scan library'}).click()
    await expect(dialog(page).locator('.scan-status')).toHaveText('7/7 files scanned (100%)')
    await expect(dialog(page).getByRole('button', {name: 'Scan library'})).toBeVisible()
    await dialog(page).locator('#sortSelect').selectOption('sortname')
    await dialog(page).getByRole('button', {name: 'Save'}).click()
    // Davis, Miles; Guðmundsdóttir, Björk
    await expect.poll(() => artists(page)).toEqual(['ABBA', 'Miles Davis', 'Björk'])
    await expect(letters(page)).toHaveText(['A', 'D', 'G'])

    // the sort names stay known
    await page.reload()
    await expect.poll(() => artists(page)).toEqual(['ABBA', 'Miles Davis', 'Björk'])
  })

  test('by year adds a folder\'s tracks in their order', async ({page}) => {
    await page.goto('./')
    await page.locator('button.gear').click()
    await dialog(page).locator('#sortSelect').selectOption('sortname-year')
    await dialog(page).getByRole('button', {name: 'Save'}).click()
    await addFolder(page, 'ABBA')
    await expect(queue(page).locator('.name a')).toHaveText(['Dancing Queen', 'Knowing Me, Knowing You', 'Money, Money, Money'])
  })
})

test.describe('clearing the local data', () => {
  const metaCount = (page) => page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('audio-library')
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const count = open.result.transaction('meta').objectStore('meta').count()
      count.onsuccess = () => { resolve(count.result); open.result.close() }
    }
  }))
  const scan = async (page) => {
    await page.goto('./')
    await expect(folder(page, 'ABBA')).toBeVisible()
    await page.locator('button.gear').click()
    await dialog(page).getByRole('button', {name: 'Scan library'}).click()
    await expect(dialog(page).locator('.scan-status')).toHaveText('7/7 files scanned (100%)')
    expect(await metaCount(page)).toBe(7)
  }
  const confirm = (page) => page.locator('dialog#confirm-source')

  test('the button deletes the metadata', async ({page}) => {
    await scan(page)
    await dialog(page).getByRole('button', {name: 'Clear local data'}).click()
    await expect(dialog(page)).toContainText('Local data cleared')
    expect(await metaCount(page)).toBe(0)
  })

  test('a new bucket asks, and clearing saves the settings', async ({page}) => {
    await scan(page)
    await field(page, 'bucketName').fill('other-bucket')
    await dialog(page).getByRole('button', {name: 'Save'}).click()
    await expect(confirm(page)).toBeVisible()
    expect(await page.evaluate(() => localStorage.getItem('bucketName'))).toBe(SETTINGS.bucketName)
    await confirm(page).getByRole('button', {name: 'Clear local data'}).click()
    await expect(confirm(page)).toBeHidden()
    expect(await metaCount(page)).toBe(0)
    expect(await page.evaluate(() => localStorage.getItem('bucketName'))).toBe('other-bucket')
  })

  test('Keep old settings reverts the edits', async ({page}) => {
    await scan(page)
    await field(page, 'region').fill('edited-region')
    await dialog(page).getByRole('button', {name: 'Save'}).click()
    await confirm(page).getByRole('button', {name: 'Keep old settings'}).click()
    await expect(confirm(page)).toBeHidden()
    await expect(dialog(page)).toBeHidden()
    expect(await metaCount(page)).toBe(7)
    await page.locator('button.gear').click()
    await expect(field(page, 'region')).toHaveValue(SETTINGS.region)
  })

  test('Edit settings, and Esc, return to the unsaved edits', async ({page}) => {
    await scan(page)
    await field(page, 'region').fill('edited-region')
    for (const close of [
      (p) => confirm(p).getByRole('button', {name: 'Edit settings'}).click(),
      (p) => p.keyboard.press('Escape'),
    ]) {
      await dialog(page).getByRole('button', {name: 'Save'}).click()
      await expect(confirm(page)).toBeVisible()
      await close(page)
      await expect(confirm(page)).toBeHidden()
      await expect(dialog(page)).toBeVisible()
      await expect(field(page, 'region')).toHaveValue('edited-region')
    }
    expect(await metaCount(page)).toBe(7)
    expect(await page.evaluate(() => localStorage.getItem('region'))).toBe(SETTINGS.region)
  })

  test('does not ask for other changes, or without metadata', async ({page}) => {
    await scan(page)
    await page.locator('#playerColor').fill('300')
    await dialog(page).getByRole('button', {name: 'Save'}).click()
    await expect(dialog(page)).toBeHidden()
    await expect(confirm(page)).toBeHidden()

    await page.locator('button.gear').click()
    await dialog(page).getByRole('button', {name: 'Clear local data'}).click()
    await expect(dialog(page)).toContainText('Local data cleared')
    await field(page, 'bucketName').fill(SETTINGS.bucketName)
    await field(page, 'region').fill('edited-region')
    await dialog(page).getByRole('button', {name: 'Save'}).click()
    await expect(dialog(page)).toBeHidden()
    await expect(confirm(page)).toBeHidden()
  })
})
