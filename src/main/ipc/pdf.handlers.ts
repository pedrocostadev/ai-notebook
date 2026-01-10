import { ipcMain, dialog, shell } from 'electron'
import { spawn } from 'child_process'
import { getAllPdfs, getPdf, deletePdf as dbDeletePdf, getChaptersByPdfId, updatePdfStatus, updateChapterStatus, getChapter } from '../services/database'
import { processPdf, deletePdfFile } from '../services/pdf-processor'
import { startJobQueue, cancelProcessing } from '../services/job-queue'
import { parseOutlineFromPdf } from '../services/toc-parser'

export function registerPdfHandlers(): void {
  // Test-only: Direct file upload without dialog
  ipcMain.handle('pdf:upload-file', async (_, filePath: string) => {
    if (process.env.NODE_ENV !== 'test') {
      return { error: 'Not allowed outside test environment' }
    }
    try {
      const processResult = await processPdf(filePath)
      startJobQueue()
      return processResult
    } catch (err) {
      if (err instanceof Error) {
        if (err.message === 'PASSWORD_REQUIRED') {
          return { error: 'PASSWORD_REQUIRED' }
        }
        if (err.message === 'SCANNED_PDF') {
          return { error: 'SCANNED_PDF' }
        }
        return { error: err.message }
      }
      return { error: 'Unknown error' }
    }
  })

  ipcMain.handle('pdf:upload', async (event) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    const filePath = result.filePaths[0]

    try {
      const processResult = await processPdf(filePath)
      startJobQueue()
      return processResult
    } catch (err) {
      if (err instanceof Error) {
        if (err.message === 'PASSWORD_REQUIRED') {
          return { error: 'PASSWORD_REQUIRED' }
        }
        if (err.message === 'SCANNED_PDF') {
          return { error: 'SCANNED_PDF' }
        }
        return { error: err.message }
      }
      return { error: 'Unknown error' }
    }
  })

  ipcMain.handle('pdf:upload-with-password', async (_, filePath: string, password: string) => {
    try {
      const processResult = await processPdf(filePath, password)
      startJobQueue()
      return processResult
    } catch (err) {
      if (err instanceof Error) {
        return { error: err.message }
      }
      return { error: 'Unknown error' }
    }
  })

  ipcMain.handle('pdf:list', () => {
    return getAllPdfs()
  })

  ipcMain.handle('pdf:get', (_, id: number) => {
    return getPdf(id)
  })

  ipcMain.handle('pdf:delete', (_, id: number) => {
    deletePdfFile(id)
    dbDeletePdf(id)
    return true
  })

  ipcMain.handle('pdf:cancel', (_, id: number) => {
    return cancelProcessing(id)
  })

  ipcMain.handle('chapter:list', (_, pdfId: number, excludeAuxiliary: boolean = true) => {
    return getChaptersByPdfId(pdfId, excludeAuxiliary)
  })

  // Test-only: Set PDF and chapter status directly (bypasses embedding)
  ipcMain.handle('pdf:set-status-test', (_, pdfId: number, status: string) => {
    if (process.env.NODE_ENV !== 'test') {
      return { error: 'Not allowed outside test environment' }
    }
    updatePdfStatus(pdfId, status)
    // Also update all chapters to same status
    const chapters = getChaptersByPdfId(pdfId)
    for (const chapter of chapters) {
      updateChapterStatus(chapter.id, status as 'pending' | 'processing' | 'done' | 'error')
    }
    return { success: true }
  })

  // Open PDF in system default viewer
  ipcMain.handle('pdf:open', async (_, pdfId: number) => {
    const pdf = getPdf(pdfId)
    if (!pdf) {
      return { error: 'PDF not found' }
    }
    try {
      await shell.openPath(pdf.filepath)
      return { success: true }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to open PDF' }
    }
  })

  // Open PDF at specific chapter (page) in system default viewer
  ipcMain.handle('pdf:open-chapter', async (_, chapterId: number) => {
    const chapter = getChapter(chapterId)
    if (!chapter) {
      return { error: 'Chapter not found' }
    }
    const pdf = getPdf(chapter.pdf_id)
    if (!pdf) {
      return { error: 'PDF not found' }
    }

    // Use chapter's start_page directly (calculated from TOC during processing)
    const startPage = chapter.start_page ?? 1

    try {
      // On macOS, use skim or Preview with page parameter
      if (process.platform === 'darwin') {
        // Try to open with Preview at specific page using AppleScript
        const script = `
          tell application "Preview"
            activate
            open POSIX file "${pdf.filepath}"
            delay 0.5
            tell application "System Events"
              keystroke "g" using {option down, command down}
              delay 0.2
              keystroke "${startPage}"
              delay 0.1
              keystroke return
            end tell
          end tell
        `
        spawn('osascript', ['-e', script], { detached: true, stdio: 'ignore' }).unref()
        return { success: true, page: startPage }
      }

      // Fallback: just open the PDF
      await shell.openPath(pdf.filepath)
      return { success: true, page: startPage }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to open PDF' }
    }
  })

  // Test-only: Get chapter with full details including start_page
  ipcMain.handle('chapter:get-test', (_, chapterId: number) => {
    if (process.env.NODE_ENV !== 'test') {
      return { error: 'Not allowed outside test environment' }
    }
    const chapter = getChapter(chapterId)
    if (!chapter) {
      return { error: 'Chapter not found' }
    }
    return chapter
  })

  // Open PDF at specific page (for citation clicks)
  ipcMain.handle('pdf:open-at-page', async (_, pdfId: number, pageNumber: number) => {
    const pdf = getPdf(pdfId)
    if (!pdf) {
      return { error: 'PDF not found' }
    }

    try {
      // On macOS, use Preview with page parameter via AppleScript
      if (process.platform === 'darwin') {
        const script = `
          tell application "Preview"
            activate
            open POSIX file "${pdf.filepath}"
            delay 0.5
            tell application "System Events"
              keystroke "g" using {option down, command down}
              delay 0.2
              keystroke "${pageNumber}"
              delay 0.1
              keystroke return
            end tell
          end tell
        `
        spawn('osascript', ['-e', script], { detached: true, stdio: 'ignore' }).unref()
        return { success: true, page: pageNumber }
      }

      // Fallback: just open the PDF
      await shell.openPath(pdf.filepath)
      return { success: true, page: pageNumber }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to open PDF' }
    }
  })

  // Test-only: Get PDF outline directly from file (for comparing with stored start_page)
  ipcMain.handle('pdf:get-outline-test', async (_, pdfId: number) => {
    if (process.env.NODE_ENV !== 'test') {
      return { error: 'Not allowed outside test environment' }
    }
    const pdf = getPdf(pdfId)
    if (!pdf) {
      return { error: 'PDF not found' }
    }

    const chapters: { title: string; pageNumber: number; pageLabel?: number }[] = []
    const result = await parseOutlineFromPdf(pdf.filepath, (chapter) => {
      chapters.push({ title: chapter.title, pageNumber: chapter.pageNumber, pageLabel: chapter.pageLabel })
    })

    return {
      hasToc: result.hasToc,
      chapters
    }
  })
}
