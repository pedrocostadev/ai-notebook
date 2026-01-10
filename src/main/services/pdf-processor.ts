import { readFileSync, copyFileSync, existsSync, mkdirSync, statSync, unlinkSync } from 'fs'
import { createHash } from 'crypto'
import { join, basename } from 'path'
import { app, BrowserWindow } from 'electron'
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf'
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import { parseOutlineFromPdf, parseTocStreaming, classifyChapterTitles, TocChapter } from './toc-parser'
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
  updateChapterStartIdx,
  updateChapterStartPage,
  updateChapterAuxiliary,
  getPdf,
  getChunksByChapterId,
  updatePdfMetadata
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

export interface PageBoundary {
  pageNumber: number
  startIdx: number
  endIdx: number
}

export function computePageBoundaries(pages: string[]): PageBoundary[] {
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

/**
 * Find the page number (1-indexed) that contains the given character index.
 * Uses binary search for efficiency.
 */
export function findPageFromCharIndex(boundaries: PageBoundary[], charIndex: number): number {
  if (boundaries.length === 0) return 1

  let left = 0
  let right = boundaries.length - 1

  while (left <= right) {
    const mid = Math.floor((left + right) / 2)
    const boundary = boundaries[mid]

    if (charIndex < boundary.startIdx) {
      right = mid - 1
    } else if (charIndex >= boundary.endIdx) {
      left = mid + 1
    } else {
      // charIndex is within this page's bounds
      return boundary.pageNumber
    }
  }

  // If not found in any bounds (shouldn't happen), return closest page
  if (left >= boundaries.length) {
    return boundaries[boundaries.length - 1].pageNumber
  }
  return boundaries[left].pageNumber
}

/**
 * Detects the page offset between physical PDF pages and logical page numbers
 * by sampling pages from the middle of the document where formatting is stable.
 *
 * Returns the offset to add to a TOC page number to get the physical page index.
 * Example: if TOC says "Chapter 4...159" and it's on physical page 180, offset = 21
 */
function detectPageOffset(pages: string[]): number {
  if (pages.length < 10) return 0

  // Sample 4 pages from the middle (around 50% mark)
  const midPoint = Math.floor(pages.length / 2)
  const sampleIndices = [midPoint - 2, midPoint - 1, midPoint, midPoint + 1]

  type Location = 'header' | 'footer'

  // Helper to create patterns for both header and footer
  function forBoth(regex: RegExp): { regex: RegExp; location: Location }[] {
    return [
      { regex, location: 'footer' },
      { regex, location: 'header' }
    ]
  }

  // Page number patterns to try (ordered by specificity)
  const patterns: { regex: RegExp; location: Location }[] = [
    // "X of Y" formats - space separated (common after PDF text extraction)
    ...forBoth(/(\d{1,3})\s+of\s*\d+/i),
    // "X of Y" with pipes: "| 115 | of 242"
    ...forBoth(/\|\s*(\d{1,3})\s*\|\s*of\s*\d+/i),
    ...forBoth(/(\d{1,3})\s*\|\s*of\s*\d+/i),
    // O'Reilly style: "PageNum | Chapter Title" or "Chapter Title | PageNum"
    ...forBoth(/^(\d{1,3})\s*\|/),
    ...forBoth(/\|\s*(\d{1,3})\s*$/),
    // Standalone page number
    ...forBoth(/^(\d{1,3})$/)
  ]

  for (const physicalIdx of sampleIndices) {
    if (physicalIdx < 0 || physicalIdx >= pages.length) continue

    const content = pages[physicalIdx]
    const lines = content.split('\n').filter((l) => l.trim().length > 0)
    if (lines.length < 4) continue

    // Get header (first 2 lines) and footer (last 3 lines)
    const headerText = lines.slice(0, 2).join(' ')
    const footerText = lines.slice(-3).join(' ')

    for (const pattern of patterns) {
      const text = pattern.location === 'header' ? headerText : footerText
      const match = text.match(pattern.regex)

      if (match) {
        const logicalPage = parseInt(match[1], 10)
        // Sanity check: logical page should be reasonable
        if (logicalPage > 0 && logicalPage < pages.length) {
          const physicalPage = physicalIdx + 1
          const offset = physicalPage - logicalPage
          // Offset should be positive (front matter adds pages) and reasonable
          if (offset >= 0 && offset < 100) {
            return offset
          }
        }
      }
    }
  }

  return 0 // No pattern detected, assume no offset
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

    // Extract TOC - try PDF outline first (structured), fall back to AI parsing
    const collectedChapters: { id: number; tocChapter: TocChapter; index: number }[] = []
    let usedOutlineParsing = false

    const onChapterFound = (tocChapter: TocChapter, index: number): void => {
      // Insert chapter with temporary boundaries (will fix after all chapters collected)
      // For AI-based parsing, isAuxiliary comes from the stream; for outline, it's undefined (classified later)
      const chapterId = insertChapter(pdfId, tocChapter.title, index, 0, fullText.length, tocChapter.isAuxiliary ?? false)
      collectedChapters.push({ id: chapterId, tocChapter, index })

      // Notify frontend
      notifyChapterAdded(pdfId, {
        id: chapterId,
        title: tocChapter.title,
        chapter_index: index,
        status: 'pending'
      })
    }

    // Try PDF outline first (most reliable - uses embedded bookmarks)
    let tocResult = await parseOutlineFromPdf(destPath, onChapterFound)
    usedOutlineParsing = tocResult.hasToc && tocResult.chapters.length > 0

    // Save title immediately if available from PDF metadata
    if (tocResult.title) {
      updatePdfMetadata(pdfId, { title: tocResult.title })
    }

    // Fall back to AI parsing if no outline found
    if (!usedOutlineParsing) {
      tocResult = await parseTocStreaming(pages, onChapterFound)
    }

    // For outline-based parsing, classify chapters to set is_auxiliary
    if (usedOutlineParsing && collectedChapters.length > 0) {
      const titles = collectedChapters.map((c) => c.tocChapter.title)
      const classifications = await classifyChapterTitles(titles)
      for (const chapter of collectedChapters) {
        const isAuxiliary = classifications.get(chapter.tocChapter.title)
        if (isAuxiliary !== undefined) {
          updateChapterAuxiliary(chapter.id, isAuxiliary)
        }
      }
    }

    // After all chapters collected, find actual chapter positions
    if (collectedChapters.length > 0) {
      // Detect page offset by sampling middle pages for page number patterns
      const pageOffset = detectPageOffset(pages)

      // Apply offset to find each chapter's position
      const streamedChapters: { id: number; tocChapter: TocChapter; index: number; startIdx: number; startPage: number }[] = []

      for (const chapter of collectedChapters) {
        // Calculate expected physical page with offset
        const tocPageIdx = chapter.tocChapter.pageNumber - 1
        const expectedPageIdx = Math.min(Math.max(0, tocPageIdx + pageOffset), boundaries.length - 1)
        const expectedStart = boundaries[expectedPageIdx]?.startIdx ?? 0
        const searchWindowStart = Math.max(0, expectedStart - 5000) // Look 5000 chars before
        const searchWindowEnd = Math.min(fullText.length, expectedStart + 20000) // Look 20000 chars after

        // Search for title within this window
        const escapedTitle = chapter.tocChapter.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const windowText = fullText.substring(searchWindowStart, searchWindowEnd)
        const headingRegex = new RegExp(`(?:^|\\n)\\s*${escapedTitle}`, 'i')
        const headingMatch = windowText.match(headingRegex)

        let startIdx: number
        let startPage: number
        if (headingMatch && headingMatch.index !== undefined) {
          // Found heading in window - calculate position and skip prefix
          const prefixLength = headingMatch[0].length - chapter.tocChapter.title.length
          startIdx = searchWindowStart + headingMatch.index + prefixLength
          // Find actual page from character position
          startPage = findPageFromCharIndex(boundaries, startIdx)
        } else {
          // Fall back to page boundary
          startIdx = expectedStart
          startPage = expectedPageIdx + 1 // 1-indexed page number
        }

        updateChapterStartIdx(chapter.id, startIdx)
        updateChapterStartPage(chapter.id, startPage)
        streamedChapters.push({ id: chapter.id, tocChapter: chapter.tocChapter, index: chapter.index, startIdx, startPage })
      }

      // Step 3: Fix end_idx values based on document order
      if (streamedChapters.length > 1) {
        const sortedByPosition = [...streamedChapters].sort((a, b) => a.startIdx - b.startIdx)
        for (let i = 0; i < sortedByPosition.length - 1; i++) {
          const current = sortedByPosition[i]
          const next = sortedByPosition[i + 1]
          updateChapterEndIdx(current.id, next.startIdx)
        }
      }
    }

    // Queue jobs for all chapters
    for (const chapter of collectedChapters) {
      // Queue embed job (priority 1)
      insertJob(pdfId, chapter.id, 'embed')
      // Queue summary job (priority 2 - runs after embed)
      insertJob(pdfId, chapter.id, 'summary')
      // Queue concepts job (priority 3 - runs after summary)
      insertJob(pdfId, chapter.id, 'concepts')
    }

    // If no chapters were streamed (no TOC), create single "Full Document" chapter
    if (collectedChapters.length === 0) {
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
  pages: string[]
): Promise<void> {
  const chapter = getChapter(chapterId)
  if (!chapter) throw new Error('Chapter not found')

  // Skip chunking if chunks already exist (retry scenario)
  const existingChunks = getChunksByChapterId(chapterId)
  if (existingChunks.length > 0) return

  updateChapterStatus(chapterId, 'processing')

  // Compute page boundaries for accurate page number lookup
  const boundaries = computePageBoundaries(pages)
  const pageCount = pages.length

  const chapterText = fullText.substring(chapter.start_idx, chapter.end_idx)

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

    // Calculate page range using actual page boundaries
    const chunkStartInFull = chapter.start_idx + chapterText.indexOf(content)
    const chunkEndInFull = chunkStartInFull + content.length
    const pageStart = findPageFromCharIndex(boundaries, chunkStartInFull)
    const pageEnd = Math.min(findPageFromCharIndex(boundaries, chunkEndInFull), pageCount)

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
