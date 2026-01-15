import { test, expect, ElectronApplication } from '@playwright/test'
import { cleanupDb, launchApp, setupApiKey } from './fixtures'

test.describe('Settings Dialog', () => {
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

  test('settings dialog opens from sidebar button', async () => {
    app = await launchApp()
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await setupApiKey(window)

    // Click settings button
    await window.locator('[data-testid="settings-btn"]').click()

    // Settings dialog should be visible
    await expect(window.locator('[role="dialog"]')).toBeVisible()
    await expect(window.locator('[data-testid="api-key-input"]')).toBeVisible()
    await expect(window.locator('[data-testid="model-select"]')).toBeVisible()
  })

  test('settings dialog can be closed after API key is set', async () => {
    app = await launchApp()
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await setupApiKey(window)

    // Open settings
    await window.locator('[data-testid="settings-btn"]').click()
    await expect(window.locator('[role="dialog"]')).toBeVisible()

    // Close button should be visible and work
    const closeBtn = window.locator('[data-testid="close-settings-btn"]')
    await expect(closeBtn).toBeVisible()
    await closeBtn.click()

    // Settings dialog should be hidden
    await expect(window.locator('[data-testid="api-key-input"]')).not.toBeVisible()
  })

  test('model selector shows available models', async () => {
    app = await launchApp()
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await setupApiKey(window)

    // Open settings
    await window.locator('[data-testid="settings-btn"]').click()

    // Click model selector
    await window.locator('[data-testid="model-select"]').click()

    // Models should be listed (at least one model visible)
    await expect(window.locator('[role="option"]').first()).toBeVisible()
  })

  test('first run shows welcome screen that requires API key', async () => {
    app = await launchApp()
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    // On first run (no API key), welcome screen should appear
    await expect(window.locator('text=Welcome to AI Notebook')).toBeVisible()

    // Done button should be disabled without input
    const doneBtn = window.locator('[data-testid="welcome-done-btn"]')
    await expect(doneBtn).toBeDisabled()
  })

  test('welcome screen validates API key', async () => {
    app = await launchApp()
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    // Enter an API key
    await window.locator('[data-testid="welcome-api-key-input"]').fill('test-key')

    // Done button should be enabled
    const doneBtn = window.locator('[data-testid="welcome-done-btn"]')
    await expect(doneBtn).toBeEnabled()

    // Note: Actual validation happens on server, this just tests UI flow
  })

  test('shows masked API key after setting', async () => {
    app = await launchApp()
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await setupApiKey(window)

    // Open settings
    await window.locator('[data-testid="settings-btn"]').click()

    // Should show masked key indicator
    await expect(window.locator('text=Current key:')).toBeVisible()
  })

  test('theme selector changes theme', async () => {
    app = await launchApp()
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await setupApiKey(window)

    // Open settings
    await window.locator('[data-testid="settings-btn"]').click()

    // Theme selector should be visible
    const themeSelect = window.locator('[data-testid="theme-select"]')
    await expect(themeSelect).toBeVisible()

    // Select dark theme
    await themeSelect.click()
    await window.locator('[role="option"]:has-text("Dark")').click()

    // Document should have dark class
    const htmlClass = await window.evaluate(() => document.documentElement.className)
    expect(htmlClass).toContain('dark')

    // Select light theme
    await themeSelect.click()
    await window.locator('[role="option"]:has-text("Light")').click()

    // Document should have light class
    const htmlClass2 = await window.evaluate(() => document.documentElement.className)
    expect(htmlClass2).toContain('light')
    expect(htmlClass2).not.toContain('dark')

    // Select system theme
    await themeSelect.click()
    await window.locator('[role="option"]:has-text("System")').click()

    // Document should have neither class
    const htmlClass3 = await window.evaluate(() => document.documentElement.className)
    expect(htmlClass3).not.toContain('dark')
    expect(htmlClass3).not.toContain('light')
  })
})

test.describe('Welcome Screen', () => {
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

  test('welcome screen shows on first launch', async () => {
    app = await launchApp()
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    // Welcome screen elements should be visible
    await expect(window.locator('text=Welcome to AI Notebook')).toBeVisible()
    await expect(window.locator('[data-testid="welcome-api-key-input"]')).toBeVisible()
    await expect(window.locator('[data-testid="welcome-model-select"]')).toBeVisible()
    await expect(window.locator('[data-testid="welcome-done-btn"]')).toBeVisible()
  })

  test('done button is disabled without API key', async () => {
    app = await launchApp()
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    const doneBtn = window.locator('[data-testid="welcome-done-btn"]')
    await expect(doneBtn).toBeDisabled()
  })

  test('done button is enabled after entering API key', async () => {
    app = await launchApp()
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    // Enter API key
    await window.locator('[data-testid="welcome-api-key-input"]').fill('test-api-key-12345')

    // Done button should be enabled
    const doneBtn = window.locator('[data-testid="welcome-done-btn"]')
    await expect(doneBtn).toBeEnabled()
  })

  test('model selector works on welcome screen', async () => {
    app = await launchApp()
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    // Click model selector
    await window.locator('[data-testid="welcome-model-select"]').click()

    // Models should be listed
    await expect(window.locator('[role="option"]').first()).toBeVisible()
  })
})
