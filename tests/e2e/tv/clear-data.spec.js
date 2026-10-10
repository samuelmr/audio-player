// The question about clearing the local data, reached with the remote
import { test, expect, folder } from '../fixtures.js'
import { focusOn } from './helpers.js'

const dialog = (page) => page.locator('dialog#settings')
const confirm = (page) => page.locator('dialog#confirm-source')

test('the remote reaches the question, over the settings dialog', async ({page, remote}) => {
  await page.goto('./')
  await expect(folder(page, 'ABBA')).toBeVisible()
  await page.locator('button.gear').click()
  await dialog(page).getByRole('button', {name: 'Scan library'}).click()
  await expect(dialog(page).locator('.scan-status')).toHaveText('7/7 files scanned (100%)')
  // read-only until OK, as the TV has no keyboard to fill it with
  await page.locator('#regionInput').evaluate(input => { input.value = 'edited-region' })
  await dialog(page).getByRole('button', {name: 'Save'}).click()
  await expect(confirm(page)).toBeVisible()
  await focusOn(confirm(page).getByRole('button', {name: 'Clear local data'}))
  await remote.press('Right')
  await expect(confirm(page).getByRole('button', {name: 'Keep old settings'})).toBeFocused()
  await remote.press('OK')
  await expect(confirm(page)).toBeHidden()
  await expect(dialog(page)).toBeHidden()
})
