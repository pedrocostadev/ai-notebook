import { test, expect, ElectronApplication } from '@playwright/test'
import { cleanupDb, launchApp, setupApiKey } from './fixtures'

test.describe('Notebook Form Validation', () => {
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

  test('notebook dialog opens from sidebar button', async () => {
    app = await launchApp()
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await setupApiKey(window)

    // Click notebook button
    await window.locator('[data-testid="create-notebook-btn"]').click()

    // Notebook dialog should be visible
    await expect(window.locator('[data-testid="notebook-dialog"]')).toBeVisible()
    await expect(window.locator('[data-testid="notebook-title-input"]')).toBeVisible()
    await expect(window.locator('[data-testid="notebook-content-input"]')).toBeVisible()
  })

  test('validates required title field', async () => {
    app = await launchApp()
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await setupApiKey(window)

    // Open notebook dialog
    await window.locator('[data-testid="create-notebook-btn"]').click()
    await expect(window.locator('[data-testid="notebook-dialog"]')).toBeVisible()

    // Try to submit with empty title
    await window.locator('[data-testid="submit-button"]').click()

    // Should show validation error
    await expect(window.locator('[data-testid="title-error"]')).toBeVisible()
    await expect(window.locator('[data-testid="title-error"]')).toContainText('Title is required')
  })

  test('validates title max length (100 characters)', async () => {
    app = await launchApp()
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await setupApiKey(window)

    // Open notebook dialog
    await window.locator('[data-testid="create-notebook-btn"]').click()
    await expect(window.locator('[data-testid="notebook-dialog"]')).toBeVisible()

    // Fill in a title that's too long (101 characters)
    const longTitle = 'a'.repeat(101)
    await window.locator('[data-testid="notebook-title-input"]').fill(longTitle)
    await window.locator('[data-testid="notebook-content-input"]').fill('Some content')
    await window.locator('[data-testid="submit-button"]').click()

    // Should show validation error
    await expect(window.locator('[data-testid="title-error"]')).toBeVisible()
    await expect(window.locator('[data-testid="title-error"]')).toContainText('100 characters or less')
  })

  test('validates required content field', async () => {
    app = await launchApp()
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await setupApiKey(window)

    // Open notebook dialog
    await window.locator('[data-testid="create-notebook-btn"]').click()
    await expect(window.locator('[data-testid="notebook-dialog"]')).toBeVisible()

    // Fill title but leave content empty
    await window.locator('[data-testid="notebook-title-input"]').fill('Test Title')
    await window.locator('[data-testid="submit-button"]').click()

    // Should show validation error for content
    await expect(window.locator('[data-testid="content-error"]')).toBeVisible()
    await expect(window.locator('[data-testid="content-error"]')).toContainText('Content is required')
  })

  test('submits successfully with valid data', async () => {
    app = await launchApp()
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await setupApiKey(window)

    // Open notebook dialog
    await window.locator('[data-testid="create-notebook-btn"]').click()
    await expect(window.locator('[data-testid="notebook-dialog"]')).toBeVisible()

    // Fill in valid data
    await window.locator('[data-testid="notebook-title-input"]').fill('My Test Notebook')
    await window.locator('[data-testid="notebook-content-input"]').fill('This is the content of my notebook.')
    await window.locator('[data-testid="submit-button"]').click()

    // Dialog should close and show success toast
    await expect(window.locator('[data-testid="notebook-dialog"]')).not.toBeVisible()
    await expect(window.locator('[data-testid="toast"]')).toBeVisible()
    await expect(window.locator('[data-testid="toast"]')).toContainText('My Test Notebook')
  })

  test('allows exactly 100 characters in title', async () => {
    app = await launchApp()
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await setupApiKey(window)

    // Open notebook dialog
    await window.locator('[data-testid="create-notebook-btn"]').click()
    await expect(window.locator('[data-testid="notebook-dialog"]')).toBeVisible()

    // Fill in a title with exactly 100 characters
    const exactTitle = 'a'.repeat(100)
    await window.locator('[data-testid="notebook-title-input"]').fill(exactTitle)
    await window.locator('[data-testid="notebook-content-input"]').fill('Some content')
    await window.locator('[data-testid="submit-button"]').click()

    // Should submit successfully
    await expect(window.locator('[data-testid="notebook-dialog"]')).not.toBeVisible()
    await expect(window.locator('[data-testid="toast"]')).toBeVisible()
  })

  test('cancel button closes dialog without submitting', async () => {
    app = await launchApp()
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await setupApiKey(window)

    // Open notebook dialog
    await window.locator('[data-testid="create-notebook-btn"]').click()
    await expect(window.locator('[data-testid="notebook-dialog"]')).toBeVisible()

    // Fill in some data
    await window.locator('[data-testid="notebook-title-input"]').fill('Test')
    await window.locator('[data-testid="notebook-content-input"]').fill('Content')

    // Click cancel
    await window.locator('[data-testid="cancel-button"]').click()

    // Dialog should close without showing toast
    await expect(window.locator('[data-testid="notebook-dialog"]')).not.toBeVisible()
    await expect(window.locator('[data-testid="toast"]')).not.toBeVisible()
  })
})
