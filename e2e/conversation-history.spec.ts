import { test, expect, _electron as electron, ElectronApplication } from '@playwright/test'
import { unlinkSync, existsSync } from 'fs'
import { homedir } from 'os'
import { join, resolve } from 'path'

const DB_PATH = join(homedir(), 'Library/Application Support/ai-notebook/ai-notebook.db')
const SAMPLE_PDF = resolve(__dirname, '../pdfs/sample.pdf')

function cleanupDb() {
  if (existsSync(DB_PATH)) {
    unlinkSync(DB_PATH)
  }
}

test.describe('Conversation History', () => {
  let app: ElectronApplication

  test.beforeEach(async () => {
    cleanupDb()
  })

  test.afterEach(async () => {
    if (app) {
      await app.close()
    }
  })

  test('under budget: all messages returned verbatim', async () => {
    app = await electron.launch({
      args: ['.'],
      env: { ...process.env, NODE_ENV: 'test' }
    })

    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    // Set test API key
    await window.evaluate(async () => {
      const api = (window as unknown as { api: { setKeyTest: (key: string) => Promise<boolean> } }).api
      await api.setKeyTest('test-api-key-12345')
    })

    await window.reload()
    await window.waitForLoadState('domcontentloaded')
    await window.waitForTimeout(500)

    // Upload a PDF to get a valid pdfId
    const uploadResult = await window.evaluate(async (pdfPath) => {
      const api = (window as unknown as { api: { uploadPdfFile: (path: string) => Promise<{ pdfId: number } | { error: string }> } }).api
      return await api.uploadPdfFile(pdfPath)
    }, SAMPLE_PDF)

    expect('pdfId' in uploadResult).toBe(true)
    const pdfId = (uploadResult as { pdfId: number }).pdfId

    // Save a few messages (under 16k token budget)
    await window.evaluate(async (id) => {
      const api = (window as unknown as {
        api: {
          saveMessage: (pdfId: number, chapterId: number | null, role: 'user' | 'assistant', content: string) => Promise<number>
        }
      }).api
      await api.saveMessage(id, null, 'user', 'What is machine learning?')
      await api.saveMessage(id, null, 'assistant', 'Machine learning is a subset of AI that enables systems to learn from data.')
      await api.saveMessage(id, null, 'user', 'Can you give an example?')
      await api.saveMessage(id, null, 'assistant', 'Sure! Email spam filters use ML to classify emails as spam or not spam.')
    }, pdfId)

    // Check history stats
    const stats = await window.evaluate(async (id) => {
      const api = (window as unknown as {
        api: { getHistoryStats: (pdfId: number, chapterId: number | null) => Promise<{ messageCount: number; totalTokens: number; cachedSummary: string | null }> }
      }).api
      return await api.getHistoryStats(id, null)
    }, pdfId)

    expect(stats.messageCount).toBe(4)
    expect(stats.totalTokens).toBeLessThan(16000)
    expect(stats.cachedSummary).toBeNull() // No summary needed yet

    // Build history (under budget - no summarization needed)
    const result = await window.evaluate(async (id) => {
      const api = (window as unknown as {
        api: { buildHistory: (pdfId: number, chapterId: number | null) => Promise<{ history: string } | { error: string }> }
      }).api
      return await api.buildHistory(id, null)
    }, pdfId)

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
    app = await electron.launch({
      args: ['.'],
      env: { ...process.env, NODE_ENV: 'test' }
    })

    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await window.evaluate(async () => {
      const api = (window as unknown as { api: { setKeyTest: (key: string) => Promise<boolean> } }).api
      await api.setKeyTest('test-api-key-12345')
    })

    await window.reload()
    await window.waitForLoadState('domcontentloaded')
    await window.waitForTimeout(500)

    // Upload a PDF to get a valid pdfId
    const uploadResult = await window.evaluate(async (pdfPath) => {
      const api = (window as unknown as { api: { uploadPdfFile: (path: string) => Promise<{ pdfId: number } | { error: string }> } }).api
      return await api.uploadPdfFile(pdfPath)
    }, SAMPLE_PDF)

    expect('pdfId' in uploadResult).toBe(true)
    const pdfId = (uploadResult as { pdfId: number }).pdfId

    // Initially no messages
    const initialStats = await window.evaluate(async (id) => {
      const api = (window as unknown as {
        api: { getHistoryStats: (pdfId: number, chapterId: number | null) => Promise<{ messageCount: number; totalTokens: number; cachedSummary: string | null }> }
      }).api
      return await api.getHistoryStats(id, null)
    }, pdfId)

    expect(initialStats.messageCount).toBe(0)
    expect(initialStats.totalTokens).toBe(0)

    // Add messages
    await window.evaluate(async (id) => {
      const api = (window as unknown as {
        api: { saveMessage: (pdfId: number, chapterId: number | null, role: 'user' | 'assistant', content: string) => Promise<number> }
      }).api
      await api.saveMessage(id, null, 'user', 'Hello')
      await api.saveMessage(id, null, 'assistant', 'Hi there!')
    }, pdfId)

    const afterStats = await window.evaluate(async (id) => {
      const api = (window as unknown as {
        api: { getHistoryStats: (pdfId: number, chapterId: number | null) => Promise<{ messageCount: number; totalTokens: number; cachedSummary: string | null }> }
      }).api
      return await api.getHistoryStats(id, null)
    }, pdfId)

    expect(afterStats.messageCount).toBe(2)
    expect(afterStats.totalTokens).toBeGreaterThan(0)
  })

  test('chapter-scoped messages are separate from pdf-level', async () => {
    app = await electron.launch({
      args: ['.'],
      env: { ...process.env, NODE_ENV: 'test' }
    })

    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await window.evaluate(async () => {
      const api = (window as unknown as { api: { setKeyTest: (key: string) => Promise<boolean> } }).api
      await api.setKeyTest('test-api-key-12345')
    })

    await window.reload()
    await window.waitForLoadState('domcontentloaded')
    await window.waitForTimeout(500)

    // Upload a PDF to get a valid pdfId
    const uploadResult = await window.evaluate(async (pdfPath) => {
      const api = (window as unknown as { api: { uploadPdfFile: (path: string) => Promise<{ pdfId: number } | { error: string }> } }).api
      return await api.uploadPdfFile(pdfPath)
    }, SAMPLE_PDF)

    expect('pdfId' in uploadResult).toBe(true)
    const pdfId = (uploadResult as { pdfId: number }).pdfId

    // Wait for chapters to be created
    let chapterId: number | null = null
    await expect(async () => {
      const chapters = await window.evaluate(async (id) => {
        const api = (window as unknown as { api: { listChapters: (pdfId: number) => Promise<{ id: number }[]> } }).api
        return await api.listChapters(id)
      }, pdfId)
      expect(chapters.length).toBeGreaterThan(0)
      chapterId = chapters[0].id
    }).toPass({ timeout: 30000 })

    expect(chapterId).not.toBeNull()

    // Add PDF-level messages
    await window.evaluate(async (id) => {
      const api = (window as unknown as {
        api: { saveMessage: (pdfId: number, chapterId: number | null, role: 'user' | 'assistant', content: string) => Promise<number> }
      }).api
      await api.saveMessage(id, null, 'user', 'PDF level question')
      await api.saveMessage(id, null, 'assistant', 'PDF level answer')
    }, pdfId)

    // Add chapter-level messages
    await window.evaluate(async ({ pdfId, chapterId }) => {
      const api = (window as unknown as {
        api: { saveMessage: (pdfId: number, chapterId: number | null, role: 'user' | 'assistant', content: string) => Promise<number> }
      }).api
      await api.saveMessage(pdfId, chapterId, 'user', 'Chapter question')
    }, { pdfId, chapterId })

    // Check PDF-level stats
    const pdfStats = await window.evaluate(async (id) => {
      const api = (window as unknown as {
        api: { getHistoryStats: (pdfId: number, chapterId: number | null) => Promise<{ messageCount: number; totalTokens: number; cachedSummary: string | null }> }
      }).api
      return await api.getHistoryStats(id, null)
    }, pdfId)

    // Check chapter-level stats
    const chapterStats = await window.evaluate(async ({ pdfId, chapterId }) => {
      const api = (window as unknown as {
        api: { getHistoryStats: (pdfId: number, chapterId: number | null) => Promise<{ messageCount: number; totalTokens: number; cachedSummary: string | null }> }
      }).api
      return await api.getHistoryStats(pdfId, chapterId)
    }, { pdfId, chapterId })

    expect(pdfStats.messageCount).toBe(2)
    expect(chapterStats.messageCount).toBe(1)
  })
})
