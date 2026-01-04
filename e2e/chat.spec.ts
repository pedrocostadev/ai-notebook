import { test, expect, _electron as electron, ElectronApplication } from '@playwright/test'
import { resolve } from 'path'
import { unlinkSync, existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

const DB_PATH = join(homedir(), 'Library/Application Support/ai-notebook/ai-notebook.db')
const SAMPLE_PDF = resolve(__dirname, '../pdfs/sample.pdf')

function cleanupDb() {
  if (existsSync(DB_PATH)) {
    unlinkSync(DB_PATH)
  }
}

test.describe('AI Notebook', () => {
  test('app launches and shows settings dialog on first run', async () => {
    cleanupDb()
    const app = await electron.launch({
      args: ['.'],
      env: {
        ...process.env,
        NODE_ENV: 'test'
      }
    })

    const window = await app.firstWindow()

    // Wait for app to load
    await window.waitForLoadState('domcontentloaded')

    // Settings dialog should appear on first run (no API key)
    const settingsTitle = window.locator('text=Settings')
    await expect(settingsTitle).toBeVisible({ timeout: 10000 })

    // API key input should be present
    const apiKeyInput = window.locator('input[type="password"]')
    await expect(apiKeyInput).toBeVisible()

    // Should show prompt for API key
    await expect(window.locator('label:text("Google Gemini API Key")')).toBeVisible()

    await app.close()
  })

  test('sidebar and main area render correctly', async () => {
    cleanupDb()
    const app = await electron.launch({
      args: ['.'],
      env: {
        ...process.env,
        NODE_ENV: 'test'
      }
    })

    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    // App title should be visible
    await expect(window.locator('text=AI Notebook')).toBeVisible({ timeout: 10000 })

    // Upload button should exist (in sidebar, may be behind dialog)
    const uploadButton = window.locator('text=Upload PDF').first()
    await expect(uploadButton).toBeVisible()

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
    app = await electron.launch({
      args: ['.'],
      env: {
        ...process.env,
        NODE_ENV: 'test'
      }
    })

    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    // Set test API key to bypass settings dialog
    await window.evaluate(async () => {
      const api = (window as unknown as { api: { setKeyTest: (key: string) => Promise<boolean> } }).api
      await api.setKeyTest('test-api-key-12345')
    })

    // Reload to get fresh state with API key set
    await window.reload()
    await window.waitForLoadState('domcontentloaded')
    await window.waitForTimeout(500)

    // Upload PDF via test-only IPC
    await window.evaluate(async (pdfPath) => {
      const api = (window as unknown as { api: { uploadPdfFile: (path: string) => Promise<unknown> } }).api
      return await api.uploadPdfFile(pdfPath)
    }, SAMPLE_PDF)

    // Verify chapters were created in database
    await expect(async () => {
      const chapters = await window.evaluate(async () => {
        const api = (window as unknown as { api: { listChapters: (pdfId: number) => Promise<unknown[]> } }).api
        return await api.listChapters(1)
      })
      expect((chapters as unknown[]).length).toBeGreaterThan(0)
    }).toPass({ timeout: 30000 })

    // Verify PDF appears in sidebar after reload
    await window.reload()
    await window.waitForLoadState('domcontentloaded')
    await expect(window.locator('text=sample.pdf')).toBeVisible({ timeout: 10000 })
  })

  test('chapter status indicators are visible', async () => {
    app = await electron.launch({
      args: ['.'],
      env: {
        ...process.env,
        NODE_ENV: 'test'
      }
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

    // Upload PDF - this auto-expands the PDF and shows chapters
    await window.evaluate(async (pdfPath) => {
      const api = (window as unknown as { api: { uploadPdfFile: (path: string) => Promise<unknown> } }).api
      return await api.uploadPdfFile(pdfPath)
    }, SAMPLE_PDF)

    // Wait for chapters to appear in database
    await expect(async () => {
      const chapters = await window.evaluate(async () => {
        const api = (window as unknown as { api: { listChapters: (pdfId: number) => Promise<unknown[]> } }).api
        return await api.listChapters(1)
      })
      expect((chapters as unknown[]).length).toBeGreaterThan(0)
    }).toPass({ timeout: 30000 })

    // Reload to see PDF in list
    await window.reload()
    await window.waitForLoadState('domcontentloaded')
    await window.waitForTimeout(500)

    // PDF should be visible
    await expect(window.locator('text=sample.pdf')).toBeVisible({ timeout: 10000 })

    // Click expand chevron to show chapters
    const pdfRow = window.locator('text=sample.pdf').locator('..')
    const expandBtn = pdfRow.locator('button').first()
    await expandBtn.click()
    await window.waitForTimeout(300)

    // Chapter rows should now be visible
    const chapterRows = window.locator('[data-testid="chapter-row"]')
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

  // Note: Test for chapter-specific chat requires waiting for embeddings to complete,
  // which takes too long for E2E tests. This would need mocking or a pre-processed fixture.

  test('can cancel/delete PDF stuck in processing state', async () => {
    app = await electron.launch({
      args: ['.'],
      env: {
        ...process.env,
        NODE_ENV: 'test'
      }
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

    // Upload PDF
    await window.evaluate(async (pdfPath) => {
      const api = (window as unknown as { api: { uploadPdfFile: (path: string) => Promise<unknown> } }).api
      return await api.uploadPdfFile(pdfPath)
    }, SAMPLE_PDF)

    // Reload to see PDF in list
    await window.reload()
    await window.waitForLoadState('domcontentloaded')
    await expect(window.locator('text=sample.pdf')).toBeVisible({ timeout: 10000 })

    // Close and reopen app (simulates restart with stale processing state)
    await app.close()

    app = await electron.launch({
      args: ['.'],
      env: {
        ...process.env,
        NODE_ENV: 'test'
      }
    })

    const window2 = await app.firstWindow()
    await window2.waitForLoadState('domcontentloaded')
    await window2.waitForTimeout(500)

    // PDF should still be visible
    await expect(window2.locator('text=sample.pdf')).toBeVisible({ timeout: 10000 })

    // Try to cancel/delete the PDF (hover to show button, then click)
    const pdfRow = window2.locator('text=sample.pdf').locator('..')
    await pdfRow.hover()

    // Click the cancel/delete button (X or trash icon)
    const deleteButton = pdfRow.locator('button').filter({ has: window2.locator('svg') }).last()
    await deleteButton.click()

    // Confirm deletion in dialog
    const confirmButton = window2.locator('button:text("Cancel & Delete"), button:text("Delete")')
    await confirmButton.click()

    // PDF should be removed
    await expect(window2.locator('text=sample.pdf')).not.toBeVisible({ timeout: 5000 })
  })
})
