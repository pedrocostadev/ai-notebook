import { test, expect, ElectronApplication } from '@playwright/test'
import { cleanupDb, launchApp, setupApiKey, uploadPdf, waitForChapters, markPdfDone, saveMessage, getChatHistory, SAMPLE_PDF, SAMPLE_PDF_2 } from './fixtures'

test.describe('PDF List Interactions', () => {
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
    await expect(window.locator('text=sample')).toBeVisible({ timeout: 10000 })

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

    await expect(window.locator('text=sample')).toBeVisible({ timeout: 10000 })

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

    await expect(window.locator('text=sample')).toBeVisible({ timeout: 10000 })

    // Expand chapters
    await window.locator('[data-testid="expand-btn"]').first().click()

    // Click on a chapter
    await window.locator('[data-testid="chapter-row"]').first().click()

    // Chat should show chapter header with title
    const chatHeader = window.locator('[data-testid="chapter-title"]')
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

    await expect(window.locator('text=sample')).toBeVisible({ timeout: 10000 })

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
    cleanupDb()
  })

  test('chat input is disabled without PDF selected', async () => {
    app = await launchApp()
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await setupApiKey(window)

    // Without PDF selected, the main area should show "No document selected" message
    await expect(window.locator('text=No document selected')).toBeVisible()
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
    cleanupDb()
  })

  test('shows empty state when no PDFs uploaded', async () => {
    app = await launchApp()
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await setupApiKey(window)

    // Should show "No documents yet" in sidebar
    await expect(window.locator('text=No documents yet')).toBeVisible()

    // Main area should show "No document selected"
    await expect(window.locator('text=No document selected')).toBeVisible()

    // Upload button should be present in main area
    await expect(window.locator('text=Upload PDF').first()).toBeVisible()
  })
})

test.describe('Chat Header', () => {
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

  test('shows Open PDF button when PDF is done processing', async () => {
    app = await launchApp()
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await setupApiKey(window)

    // Upload and process PDF
    const { pdfId } = await uploadPdf(window, SAMPLE_PDF)
    await waitForChapters(window, pdfId)
    await markPdfDone(window, pdfId)

    // Reload to see PDF in list
    await window.reload()
    await window.waitForLoadState('domcontentloaded')

    // Select the PDF
    await window.locator('[data-testid="pdf-row"]').first().click()

    // Should show "Ready to chat" status
    await expect(window.locator('text=Ready to chat')).toBeVisible()

    // Should show "Open PDF" button
    await expect(window.locator('text=Open PDF')).toBeVisible()
  })

  test('shows Open button in chapter view when done processing', async () => {
    app = await launchApp()
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await setupApiKey(window)

    // Upload and process PDF
    const { pdfId } = await uploadPdf(window, SAMPLE_PDF)
    await waitForChapters(window, pdfId)
    await markPdfDone(window, pdfId)

    // Reload to see PDF in list
    await window.reload()
    await window.waitForLoadState('domcontentloaded')

    // Wait for PDF to be visible
    await expect(window.locator('text=sample')).toBeVisible({ timeout: 10000 })

    // Expand chapters if not visible
    const chapterRow = window.locator('[data-testid="chapter-row"]').first()
    if (!(await chapterRow.isVisible())) {
      await window.locator('[data-testid="expand-btn"]').first().click()
    }

    // Select a chapter
    await chapterRow.click()

    // Should show chapter header with "Open" button
    const openBtn = window.locator('[data-testid="open-chapter-btn"]')
    await expect(openBtn).toBeVisible()
  })

  test('shows processing indicator while PDF is processing', async () => {
    app = await launchApp()
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await setupApiKey(window)

    // Upload PDF (don't mark as done - leave processing)
    await uploadPdf(window, SAMPLE_PDF)

    // Reload to see PDF in list
    await window.reload()
    await window.waitForLoadState('domcontentloaded')

    // Select the PDF
    await window.locator('[data-testid="pdf-row"]').first().click()

    // Should show processing indicator
    await expect(window.locator('text=/Processing/')).toBeVisible()

    // Chat input should be disabled during processing
    const chatInput = window.locator('[data-testid="chat-input"]')
    await expect(chatInput).toBeDisabled()
  })
})

test.describe('Multi-PDF', () => {
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

  test('multiple PDFs appear in sidebar and can be selected independently', async () => {
    app = await launchApp()
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await setupApiKey(window)

    // Upload first PDF
    const { pdfId: pdfId1 } = await uploadPdf(window, SAMPLE_PDF)
    await waitForChapters(window, pdfId1)
    await markPdfDone(window, pdfId1)

    // Upload second PDF
    const { pdfId: pdfId2 } = await uploadPdf(window, SAMPLE_PDF_2)
    await waitForChapters(window, pdfId2)
    await markPdfDone(window, pdfId2)

    // Reload to see both PDFs in list
    await window.reload()
    await window.waitForLoadState('domcontentloaded')

    // Both PDFs should be visible in sidebar
    const pdfRows = window.locator('[data-testid="pdf-row"]')
    await expect(pdfRows).toHaveCount(2)

    // Verify both PDF names are visible (app shows book title, not filename)
    await expect(window.locator('text=sample')).toBeVisible()
    await expect(window.locator('text=Serverless Handbook')).toBeVisible()
  })

  test('chat messages are isolated between PDFs', async () => {
    app = await launchApp()
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await setupApiKey(window)

    // Upload and process two PDFs
    const { pdfId: pdfId1 } = await uploadPdf(window, SAMPLE_PDF)
    await waitForChapters(window, pdfId1)
    await markPdfDone(window, pdfId1)

    const { pdfId: pdfId2 } = await uploadPdf(window, SAMPLE_PDF_2)
    await waitForChapters(window, pdfId2)
    await markPdfDone(window, pdfId2)

    // Save a message to PDF 1
    await saveMessage(window, pdfId1, null, 'user', 'Question for PDF 1')
    await saveMessage(window, pdfId1, null, 'assistant', 'Answer for PDF 1')

    // Save a different message to PDF 2
    await saveMessage(window, pdfId2, null, 'user', 'Question for PDF 2')
    await saveMessage(window, pdfId2, null, 'assistant', 'Answer for PDF 2')

    // Verify PDF 1 has only its messages
    const history1 = await getChatHistory(window, pdfId1, null)
    expect(history1).toHaveLength(2)
    expect(history1[0].content).toBe('Question for PDF 1')
    expect(history1[1].content).toBe('Answer for PDF 1')

    // Verify PDF 2 has only its messages
    const history2 = await getChatHistory(window, pdfId2, null)
    expect(history2).toHaveLength(2)
    expect(history2[0].content).toBe('Question for PDF 2')
    expect(history2[1].content).toBe('Answer for PDF 2')
  })

  test('switching PDFs shows correct chat header state', async () => {
    app = await launchApp()
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await setupApiKey(window)

    // Upload and process two PDFs
    const { pdfId: pdfId1 } = await uploadPdf(window, SAMPLE_PDF)
    await waitForChapters(window, pdfId1)
    await markPdfDone(window, pdfId1)

    const { pdfId: pdfId2 } = await uploadPdf(window, SAMPLE_PDF_2)
    await waitForChapters(window, pdfId2)
    await markPdfDone(window, pdfId2)

    // Reload to see both PDFs
    await window.reload()
    await window.waitForLoadState('domcontentloaded')

    // Select first PDF
    await window.locator('[data-testid="pdf-row"]').first().click()
    await expect(window.locator('[data-testid="pdf-header"]')).toBeVisible()
    await expect(window.locator('text=Ready to chat')).toBeVisible()

    // Select second PDF
    await window.locator('[data-testid="pdf-row"]').last().click()
    await expect(window.locator('[data-testid="pdf-header"]')).toBeVisible()
    await expect(window.locator('text=Ready to chat')).toBeVisible()

    // Chat input should be enabled for both
    const chatInput = window.locator('[data-testid="chat-input"]')
    await expect(chatInput).toBeEnabled()
  })
})

test.describe('Text Truncation', () => {
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

  test('chapter titles truncate with ellipsis and show tooltip on hover', async () => {
    app = await launchApp()
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await setupApiKey(window)

    // Upload PDF and wait for chapters
    const { pdfId } = await uploadPdf(window, SAMPLE_PDF)
    const chapters = await waitForChapters(window, pdfId)
    await markPdfDone(window, pdfId)

    await window.reload()
    await window.waitForLoadState('domcontentloaded')

    // Expand chapters
    const expandBtn = window.locator('[data-testid="expand-btn"]').first()
    await expandBtn.click()

    // Get the first chapter row
    const chapterRow = window.locator('[data-testid="chapter-row"]').first()
    await expect(chapterRow).toBeVisible()

    // Find the span with the chapter title (has truncate class)
    const titleSpan = chapterRow.locator('span.truncate')

    // Verify CSS truncation is applied
    const styles = await titleSpan.evaluate((el) => {
      const computed = window.getComputedStyle(el)
      return {
        textOverflow: computed.textOverflow,
        overflow: computed.overflow,
        whiteSpace: computed.whiteSpace
      }
    })
    expect(styles.textOverflow).toBe('ellipsis')
    expect(styles.overflow).toBe('hidden')
    expect(styles.whiteSpace).toBe('nowrap')

    // Verify native title attribute contains full chapter title
    const titleAttr = await titleSpan.getAttribute('title')
    expect(titleAttr).toBe(chapters[0].title)

    // Hover over chapter row to trigger tooltip
    await titleSpan.hover()

    // Radix tooltip should appear with full text
    const tooltip = window.locator('[role="tooltip"]')
    await expect(tooltip).toBeVisible({ timeout: 2000 })
    await expect(tooltip).toContainText(chapters[0].title)
  })

  test('PDF titles truncate with ellipsis and show tooltip on hover', async () => {
    app = await launchApp()
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await setupApiKey(window)

    // Upload PDF
    const { pdfId } = await uploadPdf(window, SAMPLE_PDF)
    await waitForChapters(window, pdfId)
    await markPdfDone(window, pdfId)

    await window.reload()
    await window.waitForLoadState('domcontentloaded')

    // Get the PDF row
    const pdfRow = window.locator('[data-testid="pdf-row"]').first()
    await expect(pdfRow).toBeVisible()

    // Find the span with PDF title (has truncate class)
    const titleSpan = pdfRow.locator('span.truncate')

    // Verify CSS truncation is applied
    const styles = await titleSpan.evaluate((el) => {
      const computed = window.getComputedStyle(el)
      return {
        textOverflow: computed.textOverflow,
        overflow: computed.overflow,
        whiteSpace: computed.whiteSpace
      }
    })
    expect(styles.textOverflow).toBe('ellipsis')
    expect(styles.overflow).toBe('hidden')
    expect(styles.whiteSpace).toBe('nowrap')

    // Verify native title attribute is set
    const titleAttr = await titleSpan.getAttribute('title')
    expect(titleAttr).toBeTruthy()

    // Hover to trigger tooltip
    await titleSpan.hover()

    // Radix tooltip should appear
    const tooltip = window.locator('[role="tooltip"]')
    await expect(tooltip).toBeVisible({ timeout: 2000 })
  })
})

test.describe('Chapter Processing Status', () => {
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

  test('shows partial processing badge when chat ready but summary/concepts pending', async () => {
    app = await launchApp()
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await setupApiKey(window)

    // Upload PDF
    const { pdfId } = await uploadPdf(window, SAMPLE_PDF)
    await waitForChapters(window, pdfId)

    // Mark PDF done - this sets chapter.status='done' but summary_status/concepts_status remain null
    // This simulates the state where embedding is complete but summary/concepts still pending
    await markPdfDone(window, pdfId)

    await window.reload()
    await window.waitForLoadState('domcontentloaded')

    // Expand to show chapters
    const expandBtn = window.locator('[data-testid="expand-btn"]').first()
    await expandBtn.click()

    // Get first chapter row
    const chapterRow = window.locator('[data-testid="chapter-row"]').first()
    await expect(chapterRow).toBeVisible()

    // Should show the amber CircleDashed icon (partial processing indicator)
    // The icon is inside the chapter-status span
    const statusIndicator = chapterRow.locator('[data-testid="chapter-status"]')
    const partialIcon = statusIndicator.locator('svg.lucide-circle-dashed')
    await expect(partialIcon).toBeVisible()

    // Verify icon has the text-amber-400 class applied
    await expect(partialIcon).toHaveClass(/text-amber-400/)

    // Hover to show tooltip
    await partialIcon.hover()
    const tooltip = window.locator('[role="tooltip"]')
    await expect(tooltip).toBeVisible({ timeout: 2000 })
    await expect(tooltip).toContainText('partially processed')
  })
})
