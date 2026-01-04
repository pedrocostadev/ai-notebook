import { ipcMain, BrowserWindow } from 'electron'
import { chat, getChatHistory } from '../services/rag'
import { getPdf, getChapter, getChapterSummary, getPdfMetadata } from '../services/database'
import type { PdfMetadata } from '../services/content-generator'

export function registerChatHandlers(): void {
  ipcMain.handle('chat:send', async (event, pdfId: number, chapterId: number | null, message: string) => {
    const pdf = getPdf(pdfId)
    if (!pdf) {
      throw new Error('PDF not found')
    }

    // For full PDF chat, check PDF status; for chapter chat, check chapter status
    if (chapterId === null) {
      if (pdf.status !== 'done') {
        throw new Error('PDF is still processing')
      }
    } else {
      const chapter = getChapter(chapterId)
      if (!chapter) {
        throw new Error('Chapter not found')
      }
      if (chapter.status !== 'done') {
        throw new Error('Chapter is still processing')
      }
    }

    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) {
      throw new Error('Window not found')
    }

    await chat(pdfId, chapterId, message, window)
    return true
  })

  ipcMain.handle('chat:history', (_, pdfId: number, chapterId: number | null) => {
    return getChatHistory(pdfId, chapterId)
  })

  // Slash command handlers
  ipcMain.handle('slash:get-summary', (_, chapterId: number): { summary: string } | { pending: true } | { error: string } => {
    const chapter = getChapter(chapterId)
    console.log('[slash:get-summary] Requested chapterId:', chapterId, 'Chapter title:', chapter?.title)
    if (!chapter) {
      return { error: 'Chapter not found' }
    }

    const summary = getChapterSummary(chapterId)
    console.log('[slash:get-summary] Summary preview:', summary?.substring(0, 100))
    if (!summary) {
      return { pending: true }
    }

    return { summary }
  })

  ipcMain.handle('slash:get-metadata', (_, pdfId: number): { metadata: PdfMetadata } | { pending: true } | { error: string } => {
    const pdf = getPdf(pdfId)
    if (!pdf) {
      return { error: 'PDF not found' }
    }

    const metadata = getPdfMetadata(pdfId) as PdfMetadata | null
    if (!metadata) {
      return { pending: true }
    }

    return { metadata }
  })
}
