// A new version, taken into use when the app comes back to the front (app-update.js)
import { test, expect, folder, queue, addFolder } from '../fixtures.js'

// the page as the host has it after a deployment: it loads another script.
// Only for the app's own check: the reload itself gets the real page.
async function deployNewVersion(page) {
  await page.route(url => url.pathname == '/pwa/', async (route) => {
    if (route.request().resourceType() != 'fetch') return route.fallback()
    const response = await route.fetch()
    const body = (await response.text()).replace(/audioplayer\.[0-9a-f]+\.js/, 'audioplayer.0123456789abcdef.js')
    await route.fulfill({response, body})
  })
}

// back from another app or the home screen. Resolves once the app has seen
// the page on the host, and has had the time to act on it.
async function comeBackToFront(page) {
  await page.evaluate(() => { window.beforeComingBack = true })
  const checked = page.waitForResponse(response =>
    response.request().resourceType() == 'fetch' && new URL(response.url()).pathname == '/pwa/')
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await checked
  await page.waitForTimeout(500)
}

const reloaded = (page) => page.evaluate(() => !window.beforeComingBack)

test.beforeEach(async ({page}) => {
  await page.goto('./')
  await expect(folder(page, 'ABBA')).toBeVisible()
})

test('reloads to a new version when nothing is queued', async ({page}) => {
  await deployNewVersion(page)
  await comeBackToFront(page)
  await expect.poll(() => reloaded(page)).toBe(true)
  await expect(folder(page, 'ABBA')).toBeVisible()
})

test('stays as it is when the version is the same', async ({page}) => {
  await comeBackToFront(page)
  expect(await reloaded(page)).toBe(false)
})

test.describe("doesn't reload to a new version when that would lose", () => {
  test('the queue', async ({page}) => {
    await addFolder(page, 'ABBA')
    await expect(queue(page)).not.toHaveCount(0)
    await deployNewVersion(page)
    await comeBackToFront(page)
    expect(await reloaded(page)).toBe(false)
  })

  test('an open dialog', async ({page}) => {
    await page.locator('button.gear').click()
    await expect(page.locator('dialog#settings')).toBeVisible()
    await deployNewVersion(page)
    await comeBackToFront(page)
    expect(await reloaded(page)).toBe(false)
  })

  test('a search', async ({page}) => {
    await page.locator('#skipNav input[type=search]').fill('abba')
    await deployNewVersion(page)
    await comeBackToFront(page)
    expect(await reloaded(page)).toBe(false)
  })
})

test('goes on as it is when the host is out of reach', async ({page}) => {
  await page.route(url => url.pathname == '/pwa/', route =>
    route.request().resourceType() == 'fetch' ? route.abort() : route.fallback())
  await page.evaluate(() => { window.beforeComingBack = true })
  const failed = page.waitForEvent('requestfailed')
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await failed
  await page.waitForTimeout(500)
  expect(await reloaded(page)).toBe(false)
  await expect(folder(page, 'ABBA')).toBeVisible()
})
