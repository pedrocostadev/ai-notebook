import { test, expect, ElectronApplication } from '@playwright/test'
import { cleanupDb, launchApp, setupApiKey, uploadPdf, waitForChapters, SAMPLE_PDF } from './fixtures'

test.describe('PDF Status and Green Checkmark', () => {
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

  test('green checkmark appears only when all chapters are fully processed', async () => {
    app = await launchApp()
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await setupApiKey(window)

    // Upload PDF
    const { pdfId } = await uploadPdf(window, SAMPLE_PDF)

    // Wait for chapters to be created
    const chapters = await waitForChapters(window, pdfId)
    expect(chapters.length).toBeGreaterThan(0)

    // Select the PDF (click on it in the sidebar)
    await window.locator('text=sample').click()
    await window.waitForTimeout(500)

    // Green checkmark should NOT be visible yet (chapters not fully processed)
    const readyToChatIndicator = window.locator('[data-testid="pdf-header"]')
    await expect(readyToChatIndicator).not.toBeVisible()

    // Helper to set chapter status
    const setChapterStatus = async (chapterId: number, status: string, summaryStatus: string | null, conceptsStatus: string | null) => {
      await window.evaluate(
        async ({ chapterId, status, summaryStatus, conceptsStatus }) => {
          const api = (window as unknown as {
            api: { setChapterStatusTest: (chapterId: number, status: string, summaryStatus: string | null, conceptsStatus: string | null) => Promise<{ success: boolean } | { error: string }> }
          }).api
          await api.setChapterStatusTest(chapterId, status, summaryStatus, conceptsStatus)
        },
        { chapterId, status, summaryStatus, conceptsStatus }
      )
    }

    // Manually set all chapter statuses to done BUT leave summary/concepts as pending
    for (const chapter of chapters) {
      await setChapterStatus(chapter.id, 'done', 'pending', 'pending')
    }

    // Force refresh by reloading
    await window.reload()
    await window.waitForLoadState('domcontentloaded')
    await window.locator('text=sample').click()
    await window.waitForTimeout(500)

    // Green checkmark should still NOT be visible (summary/concepts still pending)
    await expect(readyToChatIndicator).not.toBeVisible()

    // Now set all chapter statuses to FULLY done (embeddings + summary + concepts)
    for (const chapter of chapters) {
      await setChapterStatus(chapter.id, 'done', 'done', 'done')
    }

    // Also set PDF status to 'done'
    await window.evaluate(
      async ({ id }) => {
        const api = (window as unknown as {
          api: { setPdfStatusTest: (pdfId: number, status: string) => Promise<{ success: boolean } | { error: string }> }
        }).api
        await api.setPdfStatusTest(id, 'done')
      },
      { id: pdfId }
    )

    // Force refresh
    await window.reload()
    await window.waitForLoadState('domcontentloaded')
    await window.locator('text=sample').click()
    await window.waitForTimeout(500)

    // Green checkmark should NOW be visible
    await expect(readyToChatIndicator).toBeVisible({ timeout: 5000 })
    await expect(window.locator('text=Ready to chat')).toBeVisible()
  })
})
