import { test, expect, ElectronApplication } from '@playwright/test'
import {
  cleanupDb,
  launchApp,
  setupApiKey,
  uploadPdf,
  waitForChapters,
  markPdfDone,
  setChapterSummary,
  getChatHistory,
  SAMPLE_PDF
} from './fixtures'

test.describe('Slash Commands', () => {
  let app: ElectronApplication

  test.beforeEach(async () => {
    cleanupDb()
  })

  test.afterEach(async () => {
    if (app) {
      await app.close()
    }
  })

  test('/summary from main chat saves message to main chat context', async () => {
    app = await launchApp()
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await setupApiKey(window)

    // Upload a PDF
    const { pdfId } = await uploadPdf(window, SAMPLE_PDF)

    // Wait for chapters to be created
    const chapters = await waitForChapters(window, pdfId)
    const chapterId = chapters[0].id

    // Set a test summary for the chapter
    const testSummary = 'This is a test summary for the chapter.'
    await setChapterSummary(window, chapterId, testSummary)

    // Simulate the /summary command execution from main chat (chapterId = null)
    await window.evaluate(async ({ pdfId, targetChapterId, testSummary }) => {
      const api = (window as unknown as {
        api: {
          getChapterSummary: (chapterId: number) => Promise<{ summary: string } | { pending: true } | { error: string } | { empty: true }>
          saveMessage: (pdfId: number, chapterId: number | null, role: 'user' | 'assistant', content: string) => Promise<number>
        }
      }).api

      // Save user command to main chat (chapterId = null, the current view context)
      await api.saveMessage(pdfId, null, 'user', '/summary')

      // Get summary from target chapter
      const result = await api.getChapterSummary(targetChapterId)

      // Save result to main chat (chapterId = null, the current view context)
      if ('summary' in result) {
        await api.saveMessage(pdfId, null, 'assistant', result.summary)
      }
    }, { pdfId, targetChapterId: chapterId, testSummary })

    // Verify messages appear in main chat history (chapterId = null)
    const mainChatHistory = await getChatHistory(window, pdfId, null)

    expect(mainChatHistory.length).toBe(2)
    expect(mainChatHistory[0].role).toBe('user')
    expect(mainChatHistory[0].content).toBe('/summary')
    expect(mainChatHistory[1].role).toBe('assistant')
    expect(mainChatHistory[1].content).toBe(testSummary)

    // Verify messages do NOT appear in chapter-specific history
    const chapterHistory = await getChatHistory(window, pdfId, chapterId)

    expect(chapterHistory.length).toBe(0)
  })

  test('/summary from chapter view saves message to chapter context', async () => {
    app = await launchApp()
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await setupApiKey(window)

    // Upload a PDF
    const { pdfId } = await uploadPdf(window, SAMPLE_PDF)

    // Wait for chapters to be created
    const chapters = await waitForChapters(window, pdfId)
    const chapterId = chapters[0].id

    // Set a test summary for the chapter
    const testSummary = 'This is a test summary for the chapter.'
    await setChapterSummary(window, chapterId, testSummary)

    // Simulate /summary from chapter view (save to chapter context)
    await window.evaluate(async ({ pdfId, chapterId, testSummary }) => {
      const api = (window as unknown as {
        api: {
          getChapterSummary: (chapterId: number) => Promise<{ summary: string } | { pending: true } | { error: string } | { empty: true }>
          saveMessage: (pdfId: number, chapterId: number | null, role: 'user' | 'assistant', content: string) => Promise<number>
        }
      }).api

      // Save to chapter context (as if viewing that chapter)
      await api.saveMessage(pdfId, chapterId, 'user', '/summary')

      const result = await api.getChapterSummary(chapterId)
      if ('summary' in result) {
        await api.saveMessage(pdfId, chapterId, 'assistant', result.summary)
      }
    }, { pdfId, chapterId, testSummary })

    // Verify messages appear in chapter history
    const chapterHistory = await getChatHistory(window, pdfId, chapterId)

    expect(chapterHistory.length).toBe(2)
    expect(chapterHistory[0].content).toBe('/summary')
    expect(chapterHistory[1].content).toBe(testSummary)

    // Verify messages do NOT appear in main chat
    const mainChatHistory = await getChatHistory(window, pdfId, null)

    expect(mainChatHistory.length).toBe(0)
  })

  test('slash command menu appears when typing /', async () => {
    app = await launchApp()
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await setupApiKey(window)

    // Upload a PDF and mark as done (skip embedding for UI test)
    const { pdfId } = await uploadPdf(window, SAMPLE_PDF)
    await waitForChapters(window, pdfId)
    await markPdfDone(window, pdfId)

    // Reload to see PDF in list and select it
    await window.reload()
    await window.waitForLoadState('domcontentloaded')

    // Select the PDF
    await window.locator('[data-testid="pdf-row"]').first().click()

    // Wait for chat input to be enabled
    const chatInput = window.locator('[data-testid="chat-input"]')
    await expect(chatInput).toBeEnabled({ timeout: 10000 })

    // Type "/" in the chat input
    await chatInput.fill('/')

    // Slash command menu should appear with all commands
    await expect(window.locator('[data-testid="slash-command-summary"]')).toBeVisible()
    await expect(window.locator('[data-testid="slash-command-book_meta_data"]')).toBeVisible()
    await expect(window.locator('[data-testid="slash-command-key-concepts"]')).toBeVisible()
    await expect(window.locator('[data-testid="slash-command-test-my-knowledge"]')).toBeVisible()
  })

  test('slash command menu filters as you type', async () => {
    app = await launchApp()
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await setupApiKey(window)

    // Upload a PDF and mark as done (skip embedding for UI test)
    const { pdfId } = await uploadPdf(window, SAMPLE_PDF)
    await waitForChapters(window, pdfId)
    await markPdfDone(window, pdfId)

    // Reload to see PDF in list and select it
    await window.reload()
    await window.waitForLoadState('domcontentloaded')

    // Select the PDF
    await window.locator('[data-testid="pdf-row"]').first().click()

    // Wait for chat input to be enabled
    const chatInput = window.locator('[data-testid="chat-input"]')
    await expect(chatInput).toBeEnabled({ timeout: 10000 })

    // Type "/sum" in the chat input
    await chatInput.fill('/sum')

    // Only summary command should be visible
    await expect(window.locator('[data-testid="slash-command-summary"]')).toBeVisible()
    await expect(window.locator('[data-testid="slash-command-book_meta_data"]')).not.toBeVisible()
    await expect(window.locator('[data-testid="slash-command-key-concepts"]')).not.toBeVisible()
  })
})
