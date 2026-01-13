import { test, expect, ElectronApplication, Page } from '@playwright/test'
import {
  cleanupDb,
  launchApp,
  setupApiKey,
  uploadPdf,
  waitForChapters,
  markPdfDone,
  sendChatMessage,
  getChatHistory,
  SAMPLE_PDF
} from './fixtures'

// These tests require a real API key to test guardrails behavior
// Set GOOGLE_GENERATIVE_AI_API_KEY env var to run them
const hasRealApiKey = !!process.env.GOOGLE_GENERATIVE_AI_API_KEY

test.describe('Chat Guardrails', () => {
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

  // Helper to setup with real or test API key
  async function setupWithApiKey(window: Page): Promise<void> {
    if (hasRealApiKey) {
      // Use real API key from environment
      await window.evaluate(async (key) => {
        const api = (window as unknown as { api: { setKeyTest: (key: string) => Promise<boolean> } }).api
        await api.setKeyTest(key)
      }, process.env.GOOGLE_GENERATIVE_AI_API_KEY!)
      await window.reload()
      await window.waitForLoadState('domcontentloaded')
    } else {
      await setupApiKey(window)
    }
  }

  test('off-topic question gets refused', async () => {
    test.skip(!hasRealApiKey, 'Requires GOOGLE_GENERATIVE_AI_API_KEY env var')

    app = await launchApp()
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await setupWithApiKey(window)

    // Upload and prepare PDF
    const { pdfId } = await uploadPdf(window, SAMPLE_PDF)
    await waitForChapters(window, pdfId)
    await markPdfDone(window, pdfId)

    // Send off-topic question
    const { response, error } = await sendChatMessage(window, pdfId, null, 'Write me Python code to sort a list')

    expect(error).toBeUndefined()
    expect(response).toContain('only help with questions about this book')
  })

  test('book-related question gets answered', async () => {
    test.skip(!hasRealApiKey, 'Requires GOOGLE_GENERATIVE_AI_API_KEY env var')

    app = await launchApp()
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await setupWithApiKey(window)

    // Upload and prepare PDF
    const { pdfId } = await uploadPdf(window, SAMPLE_PDF)
    await waitForChapters(window, pdfId)
    await markPdfDone(window, pdfId)

    // Send book-related question
    const { response, error } = await sendChatMessage(window, pdfId, null, 'What is this document about?')

    expect(error).toBeUndefined()
    // Should not be a refusal message
    expect(response).not.toContain('only help with questions about this book')
    // Should have some content
    expect(response.length).toBeGreaterThan(20)
  })

  test('meta-request about book content is allowed', async () => {
    test.skip(!hasRealApiKey, 'Requires GOOGLE_GENERATIVE_AI_API_KEY env var')

    app = await launchApp()
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await setupWithApiKey(window)

    // Upload and prepare PDF
    const { pdfId } = await uploadPdf(window, SAMPLE_PDF)
    await waitForChapters(window, pdfId)
    await markPdfDone(window, pdfId)

    // First ask a book question to get context
    await sendChatMessage(window, pdfId, null, 'What is the main topic of this document?')

    // Then ask a meta-request
    const { response, error } = await sendChatMessage(window, pdfId, null, 'Can you explain that in simpler terms?')

    expect(error).toBeUndefined()
    // Should not be a refusal message
    expect(response).not.toContain('only help with questions about this book')
  })

  test('general knowledge question gets refused', async () => {
    test.skip(!hasRealApiKey, 'Requires GOOGLE_GENERATIVE_AI_API_KEY env var')

    app = await launchApp()
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await setupWithApiKey(window)

    // Upload and prepare PDF
    const { pdfId } = await uploadPdf(window, SAMPLE_PDF)
    await waitForChapters(window, pdfId)
    await markPdfDone(window, pdfId)

    // Send general knowledge question
    const { response, error } = await sendChatMessage(window, pdfId, null, "What's the capital of France?")

    expect(error).toBeUndefined()
    expect(response).toContain('only help with questions about this book')
  })

  test('refusal message is saved to chat history', async () => {
    test.skip(!hasRealApiKey, 'Requires GOOGLE_GENERATIVE_AI_API_KEY env var')

    app = await launchApp()
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await setupWithApiKey(window)

    // Upload and prepare PDF
    const { pdfId } = await uploadPdf(window, SAMPLE_PDF)
    await waitForChapters(window, pdfId)
    await markPdfDone(window, pdfId)

    // Send off-topic question
    await sendChatMessage(window, pdfId, null, 'Tell me a joke')

    // Check history includes the refusal
    const history = await getChatHistory(window, pdfId, null)
    const assistantMessages = history.filter((m) => m.role === 'assistant')

    expect(assistantMessages.length).toBeGreaterThan(0)
    expect(assistantMessages[assistantMessages.length - 1].content).toContain('only help with questions about this book')
  })
})
