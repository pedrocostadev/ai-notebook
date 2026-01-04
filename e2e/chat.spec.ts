import { test, expect, _electron as electron } from '@playwright/test'
import { resolve } from 'path'

test.describe('AI Notebook', () => {
  test('app launches and shows settings dialog on first run', async () => {
    const app = await electron.launch({
      args: ['.'],
      env: {
        ...process.env,
        NODE_ENV: 'test'
      }
    })

    const window = await app.firstWindow()

    // Wait for app to load
    await window.waitForLoadState('domcontentloaded')

    // Settings dialog should appear on first run (no API key)
    const settingsTitle = window.locator('text=Settings')
    await expect(settingsTitle).toBeVisible({ timeout: 10000 })

    // API key input should be present
    const apiKeyInput = window.locator('input[type="password"]')
    await expect(apiKeyInput).toBeVisible()

    // Should show prompt for API key
    await expect(window.locator('label:text("Google Gemini API Key")')).toBeVisible()

    await app.close()
  })

  test('sidebar and main area render correctly', async () => {
    const app = await electron.launch({
      args: ['.'],
      env: {
        ...process.env,
        NODE_ENV: 'test'
      }
    })

    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    // App title should be visible
    await expect(window.locator('text=AI Notebook')).toBeVisible({ timeout: 10000 })

    // Upload button should exist (in sidebar, may be behind dialog)
    const uploadButton = window.locator('text=Upload PDF').first()
    await expect(uploadButton).toBeVisible()

    await app.close()
  })
})
