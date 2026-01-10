import { test, expect, ElectronApplication } from '@playwright/test'
import { cleanupDb, launchApp, setupApiKey, uploadPdf, waitForChapters, markPdfDone, SAMPLE_PDF } from './fixtures'

test.describe('AI Notebook', () => {
  test('app launches and shows welcome screen on first run', async () => {
    cleanupDb()
    const app = await launchApp()
    const window = await app.firstWindow()

    await window.waitForLoadState('domcontentloaded')

    // Welcome screen should appear on first run (no API key)
    const welcomeTitle = window.locator('text=Welcome to AI Notebook')
    await expect(welcomeTitle).toBeVisible({ timeout: 10000 })

    // API key input should be present
    const apiKeyInput = window.locator('[data-testid="welcome-api-key-input"]')
    await expect(apiKeyInput).toBeVisible()

    // Should show prompt for API key
    await expect(window.locator('label:text("Google Gemini API Key")')).toBeVisible()

    await app.close()
  })

  test('sidebar and main area render correctly', async () => {
    cleanupDb()
    const app = await launchApp()
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await setupApiKey(window)

    // App title should be visible
    await expect(window.locator('text=AI Notebook')).toBeVisible({ timeout: 10000 })

    // Upload button should exist in sidebar
    const uploadButton = window.locator('[data-testid="upload-pdf-btn"]')
    await expect(uploadButton).toBeVisible()

    // Settings button should exist
    const settingsButton = window.locator('[data-testid="settings-btn"]')
    await expect(settingsButton).toBeVisible()

    await app.close()
  })
})

test.describe('Chapter Processing', () => {
  let app: ElectronApplication

  test.beforeEach(async () => {
    cleanupDb()
  })

  test.afterEach(async () => {
    if (app) {
      await app.close()
    }
  })

  test('PDF upload creates chapters', async () => {
    app = await launchApp()
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await setupApiKey(window)

    // Upload PDF via test-only IPC
    await uploadPdf(window, SAMPLE_PDF)

    // Verify chapters were created
    const chapters = await waitForChapters(window, 1)
    expect(chapters.length).toBeGreaterThan(0)

    // Verify PDF appears in sidebar after reload
    await window.reload()
    await window.waitForLoadState('domcontentloaded')
    await expect(window.locator('text=sample.pdf')).toBeVisible({ timeout: 10000 })
  })

  test('chapter status indicators are visible', async () => {
    app = await launchApp()
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await setupApiKey(window)

    // Upload PDF
    const { pdfId } = await uploadPdf(window, SAMPLE_PDF)

    // Wait for chapters and mark PDF done
    await waitForChapters(window, pdfId)
    await markPdfDone(window, pdfId)

    // Reload to see PDF in list
    await window.reload()
    await window.waitForLoadState('domcontentloaded')

    // PDF should be visible
    await expect(window.locator('text=sample.pdf')).toBeVisible({ timeout: 10000 })

    // Ensure chapters are visible (expand if needed, localStorage may have persisted state)
    const chapterRows = window.locator('[data-testid="chapter-row"]')
    if (!(await chapterRows.first().isVisible())) {
      const expandBtn = window.locator('[data-testid="expand-btn"]').first()
      await expandBtn.click()
    }

    // Chapter rows should now be visible
    await expect(chapterRows.first()).toBeVisible({ timeout: 10000 })

    const count = await chapterRows.count()
    expect(count).toBeGreaterThan(0)

    // Each chapter row should have a visible status indicator
    for (let i = 0; i < count; i++) {
      const row = chapterRows.nth(i)
      const indicator = row.locator('[data-testid="chapter-status"]')
      await expect(indicator).toBeVisible()
      // The indicator should contain an SVG (the icon)
      const svg = indicator.locator('svg')
      await expect(svg.first()).toBeVisible()
    }
  })

  test('can cancel/delete PDF stuck in processing state', async () => {
    app = await launchApp()
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await setupApiKey(window)

    // Upload PDF
    await uploadPdf(window, SAMPLE_PDF)

    // Reload to see PDF in list
    await window.reload()
    await window.waitForLoadState('domcontentloaded')
    await expect(window.locator('text=sample.pdf')).toBeVisible({ timeout: 10000 })

    // Close and reopen app (simulates restart with stale processing state)
    await app.close()

    app = await launchApp()
    const window2 = await app.firstWindow()
    await window2.waitForLoadState('domcontentloaded')

    // PDF should still be visible
    await expect(window2.locator('text=sample.pdf')).toBeVisible({ timeout: 10000 })

    // Try to delete the PDF
    const pdfRow = window2.locator('[data-testid="pdf-row"]').first()
    await pdfRow.hover()

    // Click the delete button
    const deleteButton = pdfRow.locator('[data-testid="delete-pdf-btn"], [data-testid="cancel-pdf-btn"]')
    await deleteButton.click()

    // Confirm deletion in dialog
    const confirmButton = window2.locator('button:text("Cancel & Delete"), button:text("Delete")')
    await confirmButton.click()

    // PDF should be removed
    await expect(window2.locator('text=sample.pdf')).not.toBeVisible({ timeout: 5000 })
  })
})
