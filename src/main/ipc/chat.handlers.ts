import { ipcMain, BrowserWindow } from 'electron'
import { chat, getChatHistory } from '../services/rag'
import { getPdf, getChapter } from '../services/database'

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
}
