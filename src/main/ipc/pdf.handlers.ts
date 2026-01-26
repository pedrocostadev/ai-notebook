import { ipcMain, dialog, shell } from 'electron'
import { spawn, execSync } from 'child_process'
import { getAllPdfs, getPdf, deletePdf as dbDeletePdf, getChaptersByPdfId, updatePdfStatus, updateChapterStatus, getChapter, markAllJobsDoneForPdf, getChunksByChapterId } from '../services/database'
import { processPdf, deletePdfFile } from '../services/pdf-processor'
import { startJobQueue, cancelProcessing, requestCancelForPdf } from '../services/job-queue'
import { parseOutlineFromPdf } from '../services/toc-parser'

type PdfUploadResult = { id: number } | { error: string } | null

async function handlePdfUpload(filePath: string, password?: string): Promise<PdfUploadResult> {
  try {
    const processResult = await processPdf(filePath, password)
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
}

function openPdfAtPageMacOS(filepath: string, pageNumber: number): void {
  const script = `
    tell application "Preview"
      activate
      open POSIX file "${filepath}"
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
}

function openPdfAtPageWindows(filepath: string, pageNumber: number): void {
  // Convert Windows path to file:// URL format and add page fragment
  // Edge supports #page=N for navigating to specific pages
  const fileUrl = `file:///${filepath.replace(/\\/g, '/')}#page=${pageNumber}`
  spawn('msedge', [fileUrl], { detached: true, stdio: 'ignore', shell: true }).unref()
}

function commandExists(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function openPdfAtPageLinux(filepath: string, pageNumber: number): boolean {
  // Try Evince first (GNOME - most common on Ubuntu/Debian)
  if (commandExists('evince')) {
    spawn('evince', ['--page-label', String(pageNumber), filepath], {
      detached: true,
      stdio: 'ignore'
    }).unref()
    return true
  }

  // Try Okular (KDE)
  if (commandExists('okular')) {
    spawn('okular', ['-p', String(pageNumber), filepath], {
      detached: true,
      stdio: 'ignore'
    }).unref()
    return true
  }

  // No supported viewer found - return false to fall back to shell.openPath
  return false
}

export function registerPdfHandlers(): void {
  // Test-only: Direct file upload without dialog
  ipcMain.handle('pdf:upload-file', async (_, filePath: string) => {
    if (process.env.NODE_ENV !== 'test') {
      return { error: 'Not allowed outside test environment' }
    }
    return handlePdfUpload(filePath)
  })

  ipcMain.handle('pdf:upload', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    return handlePdfUpload(result.filePaths[0])
  })

  ipcMain.handle('pdf:upload-with-password', async (_, filePath: string, password: string) => {
    return handlePdfUpload(filePath, password)
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
    // Cancel any ongoing processing for this PDF (without deleting)
    requestCancelForPdf(pdfId)
    // Mark all pending/running jobs as done to prevent job queue from overwriting status
    markAllJobsDoneForPdf(pdfId)
    // Update PDF status
    updatePdfStatus(pdfId, status)
    // Update all chapters to same status
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
      if (process.platform === 'darwin') {
        openPdfAtPageMacOS(pdf.filepath, startPage)
        return { success: true, page: startPage }
      }
      if (process.platform === 'win32') {
        openPdfAtPageWindows(pdf.filepath, startPage)
        return { success: true, page: startPage }
      }
      if (process.platform === 'linux' && openPdfAtPageLinux(pdf.filepath, startPage)) {
        return { success: true, page: startPage }
      }
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
      if (process.platform === 'darwin') {
        openPdfAtPageMacOS(pdf.filepath, pageNumber)
        return { success: true, page: pageNumber }
      }
      if (process.platform === 'win32') {
        openPdfAtPageWindows(pdf.filepath, pageNumber)
        return { success: true, page: pageNumber }
      }
      if (process.platform === 'linux' && openPdfAtPageLinux(pdf.filepath, pageNumber)) {
        return { success: true, page: pageNumber }
      }
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

  // Test-only: Get chunks for a chapter (for verifying page numbers)
  ipcMain.handle('chunks:get-by-chapter-test', (_, chapterId: number) => {
    if (process.env.NODE_ENV !== 'test') {
      return { error: 'Not allowed outside test environment' }
    }
    const chunks = getChunksByChapterId(chapterId)
    return chunks.map((c) => ({
      id: c.id,
      page_start: c.page_start,
      page_end: c.page_end,
      content: c.content.substring(0, 200) // Truncate for test performance
    }))
  })
}
