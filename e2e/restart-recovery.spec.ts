import { test, expect, ElectronApplication } from '@playwright/test'
import {
  cleanupDb,
  launchApp,
  setupApiKey,
  uploadPdf,
  waitForChapters,
  simulateStuckProcessing,
  getProcessingStatuses,
  SAMPLE_PDF
} from './fixtures'

test.describe('Restart Recovery', () => {
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

  test('resets stuck processing states on app restart', async () => {
    // Launch app and upload PDF
    app = await launchApp()
    let window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    await setupApiKey(window)

    // Upload PDF and wait for chapters
    const { pdfId } = await uploadPdf(window, SAMPLE_PDF)
    await waitForChapters(window, pdfId)

    // Simulate stuck processing state (as if app crashed mid-processing)
    await simulateStuckProcessing(window, pdfId)

    // Verify statuses are now "processing"/"running"
    const statusesBefore = await getProcessingStatuses(window, pdfId)
    expect(statusesBefore.pdf?.status).toBe('processing')
    expect(statusesBefore.chapters.every((c) => c.status === 'processing')).toBe(true)
    expect(statusesBefore.chapters.every((c) => c.summary_status === 'processing')).toBe(true)
    expect(statusesBefore.chapters.every((c) => c.concepts_status === 'processing')).toBe(true)
    expect(statusesBefore.jobs.every((j) => j.status === 'running')).toBe(true)

    // Close app (simulating crash/restart)
    await app.close()

    // Relaunch app
    app = await launchApp()
    window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    await setupApiKey(window)

    // Verify statuses are no longer stuck in "processing"/"running"
    // (Job queue starts immediately, so statuses may have progressed or failed)
    const statusesAfter = await getProcessingStatuses(window, pdfId)

    // PDF should not be stuck in processing
    expect(statusesAfter.pdf?.status).not.toBe('processing')

    // Chapters should not be stuck in processing (could be pending, done, or error)
    for (const chapter of statusesAfter.chapters) {
      expect(chapter.status).not.toBe('processing')
      expect(chapter.summary_status).not.toBe('processing')
      expect(chapter.concepts_status).not.toBe('processing')
    }

    // Jobs should not be stuck in running
    for (const job of statusesAfter.jobs) {
      expect(job.status).not.toBe('running')
    }
  })
})
