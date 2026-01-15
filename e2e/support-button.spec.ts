import { test, expect, ElectronApplication } from '@playwright/test'
import { cleanupDb, launchApp, setupApiKey } from './fixtures'

test.describe('Support Button', () => {
  let app: ElectronApplication

  test.beforeEach(async () => {
    cleanupDb()
  })

  test.afterEach(async () => {
    if (app) {
      await app.close()
    }
    cleanupDb()
  })

  test('support button is visible in sidebar footer', async () => {
    app = await launchApp()
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await setupApiKey(window)

    // Support button should be visible
    const supportBtn = window.locator('[data-testid="support-btn"]')
    await expect(supportBtn).toBeVisible()
    await expect(supportBtn).toContainText('Support')
  })

  test('support button opens Ko-fi URL', async () => {
    app = await launchApp()
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await setupApiKey(window)

    // Mock window.open to capture the URL
    const openedUrl = await window.evaluate(() => {
      let capturedUrl = ''
      const originalOpen = window.open
      window.open = (url?: string | URL) => {
        capturedUrl = url?.toString() || ''
        return null
      }

      // Click the support button
      const btn = document.querySelector('[data-testid="support-btn"]') as HTMLButtonElement
      btn?.click()

      // Restore original
      window.open = originalOpen
      return capturedUrl
    })

    expect(openedUrl).toBe('https://ko-fi.com/pedro_dcc')
  })
})
