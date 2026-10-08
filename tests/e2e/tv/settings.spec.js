// Settings on the TV come as a settings code typed in from a phone (tizen.js)
import { test, expect, folder } from '../fixtures.js'
import { SETTINGS } from '../library.js'
import { focused, focusOn } from './helpers.js'

const settingsCode = (settings) => 'ctrl-audio-settings:' + Buffer.from(JSON.stringify(settings)).toString('base64')
const dialog = (page) => page.locator('dialog#settings')

test.use({settings: null})

test.beforeEach(async ({page}) => {
  await page.goto('./')
  await expect(dialog(page)).toBeVisible()
})

test('imports a settings code typed into the code field', async ({page, remote}) => {
  const input = page.locator('#settingsCodeInput')
  await focusOn(input)
  // read-only until OK, so that the TV's keyboard doesn't open on the way past
  await expect(input).toHaveJSProperty('readOnly', true)
  await remote.press('OK')
  await expect(input).toHaveJSProperty('readOnly', false)
  await input.fill(settingsCode(SETTINGS))
  await page.keyboard.press('Enter')
  await expect(dialog(page)).toBeHidden()
  await expect(folder(page, 'ABBA')).toBeVisible()
})

test('says when the code is not valid', async ({page, remote}) => {
  const input = page.locator('#settingsCodeInput')
  await focusOn(input)
  await remote.press('OK')
  await input.fill('not a code')
  await page.keyboard.press('Enter')
  await expect(dialog(page).locator('fieldset.transfer .error')).toHaveText('Not a valid settings code')
})

test('the arrows stay in the dialog', async ({page, remote}) => {
  await focusOn(page.locator('#accessKeyIdInput'))
  for (const key of ['Down', 'Down', 'Down', 'Down', 'Down', 'Down', 'Down', 'Down', 'Right', 'Up']) {
    await remote.press(key)
    await expect(dialog(page).locator(':focus')).toHaveCount(1)
  }
  // and reach the code field at the top
  for (let i = 0; i < 12 && await focused(page).getAttribute('id') != 'settingsCodeInput'; i++) {
    await remote.press('Up')
  }
  await expect(page.locator('#settingsCodeInput')).toBeFocused()
})
