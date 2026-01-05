import { readFileSync, copyFileSync, existsSync, mkdirSync, statSync, unlinkSync } from 'fs'
import { createHash } from 'crypto'
import { join, basename } from 'path'
import { app, BrowserWindow } from 'electron'
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf'
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import { parseTocStreaming, TocChapter } from './toc-parser'
import { estimateTokens } from '../lib/token-counter'
import {
  insertPdf,
  getPdfByHash,
  updatePdfStatus,
  insertChunk,
  insertJob,
  insertChapter,
  getChapter,
  updateChapterStatus,
  updateChapterEndIdx,
  getPdf,
  getChunksByChapterId
} from './database'
import { notifyChapterProgress } from './job-queue'

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB

function notifyChapterAdded(pdfId: number, chapter: {
  id: number
  title: string
  chapter_index: number
  status: string
}): void {
  const windows = BrowserWindow.getAllWindows()
  for (const window of windows) {
    window.webContents.send('chapter:added', { pdfId, chapter })
  }
}
const MIN_CHARS_PER_PAGE = 50
const CHUNK_SIZE = 1500
const CHUNK_OVERLAP = 200

export interface ProcessResult {
  pdfId: number
  duplicate: boolean
  existingPdfId?: number
}

interface PageBoundary {
  pageNumber: number
  startIdx: number
  endIdx: number
}

function computePageBoundaries(pages: string[]): PageBoundary[] {
  const boundaries: PageBoundary[] = []
  let currentIdx = 0

  for (let i = 0; i < pages.length; i++) {
    const pageContent = pages[i]
    boundaries.push({
      pageNumber: i + 1,
      startIdx: currentIdx,
      endIdx: currentIdx + pageContent.length
    })
    currentIdx += pageContent.length + 2 // +2 for '\n\n' separator
  }

  return boundaries
}

export async function processPdf(
  sourcePath: string,
  password?: string
): Promise<ProcessResult> {
  const stats = statSync(sourcePath)
  if (stats.size > MAX_FILE_SIZE) {
    throw new Error('File exceeds 50MB limit')
  }

  const fileBuffer = readFileSync(sourcePath)
  const fileHash = createHash('sha256').update(fileBuffer).digest('hex')

  // Check for duplicate
  const existing = getPdfByHash(fileHash)
  if (existing) {
    return { pdfId: existing.id, duplicate: true, existingPdfId: existing.id }
  }

  const filename = basename(sourcePath)
  const pdfsDir = join(app.getPath('userData'), 'pdfs')
  if (!existsSync(pdfsDir)) {
    mkdirSync(pdfsDir, { recursive: true })
  }
  const destPath = join(pdfsDir, `${fileHash}_${filename}`)
  copyFileSync(sourcePath, destPath)

  const pdfId = insertPdf(filename, destPath, fileHash, stats.size)

  try {
    updatePdfStatus(pdfId, 'processing')

    const loader = new PDFLoader(destPath, { parsedItemSeparator: '\n' })
    let docs
    try {
      docs = await loader.load()
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('password')) {
        if (!password) {
          updatePdfStatus(pdfId, 'error', undefined, 'Password required')
          throw new Error('PASSWORD_REQUIRED')
        }
        throw new Error('Password-protected PDFs not yet supported')
      }
      throw err
    }

    // Check for scanned PDF
    const totalChars = docs.reduce((sum, doc) => sum + doc.pageContent.length, 0)
    const avgCharsPerPage = totalChars / docs.length
    if (avgCharsPerPage < MIN_CHARS_PER_PAGE) {
      updatePdfStatus(
        pdfId,
        'error',
        docs.length,
        'This PDF appears to be scanned. Only text-based PDFs are supported.'
      )
      throw new Error('SCANNED_PDF')
    }

    // Keep pages separate for TOC parsing
    const pages = docs.map((d) => d.pageContent)
    const fullText = pages.join('\n\n')
    const boundaries = computePageBoundaries(pages)

    // Stream TOC chapters from AI
    const streamedChapters: { id: number; tocChapter: TocChapter; index: number; startIdx: number }[] = []

    const tocResult = await parseTocStreaming(pages, (tocChapter, index) => {
      // Try to find chapter title in fullText for accurate positioning
      // Search for the title (case-insensitive, allowing for some flexibility)
      const titlePattern = tocChapter.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // Escape regex chars
      const titleRegex = new RegExp(titlePattern, 'i')
      const titleMatch = fullText.match(titleRegex)

      let startIdx: number
      if (titleMatch && titleMatch.index !== undefined) {
        // Found the title in text - use that position
        startIdx = titleMatch.index
        console.log(`[processPdf] Found "${tocChapter.title}" at position ${startIdx} (title search)`)
      } else {
        // Fall back to page-based boundary
        const pageIdx = Math.min(Math.max(tocChapter.pageNumber - 1, 0), boundaries.length - 1)
        startIdx = boundaries[pageIdx]?.startIdx ?? 0
        console.log(`[processPdf] "${tocChapter.title}" not found in text, using page ${tocChapter.pageNumber} -> position ${startIdx}`)
      }

      // Use fullText.length as temporary end (will fix after all chapters are streamed)
      const endIdx = fullText.length

      // Insert chapter immediately
      const chapterId = insertChapter(pdfId, tocChapter.title, index, startIdx, endIdx)
      streamedChapters.push({ id: chapterId, tocChapter, index, startIdx })

      // Notify frontend
      notifyChapterAdded(pdfId, {
        id: chapterId,
        title: tocChapter.title,
        chapter_index: index,
        status: 'pending'
      })
    })

    // After all chapters are streamed, fix end_idx values based on document order (page numbers)
    // Sort by startIdx (document position) to determine correct boundaries
    if (streamedChapters.length > 1) {
      const sortedByPosition = [...streamedChapters].sort((a, b) => a.startIdx - b.startIdx)
      console.log('[processPdf] Chapters sorted by document position:')
      for (const ch of sortedByPosition) {
        console.log(`  - "${ch.tocChapter.title}" (id=${ch.id}, page=${ch.tocChapter.pageNumber}, startIdx=${ch.startIdx})`)
      }
      for (let i = 0; i < sortedByPosition.length - 1; i++) {
        const current = sortedByPosition[i]
        const next = sortedByPosition[i + 1]
        console.log(`[processPdf] Setting end_idx for "${current.tocChapter.title}" (id=${current.id}) to ${next.startIdx}`)
        updateChapterEndIdx(current.id, next.startIdx)
      }
    }

    // Queue jobs for all chapters
    for (const chapter of streamedChapters) {
      // Queue embed job (priority 1)
      insertJob(pdfId, chapter.id, 'embed')
      // Queue summary job (priority 2 - runs after embed)
      insertJob(pdfId, chapter.id, 'summary')
      // Queue concepts job (priority 3 - runs after summary)
      insertJob(pdfId, chapter.id, 'concepts')
    }

    // If no chapters were streamed (no TOC), create single "Full Document" chapter
    if (streamedChapters.length === 0) {
      const chapterId = insertChapter(pdfId, 'Full Document', 0, 0, fullText.length)
      notifyChapterAdded(pdfId, {
        id: chapterId,
        title: 'Full Document',
        chapter_index: 0,
        status: 'pending'
      })
      insertJob(pdfId, chapterId, 'embed')
      insertJob(pdfId, chapterId, 'summary')
      insertJob(pdfId, chapterId, 'concepts')
    }

    // Queue metadata job (runs after embed/summary jobs)
    insertJob(pdfId, null, 'metadata')
    // Queue consolidate job (runs last - merges chapter concepts)
    insertJob(pdfId, null, 'consolidate')

    updatePdfStatus(pdfId, 'processing', docs.length)

    return { pdfId, duplicate: false }
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === 'PASSWORD_REQUIRED' || err.message === 'SCANNED_PDF') {
        throw err
      }
    }
    updatePdfStatus(pdfId, 'error', undefined, String(err))
    throw err
  }
}

export async function processChapter(
  pdfId: number,
  chapterId: number,
  fullText: string,
  pageCount: number
): Promise<void> {
  const chapter = getChapter(chapterId)
  if (!chapter) throw new Error('Chapter not found')

  console.log(`[processChapter] Chapter "${chapter.title}" (id=${chapterId}): start_idx=${chapter.start_idx}, end_idx=${chapter.end_idx}, fullText.length=${fullText.length}`)

  // Skip chunking if chunks already exist (retry scenario)
  const existingChunks = getChunksByChapterId(chapterId)
  if (existingChunks.length > 0) return

  updateChapterStatus(chapterId, 'processing')

  const chapterText = fullText.substring(chapter.start_idx, chapter.end_idx)
  console.log(`[processChapter] Extracted text preview for "${chapter.title}": ${chapterText.substring(0, 150)}...`)

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: CHUNK_SIZE,
    chunkOverlap: CHUNK_OVERLAP
  })
  const chunks = await splitter.splitText(chapterText)
  const totalChunks = chunks.length

  // Notify initial progress
  notifyChapterProgress({
    pdfId,
    chapterId,
    progress: 0,
    stage: 'chunking',
    chunksTotal: totalChunks,
    chunksProcessed: 0
  })

  // Insert chunks for this chapter
  for (let i = 0; i < chunks.length; i++) {
    const content = chunks[i]
    const tokenCount = estimateTokens(content)

    // Estimate page range based on position in full text
    const chunkStartInFull = chapter.start_idx + chapterText.indexOf(content)
    const pageStart = Math.floor((chunkStartInFull / fullText.length) * pageCount) + 1
    const pageEnd = Math.min(
      Math.floor(((chunkStartInFull + content.length) / fullText.length) * pageCount) + 1,
      pageCount
    )

    insertChunk(pdfId, chapterId, i, content, chapter.title, pageStart, pageEnd, tokenCount)

    const processedCount = i + 1
    const progress = Math.round((processedCount / chunks.length) * 100)
    notifyChapterProgress({
      pdfId,
      chapterId,
      progress,
      stage: 'chunking',
      chunksTotal: totalChunks,
      chunksProcessed: processedCount
    })
  }
}

export function deletePdfFile(pdfId: number): void {
  const pdf = getPdf(pdfId)
  if (pdf && existsSync(pdf.filepath)) {
    unlinkSync(pdf.filepath)
  }
}
