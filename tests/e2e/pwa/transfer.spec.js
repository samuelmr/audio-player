// Moving the settings to another device with a settings code (settings-code.js)
import jsQR from 'jsqr'
import { test, expect, folder } from '../fixtures.js'
import { SETTINGS } from '../library.js'

const PREFIX = 'ctrl-audio-settings:'
// made here, not by the app, so that the format can't change unnoticed
const settingsCode = (settings) => PREFIX + Buffer.from(JSON.stringify(settings)).toString('base64')
const decode = (code) => JSON.parse(Buffer.from(code.slice(PREFIX.length), 'base64').toString())

const dialog = (page) => page.locator('dialog#settings')
const transferButton = (page, name) => dialog(page).locator('fieldset.transfer').getByRole('button', {name})

test.describe('from a device that has the settings', () => {
  test.beforeEach(async ({page}) => {
    await page.goto('./')
    await expect(folder(page, 'ABBA')).toBeVisible()
    await page.locator('button.gear').click()
  })

  test('copies the settings code', async ({page, context}) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await transferButton(page, 'Copy settings code').click()
    await expect(dialog(page).locator('.error')).toContainText('Settings code copied')
    const code = await page.evaluate(() => navigator.clipboard.readText())
    expect(decode(code)).toMatchObject(SETTINGS)
  })

  test('shows the settings code as a QR code', async ({page}) => {
    await transferButton(page, 'Show QR code').click()
    const qr = dialog(page).locator('.qr svg')
    await expect(qr).toBeVisible()
    // read the QR code like a phone's camera would
    const image = await qr.evaluate(async (svg) => {
      const img = new Image()
      img.src = 'data:image/svg+xml,' + encodeURIComponent(new XMLSerializer().serializeToString(svg))
      await img.decode()
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 400
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = 'white'
      ctx.fillRect(0, 0, 400, 400)
      ctx.drawImage(img, 0, 0, 400, 400)
      return [...ctx.getImageData(0, 0, 400, 400).data]
    })
    const result = jsQR(Uint8ClampedArray.from(image), 400, 400)
    expect(decode(result.data)).toMatchObject(SETTINGS)

    await transferButton(page, 'Hide QR code').click()
    await expect(qr).toHaveCount(0)
  })
})

test.describe('on a new device', () => {
  test.use({settings: null})

  test.beforeEach(async ({page}) => {
    await page.goto('./')
    await expect(dialog(page)).toBeVisible()
  })

  test('pastes the settings code from the clipboard', async ({page, context}) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.evaluate((code) => navigator.clipboard.writeText(code), settingsCode(SETTINGS))
    await transferButton(page, 'Paste settings code').click()
    await expect(dialog(page)).toBeHidden()
    await expect(folder(page, 'ABBA')).toBeVisible()
  })

  test('asks for the settings code when it cannot read the clipboard', async ({page}) => {
    page.once('dialog', prompt => prompt.accept(settingsCode(SETTINGS)))
    await transferButton(page, 'Paste settings code').click()
    await expect(folder(page, 'ABBA')).toBeVisible()
  })

  test('rejects an invalid settings code', async ({page}) => {
    page.once('dialog', prompt => prompt.accept('not a settings code'))
    await transferButton(page, 'Paste settings code').click()
    await expect(dialog(page).locator('.error')).toHaveText('Not a valid settings code')
    expect(await page.evaluate(() => localStorage.getItem('accessKeyId'))).toBeNull()
  })
})
