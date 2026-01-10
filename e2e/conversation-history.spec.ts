import { test, expect, ElectronApplication } from '@playwright/test'
import {
  cleanupDb,
  launchApp,
  setupApiKey,
  uploadPdf,
  waitForChapters,
  saveMessage,
  getHistoryStats,
  buildHistory,
  SAMPLE_PDF
} from './fixtures'

test.describe('Conversation History', () => {
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

  test('under budget: all messages returned verbatim', async () => {
    app = await launchApp()
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await setupApiKey(window)

    // Upload a PDF to get a valid pdfId
    const { pdfId } = await uploadPdf(window, SAMPLE_PDF)

    // Save a few messages (under 16k token budget)
    await saveMessage(window, pdfId, null, 'user', 'What is machine learning?')
    await saveMessage(window, pdfId, null, 'assistant', 'Machine learning is a subset of AI that enables systems to learn from data.')
    await saveMessage(window, pdfId, null, 'user', 'Can you give an example?')
    await saveMessage(window, pdfId, null, 'assistant', 'Sure! Email spam filters use ML to classify emails as spam or not spam.')

    // Check history stats
    const stats = await getHistoryStats(window, pdfId, null)

    expect(stats.messageCount).toBe(4)
    expect(stats.totalTokens).toBeLessThan(16000)
    expect(stats.cachedSummary).toBeNull() // No summary needed yet

    // Build history (under budget - no summarization needed)
    const result = await buildHistory(window, pdfId, null)

    // Should return history without error (all messages verbatim)
    expect('history' in result).toBe(true)
    if ('history' in result) {
      expect(result.history).toContain('User: What is machine learning?')
      expect(result.history).toContain('Assistant: Machine learning is a subset')
      expect(result.history).toContain('User: Can you give an example?')
      expect(result.history).toContain('Assistant: Sure! Email spam filters')
    }
  })

  test('history stats track message count and tokens', async () => {
    app = await launchApp()
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await setupApiKey(window)

    // Upload a PDF to get a valid pdfId
    const { pdfId } = await uploadPdf(window, SAMPLE_PDF)

    // Initially no messages
    const initialStats = await getHistoryStats(window, pdfId, null)

    expect(initialStats.messageCount).toBe(0)
    expect(initialStats.totalTokens).toBe(0)

    // Add messages
    await saveMessage(window, pdfId, null, 'user', 'Hello')
    await saveMessage(window, pdfId, null, 'assistant', 'Hi there!')

    const afterStats = await getHistoryStats(window, pdfId, null)

    expect(afterStats.messageCount).toBe(2)
    expect(afterStats.totalTokens).toBeGreaterThan(0)
  })

  test('chapter-scoped messages are separate from pdf-level', async () => {
    app = await launchApp()
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await setupApiKey(window)

    // Upload a PDF to get a valid pdfId
    const { pdfId } = await uploadPdf(window, SAMPLE_PDF)

    // Wait for chapters to be created
    const chapters = await waitForChapters(window, pdfId)
    const chapterId = chapters[0].id

    // Add PDF-level messages
    await saveMessage(window, pdfId, null, 'user', 'PDF level question')
    await saveMessage(window, pdfId, null, 'assistant', 'PDF level answer')

    // Add chapter-level messages
    await saveMessage(window, pdfId, chapterId, 'user', 'Chapter question')

    // Check PDF-level stats
    const pdfStats = await getHistoryStats(window, pdfId, null)

    // Check chapter-level stats
    const chapterStats = await getHistoryStats(window, pdfId, chapterId)

    expect(pdfStats.messageCount).toBe(2)
    expect(chapterStats.messageCount).toBe(1)
  })
})
