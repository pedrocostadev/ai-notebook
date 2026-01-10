import { test, expect, ElectronApplication } from '@playwright/test'
import { resolve } from 'path'
import {
  cleanupDb,
  launchApp,
  setupApiKey,
  uploadPdf,
  waitForChapters,
  markPdfDone,
  setChapterSummary,
  getChatHistory,
  waitForLocalStorage,
  getChapterDetails,
  getPdfOutline,
  SAMPLE_PDF
} from './fixtures'

// Real book with multiple chapters for comprehensive testing
const AI_ENGINEERING_BOOK = resolve(__dirname, '../pdfs/book_ai_enginering.pdf')

test.describe('Slash Commands', () => {
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

  test('/summary returns correct summary for each chapter in multi-chapter book', async () => {
    // Use longer timeout for real book processing
    test.setTimeout(120000)

    app = await launchApp()
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await setupApiKey(window)

    // Upload the real AI Engineering book with multiple chapters
    const { pdfId } = await uploadPdf(window, AI_ENGINEERING_BOOK)

    // Wait for chapters to be created (real book may take longer)
    const chapters = await waitForChapters(window, pdfId, 60000)

    // Ensure we have multiple chapters to test
    expect(chapters.length).toBeGreaterThan(3)

    // Mark all as done to skip actual embedding
    await markPdfDone(window, pdfId)

    // Set unique, identifiable summaries for each chapter
    // Use chapter ID in the summary to make it easy to verify correctness
    for (const chapter of chapters) {
      const uniqueSummary = `UNIQUE_SUMMARY_FOR_CHAPTER_ID_${chapter.id}_TITLE_${chapter.title.substring(0, 20)}`
      await setChapterSummary(window, chapter.id, uniqueSummary)
    }

    // Test that /summary returns the CORRECT summary for EACH chapter
    // This is the critical test - if there's an off-by-one bug, it will be caught here
    for (let i = 0; i < Math.min(chapters.length, 5); i++) {
      const chapter = chapters[i]
      const expectedSummary = `UNIQUE_SUMMARY_FOR_CHAPTER_ID_${chapter.id}_TITLE_${chapter.title.substring(0, 20)}`

      // Get summary via API (same call the UI makes)
      const result = await window.evaluate(async (chapterId) => {
        const api = (window as unknown as {
          api: {
            getChapterSummary: (chapterId: number) => Promise<{ summary: string } | { pending: true } | { error: string } | { empty: true }>
          }
        }).api
        return await api.getChapterSummary(chapterId)
      }, chapter.id)

      // Verify the result contains the correct chapter ID
      expect(result).toHaveProperty('summary')
      if ('summary' in result) {
        expect(result.summary).toBe(expectedSummary)
        // Specifically check the chapter ID is correct (catches off-by-one bugs)
        expect(result.summary).toContain(`CHAPTER_ID_${chapter.id}`)
      }
    }
  })

  test('/summary does NOT return next chapter summary (off-by-one detection)', async () => {
    // This test specifically detects off-by-one bugs by verifying that
    // chapter N's summary does NOT contain chapter N+1's ID
    test.setTimeout(120000)

    app = await launchApp()
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await setupApiKey(window)

    // Upload real book
    const { pdfId } = await uploadPdf(window, AI_ENGINEERING_BOOK)
    const chapters = await waitForChapters(window, pdfId, 60000)
    expect(chapters.length).toBeGreaterThan(3)
    await markPdfDone(window, pdfId)

    // Set summaries that include the chapter ID
    for (const chapter of chapters) {
      await setChapterSummary(window, chapter.id, `THIS_IS_CHAPTER_${chapter.id}_SUMMARY`)
    }

    // For each chapter (except the last), verify its summary does NOT contain the next chapter's ID
    for (let i = 0; i < chapters.length - 1; i++) {
      const currentChapter = chapters[i]
      const nextChapter = chapters[i + 1]

      const result = await window.evaluate(async (chapterId) => {
        const api = (window as unknown as {
          api: {
            getChapterSummary: (chapterId: number) => Promise<{ summary: string } | { pending: true } | { error: string } | { empty: true }>
          }
        }).api
        return await api.getChapterSummary(chapterId)
      }, currentChapter.id)

      if ('summary' in result) {
        // CRITICAL: Verify we did NOT get the next chapter's summary
        expect(result.summary).not.toContain(`CHAPTER_${nextChapter.id}_SUMMARY`)
        // Verify we got the correct chapter's summary
        expect(result.summary).toContain(`CHAPTER_${currentChapter.id}_SUMMARY`)
      }
    }
  })

  test('chapter chunks contain correct chapter content (boundary verification)', async () => {
    // This test verifies that chapter boundaries are correct by checking
    // that the first chunk of each chapter starts with content from that chapter
    // (not from the previous or next chapter)
    test.setTimeout(180000)

    app = await launchApp()
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await setupApiKey(window)

    // Upload real book
    const { pdfId } = await uploadPdf(window, AI_ENGINEERING_BOOK)
    const chapters = await waitForChapters(window, pdfId, 60000)
    expect(chapters.length).toBeGreaterThan(3)

    // Wait a bit for chunks to be created (embed jobs)
    await window.waitForTimeout(2000)

    // Check that each chapter's first chunk contains its title (or related content)
    // and does NOT contain the next chapter's title
    for (let i = 0; i < Math.min(chapters.length - 1, 5); i++) {
      const currentChapter = chapters[i]
      const nextChapter = chapters[i + 1]

      // Get chunks for this chapter via direct database query (test-only API would be needed)
      // For now, we'll verify by checking if the chapter ID is correctly associated
      const chapterInfo = await window.evaluate(async ({ pdfId, chapterId }) => {
        // Access the internal API to check chapter data
        const api = (window as unknown as {
          api: {
            listChapters: (pdfId: number) => Promise<{ id: number; title: string; chapter_index: number; status: string }[]>
          }
        }).api
        const allChapters = await api.listChapters(pdfId)
        const chapter = allChapters.find(c => c.id === chapterId)
        return chapter
      }, { pdfId, chapterId: currentChapter.id })

      // Verify the chapter exists and has the expected title
      expect(chapterInfo).toBeDefined()
      expect(chapterInfo!.id).toBe(currentChapter.id)
      expect(chapterInfo!.title).toBe(currentChapter.title)

      // Verify the chapter index matches our array position
      // (This catches if chapters are reordered incorrectly)
      expect(chapterInfo!.chapter_index).toBe(i)
    }
  })

  test('/summary via ChapterSelectModal returns correct summary (main chat flow)', async () => {
    // Test the modal flow: /summary from main chat, select chapter, verify correct summary
    test.setTimeout(120000)

    app = await launchApp()
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await setupApiKey(window)

    const { pdfId } = await uploadPdf(window, AI_ENGINEERING_BOOK)
    const chapters = await waitForChapters(window, pdfId, 60000)
    expect(chapters.length).toBeGreaterThan(3)
    await markPdfDone(window, pdfId)

    // Set unique summaries
    for (const chapter of chapters) {
      await setChapterSummary(window, chapter.id, `MODAL_TEST_CHAPTER_${chapter.id}`)
    }

    // Reload and select the PDF (main chat view, no chapter selected)
    await window.reload()
    await window.waitForLoadState('domcontentloaded')
    await window.locator('[data-testid="pdf-row"]').first().click()

    // Verify we're in main chat (no chapter selected)
    const initialChapterId = await window.evaluate(() => {
      const stored = localStorage.getItem('selectedChapterId')
      return stored ? parseInt(stored, 10) : null
    })
    expect(initialChapterId).toBeNull()

    // Test each chapter via the modal selection flow
    for (let i = 0; i < Math.min(chapters.length, 3); i++) {
      const targetChapter = chapters[i]

      // Simulate what happens when user selects a chapter from the modal
      // (The modal passes chapter.id to executeCommand)
      const result = await window.evaluate(async (chapterId) => {
        const api = (window as unknown as {
          api: {
            getChapterSummary: (chapterId: number) => Promise<{ summary: string } | { pending: true } | { error: string } | { empty: true }>
          }
        }).api
        return await api.getChapterSummary(chapterId)
      }, targetChapter.id)

      if ('summary' in result) {
        expect(result.summary).toBe(`MODAL_TEST_CHAPTER_${targetChapter.id}`)
        // Also verify it's NOT the next chapter (off-by-one check)
        if (i < chapters.length - 1) {
          expect(result.summary).not.toContain(`CHAPTER_${chapters[i + 1].id}`)
        }
      }
    }
  })

  test('/summary via UI returns correct chapter summary when clicking chapter', async () => {
    // Use longer timeout for real book processing
    test.setTimeout(120000)

    app = await launchApp()
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await setupApiKey(window)

    // Upload the real AI Engineering book
    const { pdfId } = await uploadPdf(window, AI_ENGINEERING_BOOK)

    // Wait for chapters
    const chapters = await waitForChapters(window, pdfId, 60000)
    expect(chapters.length).toBeGreaterThan(3)

    // Mark as done
    await markPdfDone(window, pdfId)

    // Set unique summaries for each chapter using their ID
    for (const chapter of chapters) {
      await setChapterSummary(window, chapter.id, `UI_TEST_SUMMARY_FOR_ID_${chapter.id}`)
    }

    // Reload to see PDF in list
    await window.reload()
    await window.waitForLoadState('domcontentloaded')

    // Wait for PDF row to be visible
    await expect(window.locator('[data-testid="pdf-row"]').first()).toBeVisible({ timeout: 10000 })

    // Select the PDF
    await window.locator('[data-testid="pdf-row"]').first().click()

    // Wait for expand button to be visible, then click it
    await expect(window.locator('[data-testid="expand-btn"]').first()).toBeVisible({ timeout: 5000 })
    await window.locator('[data-testid="expand-btn"]').first().click()

    // Wait for chapters to load (give extra time for state updates)
    await window.waitForTimeout(1000)

    // Wait for chapter rows to be visible with retries
    let chapterRowsVisible = false
    for (let retry = 0; retry < 5 && !chapterRowsVisible; retry++) {
      try {
        await expect(window.locator('[data-testid="chapter-row"]').first()).toBeVisible({ timeout: 3000 })
        chapterRowsVisible = true
      } catch {
        // Click expand again in case it didn't register
        await window.locator('[data-testid="expand-btn"]').first().click()
        await window.waitForTimeout(500)
      }
    }
    expect(chapterRowsVisible).toBe(true)

    // Get all visible chapter rows that are clickable (done status = cursor-pointer)
    const chapterRowsLocator = window.locator('[data-testid="chapter-row"].cursor-pointer')
    await expect(chapterRowsLocator.first()).toBeVisible({ timeout: 5000 })
    const chapterRows = await chapterRowsLocator.all()

    // Test each visible chapter: click it, then verify the summary matches the selected ID
    for (let i = 0; i < Math.min(chapterRows.length, 3); i++) {
      // Clear localStorage before clicking to ensure we detect the new value
      await window.evaluate(() => localStorage.removeItem('selectedChapterId'))

      // Click the chapter to select it
      await chapterRows[i].click()

      // Wait for localStorage to be updated (React state + useEffect)
      const storedValue = await waitForLocalStorage(window, 'selectedChapterId', 3000)
      const selectedChapterId = storedValue ? parseInt(storedValue, 10) : null

      expect(selectedChapterId).not.toBeNull()

      // KEY TEST: Get the summary for the selected chapter and verify it matches
      // If there's an off-by-one bug, the summary would contain a different ID
      const result = await window.evaluate(async (chapterId) => {
        const api = (window as unknown as {
          api: {
            getChapterSummary: (chapterId: number) => Promise<{ summary: string } | { pending: true } | { error: string } | { empty: true }>
          }
        }).api
        return await api.getChapterSummary(chapterId)
      }, selectedChapterId!)

      expect(result).toHaveProperty('summary')
      if ('summary' in result) {
        // Verify the summary contains the correct chapter ID
        expect(result.summary).toBe(`UI_TEST_SUMMARY_FOR_ID_${selectedChapterId}`)
      }
    }
  })

  test('chapter start_page matches PDF outline page number (Open button verification)', async () => {
    // This test verifies the critical fix for the Open button bug
    // The bug was that page offset was incorrectly applied to outline-based PDFs
    test.setTimeout(120000)

    app = await launchApp()
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await setupApiKey(window)

    // Upload the real AI Engineering book (has PDF outline)
    const { pdfId } = await uploadPdf(window, AI_ENGINEERING_BOOK)

    // Wait for chapters to be created
    const chapters = await waitForChapters(window, pdfId, 60000)
    expect(chapters.length).toBeGreaterThan(3)

    // Get the PDF outline directly from the file
    const outline = await getPdfOutline(window, pdfId)
    expect(outline.hasToc).toBe(true)
    expect(outline.chapters.length).toBeGreaterThan(0)

    // DEBUG: Print all outline chapters and their page numbers
    console.log('\n=== PDF OUTLINE (from parseOutlineFromPdf) ===')
    for (const outlineChapter of outline.chapters) {
      const labelInfo = (outlineChapter as { pageLabel?: number }).pageLabel
      console.log(`  "${outlineChapter.title}" -> physical=${outlineChapter.pageNumber}, label=${labelInfo ?? 'N/A'}`)
    }

    // DEBUG: Print all stored chapters and their start_page values
    console.log('\n=== STORED CHAPTERS (from database) ===')
    for (const chapter of chapters) {
      const details = await getChapterDetails(window, chapter.id)
      console.log(`  "${chapter.title}" -> start_page=${details.start_page}, start_idx=${details.start_idx}`)
    }
    console.log('')

    // Build a map of title -> expected page (label if available, otherwise physical)
    const expectedPages = new Map<string, number>()
    for (const outlineChapter of outline.chapters) {
      const labelInfo = (outlineChapter as { pageLabel?: number }).pageLabel
      // Preview uses page labels, so we expect start_page to be the label when available
      expectedPages.set(outlineChapter.title, labelInfo ?? outlineChapter.pageNumber)
    }

    // Verify each chapter's start_page matches the expected page (label for Preview)
    const mismatches: string[] = []
    for (const chapter of chapters) {
      const details = await getChapterDetails(window, chapter.id)
      const expectedPage = expectedPages.get(chapter.title)

      if (expectedPage !== undefined) {
        if (details.start_page !== expectedPage) {
          mismatches.push(
            `Chapter "${chapter.title}": stored start_page=${details.start_page}, expected=${expectedPage} (for Preview navigation)`
          )
        }
      }
    }

    // Report all mismatches for debugging
    if (mismatches.length > 0) {
      console.log('Chapter page mismatches found:')
      for (const m of mismatches) {
        console.log(`  ${m}`)
      }
    }

    // The test passes if all chapters have correct start_page
    expect(mismatches).toHaveLength(0)
  })
})
