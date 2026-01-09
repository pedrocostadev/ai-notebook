import { ipcMain, dialog } from 'electron'
import { getAllPdfs, getPdf, deletePdf as dbDeletePdf, getChaptersByPdfId, updatePdfStatus, updateChapterStatus } from '../services/database'
import { processPdf, deletePdfFile } from '../services/pdf-processor'
import { startJobQueue, cancelProcessing } from '../services/job-queue'

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

  ipcMain.handle('chapter:list', (_, pdfId: number) => {
    return getChaptersByPdfId(pdfId)
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
}
