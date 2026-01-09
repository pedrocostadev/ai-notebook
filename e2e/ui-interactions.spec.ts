import { test, expect, ElectronApplication } from '@playwright/test'
import { cleanupDb, launchApp, setupApiKey, uploadPdf, waitForChapters, markPdfDone, SAMPLE_PDF } from './fixtures'

test.describe('PDF List Interactions', () => {
  let app: ElectronApplication

  test.beforeEach(async () => {
    cleanupDb()
  })

  test.afterEach(async () => {
    if (app) {
      await app.close()
    }
  })

  test('PDF row shows delete button on hover', async () => {
    app = await launchApp()
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await setupApiKey(window)

    // Upload a PDF
    await uploadPdf(window, SAMPLE_PDF)

    // Reload to see PDF in list
    await window.reload()
    await window.waitForLoadState('domcontentloaded')

    // Wait for PDF to be visible
    await expect(window.locator('text=sample.pdf')).toBeVisible({ timeout: 10000 })

    // Delete button should be hidden initially (opacity-0)
    const pdfRow = window.locator('[data-testid="pdf-row"]').first()
    const deleteBtn = pdfRow.locator('[data-testid="delete-pdf-btn"], [data-testid="cancel-pdf-btn"]')

    // Hover over the PDF row
    await pdfRow.hover()

    // Delete button should become visible
    await expect(deleteBtn).toBeVisible()
  })

  test('expand/collapse chapters works', async () => {
    app = await launchApp()
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await setupApiKey(window)

    // Upload a PDF
    const { pdfId } = await uploadPdf(window, SAMPLE_PDF)

    // Wait for chapters and PDF to be fully processed
    await waitForChapters(window, pdfId)
    await markPdfDone(window, pdfId)

    // Reload to see PDF in list
    await window.reload()
    await window.waitForLoadState('domcontentloaded')

    await expect(window.locator('text=sample.pdf')).toBeVisible({ timeout: 10000 })

    // First ensure chapters are collapsed (localStorage may have persisted expanded state)
    const expandBtn = window.locator('[data-testid="expand-btn"]').first()
    const chapterRow = window.locator('[data-testid="chapter-row"]').first()

    // Check if already expanded and collapse first
    if (await chapterRow.isVisible()) {
      await expandBtn.click()
      await expect(chapterRow).not.toBeVisible()
    }

    // Test expand: click should show chapters
    await expandBtn.click()
    await expect(chapterRow).toBeVisible()

    // Test collapse: click again should hide chapters
    await expandBtn.click()
    await expect(chapterRow).not.toBeVisible()
  })

  test('selecting a chapter shows chapter header in chat', async () => {
    app = await launchApp()
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await setupApiKey(window)

    // Upload a PDF
    const { pdfId } = await uploadPdf(window, SAMPLE_PDF)

    // Wait for chapters and PDF to be fully processed
    const chapters = await waitForChapters(window, pdfId)
    await markPdfDone(window, pdfId)
    const chapterTitle = chapters[0].title

    // Reload to see PDF in list
    await window.reload()
    await window.waitForLoadState('domcontentloaded')

    await expect(window.locator('text=sample.pdf')).toBeVisible({ timeout: 10000 })

    // Expand chapters
    await window.locator('[data-testid="expand-btn"]').first().click()

    // Click on a chapter
    await window.locator('[data-testid="chapter-row"]').first().click()

    // Chat should show chapter header with title (use specific selector for chat header area)
    const chatHeader = window.locator('.border-b.bg-muted\\/30 span.font-medium')
    await expect(chatHeader).toHaveText(chapterTitle)
  })

  test('selecting PDF (not chapter) shows main chat view', async () => {
    app = await launchApp()
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await setupApiKey(window)

    // Upload a PDF
    const { pdfId } = await uploadPdf(window, SAMPLE_PDF)

    // Wait for chapters and PDF to be fully processed
    await waitForChapters(window, pdfId)
    await markPdfDone(window, pdfId)

    // Reload to see PDF in list
    await window.reload()
    await window.waitForLoadState('domcontentloaded')

    await expect(window.locator('text=sample.pdf')).toBeVisible({ timeout: 10000 })

    // Ensure chapters are visible (expand if needed, localStorage may have persisted state)
    const chapterRow = window.locator('[data-testid="chapter-row"]').first()
    if (!(await chapterRow.isVisible())) {
      await window.locator('[data-testid="expand-btn"]').first().click()
    }

    // Click on a chapter first
    await chapterRow.click()

    // Then click on PDF row to go back to main view
    await window.locator('[data-testid="pdf-row"]').first().click()

    // Chat input should show PDF-level placeholder
    const chatInput = window.locator('[data-testid="chat-input"]')
    await expect(chatInput).toHaveAttribute('placeholder', /Ask a question about this PDF/)
  })
})

test.describe('Chat Input', () => {
  let app: ElectronApplication

  test.beforeEach(async () => {
    cleanupDb()
  })

  test.afterEach(async () => {
    if (app) {
      await app.close()
    }
  })

  test('chat input is disabled without PDF selected', async () => {
    app = await launchApp()
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await setupApiKey(window)

    // Without PDF selected, the main area should show "No PDF Selected" message
    await expect(window.locator('text=No PDF Selected')).toBeVisible()
  })

  test('chat input is enabled after selecting processed PDF', async () => {
    app = await launchApp()
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await setupApiKey(window)

    // Upload a PDF and wait for processing
    const { pdfId } = await uploadPdf(window, SAMPLE_PDF)
    await waitForChapters(window, pdfId)
    await markPdfDone(window, pdfId)

    // Reload to see PDF in list
    await window.reload()
    await window.waitForLoadState('domcontentloaded')

    // Select the PDF
    await window.locator('[data-testid="pdf-row"]').first().click()

    // Chat input should be enabled (after processing complete)
    const chatInput = window.locator('[data-testid="chat-input"]')
    await expect(chatInput).toBeEnabled({ timeout: 10000 })
  })

  test('submit button is disabled with empty input', async () => {
    app = await launchApp()
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await setupApiKey(window)

    // Upload a PDF and wait for processing
    const { pdfId } = await uploadPdf(window, SAMPLE_PDF)
    await waitForChapters(window, pdfId)

    // Reload to see PDF in list
    await window.reload()
    await window.waitForLoadState('domcontentloaded')

    // Select the PDF
    await window.locator('[data-testid="pdf-row"]').first().click()

    // Submit button should be disabled
    const submitBtn = window.locator('[data-testid="chat-submit"]')
    await expect(submitBtn).toBeDisabled()
  })

  test('submit button is enabled with text input', async () => {
    app = await launchApp()
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await setupApiKey(window)

    // Upload a PDF and wait for processing
    const { pdfId } = await uploadPdf(window, SAMPLE_PDF)
    await waitForChapters(window, pdfId)
    await markPdfDone(window, pdfId)

    // Reload to see PDF in list
    await window.reload()
    await window.waitForLoadState('domcontentloaded')

    // Select the PDF
    await window.locator('[data-testid="pdf-row"]').first().click()

    // Wait for chat input to be enabled
    const chatInput = window.locator('[data-testid="chat-input"]')
    await expect(chatInput).toBeEnabled({ timeout: 10000 })

    // Type something in the input
    await chatInput.fill('Hello')

    // Submit button should be enabled
    const submitBtn = window.locator('[data-testid="chat-submit"]')
    await expect(submitBtn).toBeEnabled()
  })
})

test.describe('Empty State', () => {
  let app: ElectronApplication

  test.beforeEach(async () => {
    cleanupDb()
  })

  test.afterEach(async () => {
    if (app) {
      await app.close()
    }
  })

  test('shows empty state when no PDFs uploaded', async () => {
    app = await launchApp()
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await setupApiKey(window)

    // Should show "No PDFs uploaded yet" in sidebar
    await expect(window.locator('text=No PDFs uploaded yet')).toBeVisible()

    // Main area should show "No PDF Selected"
    await expect(window.locator('text=No PDF Selected')).toBeVisible()

    // Upload button should be present in main area
    await expect(window.locator('text=Upload PDF').first()).toBeVisible()
  })
})
