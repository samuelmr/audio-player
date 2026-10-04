import { test, expect, folder } from '../fixtures.js'
import { SETTINGS } from '../library.js'

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
    await expect(dialog(page).locator('.error')).toContainText('accessKeyId is missing')
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
