import { _electron as electron, ElectronApplication, Page } from '@playwright/test'
import { unlinkSync, existsSync, rmSync } from 'fs'
import { homedir } from 'os'
import { join, resolve } from 'path'

// Paths - use worker-specific directory for parallel test isolation
const getWorkerIndex = () => process.env.TEST_PARALLEL_INDEX || '0'
const getTestDbDir = () => join(homedir(), `Library/Application Support/ai-notebook-test-${getWorkerIndex()}`)
const getDbPath = () => join(getTestDbDir(), 'ai-notebook.db')

export const SAMPLE_PDF = resolve(__dirname, '../pdfs/sample.pdf')

// Clean up database files and test directory
export function cleanupDb(): void {
  const dbPath = getDbPath()
  for (const suffix of ['', '-shm', '-wal']) {
    const path = dbPath + suffix
    if (existsSync(path)) unlinkSync(path)
  }
}

// Clean up entire test directory (call in globalTeardown or afterAll)
export function cleanupTestDir(): void {
  const testDir = getTestDbDir()
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true })
  }
}

// Clear localStorage in the window (for test isolation)
export async function clearLocalStorage(window: Page): Promise<void> {
  await window.evaluate(() => {
    localStorage.clear()
  })
}

// Wait for a localStorage key to have a value (polls until set)
export async function waitForLocalStorage(window: Page, key: string, timeout = 3000): Promise<string | null> {
  const startTime = Date.now()
  while (Date.now() - startTime < timeout) {
    const value = await window.evaluate((k) => localStorage.getItem(k), key)
    if (value !== null) return value
    await window.waitForTimeout(50)
  }
  return null
}

// Launch app with common options
export async function launchApp(): Promise<ElectronApplication> {
  return electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      AI_NOTEBOOK_TEST_DB_DIR: getTestDbDir()
    }
  })
}

// Wait for the preload API to be available
export async function waitForApi(window: Page, timeout = 5000): Promise<void> {
  const startTime = Date.now()
  while (Date.now() - startTime < timeout) {
    const hasApi = await window.evaluate(() => {
      return typeof (window as unknown as { api: unknown }).api !== 'undefined'
    })
    if (hasApi) return
    await window.waitForTimeout(100)
  }
  throw new Error(`API not available within ${timeout}ms`)
}

// Set test API key and reload to bypass settings dialog
export async function setupApiKey(window: Page): Promise<void> {
  await waitForApi(window)
  await window.evaluate(async () => {
    const api = (window as unknown as { api: { setKeyTest: (key: string) => Promise<boolean> } }).api
    await api.setKeyTest('test-api-key-12345')
  })
  await window.reload()
  await window.waitForLoadState('domcontentloaded')
  await waitForApi(window)
}

// Upload a PDF via test-only IPC
export async function uploadPdf(window: Page, pdfPath: string = SAMPLE_PDF): Promise<{ pdfId: number }> {
  const result = await window.evaluate(async (path) => {
    const api = (window as unknown as { api: { uploadPdfFile: (path: string) => Promise<{ pdfId: number } | { error: string }> } }).api
    return await api.uploadPdfFile(path)
  }, pdfPath)

  if ('error' in result) {
    throw new Error(`Failed to upload PDF: ${result.error}`)
  }
  return result as { pdfId: number }
}

// Wait for chapters to be created
export async function waitForChapters(window: Page, pdfId: number, timeout = 30000): Promise<{ id: number; title: string }[]> {
  let chapters: { id: number; title: string }[] = []

  const startTime = Date.now()
  while (Date.now() - startTime < timeout) {
    chapters = await window.evaluate(async (id) => {
      const api = (window as unknown as { api: { listChapters: (pdfId: number) => Promise<{ id: number; title: string }[]> } }).api
      return await api.listChapters(id)
    }, pdfId)

    if (chapters.length > 0) break
    await window.waitForTimeout(500)
  }

  if (chapters.length === 0) {
    throw new Error(`No chapters created within ${timeout}ms`)
  }

  return chapters
}

// Mark PDF as done directly (test-only, bypasses embedding)
export async function markPdfDone(window: Page, pdfId: number): Promise<void> {
  await window.evaluate(async (id) => {
    const api = (window as unknown as { api: { setPdfStatusTest: (pdfId: number, status: string) => Promise<{ success: boolean } | { error: string }> } }).api
    const result = await api.setPdfStatusTest(id, 'done')
    if ('error' in result) throw new Error(result.error)
  }, pdfId)
}

// Save a message via IPC
export async function saveMessage(
  window: Page,
  pdfId: number,
  chapterId: number | null,
  role: 'user' | 'assistant',
  content: string
): Promise<number> {
  return window.evaluate(
    async ({ pdfId, chapterId, role, content }) => {
      const api = (window as unknown as {
        api: { saveMessage: (pdfId: number, chapterId: number | null, role: 'user' | 'assistant', content: string) => Promise<number> }
      }).api
      return await api.saveMessage(pdfId, chapterId, role, content)
    },
    { pdfId, chapterId, role, content }
  )
}

// Get chat history via IPC
export async function getChatHistory(
  window: Page,
  pdfId: number,
  chapterId: number | null
): Promise<{ role: string; content: string }[]> {
  return window.evaluate(
    async ({ pdfId, chapterId }) => {
      const api = (window as unknown as {
        api: { getChatHistory: (pdfId: number, chapterId: number | null) => Promise<{ role: string; content: string }[]> }
      }).api
      return await api.getChatHistory(pdfId, chapterId)
    },
    { pdfId, chapterId }
  )
}

// Get history stats via IPC
export async function getHistoryStats(
  window: Page,
  pdfId: number,
  chapterId: number | null
): Promise<{ messageCount: number; totalTokens: number; cachedSummary: string | null }> {
  return window.evaluate(
    async ({ pdfId, chapterId }) => {
      const api = (window as unknown as {
        api: { getHistoryStats: (pdfId: number, chapterId: number | null) => Promise<{ messageCount: number; totalTokens: number; cachedSummary: string | null }> }
      }).api
      return await api.getHistoryStats(pdfId, chapterId)
    },
    { pdfId, chapterId }
  )
}

// Set chapter summary via IPC
export async function setChapterSummary(window: Page, chapterId: number, summary: string): Promise<boolean> {
  return window.evaluate(
    async ({ chapterId, summary }) => {
      const api = (window as unknown as { api: { setChapterSummary: (chapterId: number, summary: string) => Promise<boolean> } }).api
      return await api.setChapterSummary(chapterId, summary)
    },
    { chapterId, summary }
  )
}

// Build history via IPC
export async function buildHistory(
  window: Page,
  pdfId: number,
  chapterId: number | null
): Promise<{ history: string } | { error: string }> {
  return window.evaluate(
    async ({ pdfId, chapterId }) => {
      const api = (window as unknown as {
        api: { buildHistory: (pdfId: number, chapterId: number | null) => Promise<{ history: string } | { error: string }> }
      }).api
      return await api.buildHistory(pdfId, chapterId)
    },
    { pdfId, chapterId }
  )
}

// Get chapter with full details including start_page (test-only)
export async function getChapterDetails(
  window: Page,
  chapterId: number
): Promise<{
  id: number
  pdf_id: number
  title: string
  chapter_index: number
  start_idx: number
  end_idx: number
  start_page: number | null
  status: string
  error_message: string | null
}> {
  const result = await window.evaluate(async (id) => {
    const api = (window as unknown as {
      api: { getChapterTest: (chapterId: number) => Promise<unknown> }
    }).api
    return await api.getChapterTest(id)
  }, chapterId)

  if (result && typeof result === 'object' && 'error' in result) {
    throw new Error(`Failed to get chapter: ${(result as { error: string }).error}`)
  }
  return result as {
    id: number
    pdf_id: number
    title: string
    chapter_index: number
    start_idx: number
    end_idx: number
    start_page: number | null
    status: string
    error_message: string | null
  }
}

// Get PDF outline directly from file (test-only)
export async function getPdfOutline(
  window: Page,
  pdfId: number
): Promise<{
  hasToc: boolean
  chapters: { title: string; pageNumber: number }[]
}> {
  const result = await window.evaluate(async (id) => {
    const api = (window as unknown as {
      api: { getPdfOutlineTest: (pdfId: number) => Promise<unknown> }
    }).api
    return await api.getPdfOutlineTest(id)
  }, pdfId)

  if (result && typeof result === 'object' && 'error' in result) {
    throw new Error(`Failed to get PDF outline: ${(result as { error: string }).error}`)
  }
  return result as {
    hasToc: boolean
    chapters: { title: string; pageNumber: number }[]
  }
}
