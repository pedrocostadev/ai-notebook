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

    // Upload a PDF
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

    // Set a test summary for the chapter
    const testSummary = 'This is a test summary for the chapter.'
    await window.evaluate(async ({ chapterId, summary }) => {
      const api = (window as unknown as { api: { setChapterSummary: (chapterId: number, summary: string) => Promise<boolean> } }).api
      return await api.setChapterSummary(chapterId, summary)
    }, { chapterId: chapterId!, summary: testSummary })

    // Simulate the /summary command execution from main chat (chapterId = null)
    // This mimics what ChatContainer does: saves message to current context, not target chapter
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
    }, { pdfId, targetChapterId: chapterId!, testSummary })

    // Verify messages appear in main chat history (chapterId = null)
    const mainChatHistory = await window.evaluate(async (pdfId) => {
      const api = (window as unknown as {
        api: { getChatHistory: (pdfId: number, chapterId: number | null) => Promise<{ role: string; content: string }[]> }
      }).api
      return await api.getChatHistory(pdfId, null)
    }, pdfId)

    expect(mainChatHistory.length).toBe(2)
    expect(mainChatHistory[0].role).toBe('user')
    expect(mainChatHistory[0].content).toBe('/summary')
    expect(mainChatHistory[1].role).toBe('assistant')
    expect(mainChatHistory[1].content).toBe(testSummary)

    // Verify messages do NOT appear in chapter-specific history
    const chapterHistory = await window.evaluate(async ({ pdfId, chapterId }) => {
      const api = (window as unknown as {
        api: { getChatHistory: (pdfId: number, chapterId: number | null) => Promise<{ role: string; content: string }[]> }
      }).api
      return await api.getChatHistory(pdfId, chapterId)
    }, { pdfId, chapterId: chapterId! })

    expect(chapterHistory.length).toBe(0)
  })

  test('/summary from chapter view saves message to chapter context', async () => {
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

    // Upload a PDF
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

    // Set a test summary for the chapter
    const testSummary = 'This is a test summary for the chapter.'
    await window.evaluate(async ({ chapterId, summary }) => {
      const api = (window as unknown as { api: { setChapterSummary: (chapterId: number, summary: string) => Promise<boolean> } }).api
      return await api.setChapterSummary(chapterId, summary)
    }, { chapterId: chapterId!, summary: testSummary })

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
    }, { pdfId, chapterId: chapterId!, testSummary })

    // Verify messages appear in chapter history
    const chapterHistory = await window.evaluate(async ({ pdfId, chapterId }) => {
      const api = (window as unknown as {
        api: { getChatHistory: (pdfId: number, chapterId: number | null) => Promise<{ role: string; content: string }[]> }
      }).api
      return await api.getChatHistory(pdfId, chapterId)
    }, { pdfId, chapterId: chapterId! })

    expect(chapterHistory.length).toBe(2)
    expect(chapterHistory[0].content).toBe('/summary')
    expect(chapterHistory[1].content).toBe(testSummary)

    // Verify messages do NOT appear in main chat
    const mainChatHistory = await window.evaluate(async (pdfId) => {
      const api = (window as unknown as {
        api: { getChatHistory: (pdfId: number, chapterId: number | null) => Promise<{ role: string; content: string }[]> }
      }).api
      return await api.getChatHistory(pdfId, null)
    }, pdfId)

    expect(mainChatHistory.length).toBe(0)
  })
})
