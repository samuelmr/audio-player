// End-to-end tests of the built apps in Chromium, against a fake S3
// (tests/e2e/server.js). Neither needs Tizen Studio: the TV app runs
// with a stand-in for the Tizen APIs (tests/e2e/fixtures.js).
import { defineConfig } from '@playwright/test'
import { APP_PORT } from './tests/e2e/library.js'

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    // the tests expect the English texts, whatever the machine's language
    locale: 'en-US',
    trace: 'retain-on-failure',
    launchOptions: {
      // the apps start playing without a click, like after a tap on a phone
      args: ['--autoplay-policy=no-user-gesture-required'],
    },
  },
  projects: [
    {
      name: 'pwa',
      testMatch: 'pwa/**/*.spec.js',
      use: {
        baseURL: `http://127.0.0.1:${APP_PORT}/pwa/`,
        viewport: {width: 1280, height: 800},
      },
    },
    {
      name: 'tv',
      testMatch: 'tv/**/*.spec.js',
      use: {
        baseURL: `http://127.0.0.1:${APP_PORT}/tizen/`,
        viewport: {width: 1920, height: 1080},
      },
    },
  ],
  webServer: {
    command: 'node tests/e2e/server.js',
    url: `http://127.0.0.1:${APP_PORT}/pwa/`,
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
  },
})
