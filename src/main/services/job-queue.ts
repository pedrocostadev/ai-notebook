import { BrowserWindow } from 'electron'
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf'
import {
  getNextPendingJob,
  updateJobStatus,
  getChunksByChapterId,
  getChunksByPdfId,
  insertEmbedding,
  updatePdfStatus,
  updateChapterStatus,
  getChaptersByPdfId,
  deletePdf,
  getPdf,
  getChapter,
  updateChapterSummary,
  updatePdfMetadata,
  insertConcepts,
  updateChapterConceptsStatus
} from './database'
import { generateEmbeddings } from './embeddings'
import { getApiKey } from './settings'
import { deletePdfFile, processChapter, computePageBoundaries, findPageFromCharIndex, loadPageLabels, physicalToLabel } from './pdf-processor'
import {
  generateChapterSummary,
  generatePdfMetadata,
  generateChapterConcepts,
  consolidatePdfConcepts,
  type ChunkWithPage
} from './content-generator'
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'

const CHUNK_SIZE = 1500
const CHUNK_OVERLAP = 200

const MAX_ATTEMPTS = 3
const BASE_DELAY = 1000
const BATCH_SIZE = 100

let isProcessing = false
let processingTimeout: NodeJS.Timeout | null = null
let currentPdfId: number | null = null
let currentChapterId: number | null = null
let cancelRequested = false

export type ProcessingStage = 'extracting' | 'chunking' | 'embedding'

export function startJobQueue(): void {
  if (processingTimeout || isProcessing) return
  processNextJob()
}

export function stopJobQueue(): void {
  if (processingTimeout) {
    clearTimeout(processingTimeout)
    processingTimeout = null
  }
  isProcessing = false
}

async function processNextJob(): Promise<void> {
  if (isProcessing) return

  const job = getNextPendingJob()
  if (!job) {
    processingTimeout = setTimeout(processNextJob, 5000)
    return
  }

  if (!getApiKey()) {
    processingTimeout = setTimeout(processNextJob, 5000)
    return
  }

  isProcessing = true
  currentPdfId = job.pdf_id
  currentChapterId = job.chapter_id
  cancelRequested = false

  try {
    updateJobStatus(job.id, 'running')

    if (job.type === 'embed' && job.chapter_id !== null) {
      // Load PDF text for chapter processing
      const pdf = getPdf(job.pdf_id)
      if (!pdf) throw new Error('PDF not found')

      const loader = new PDFLoader(pdf.filepath, { parsedItemSeparator: '\n' })
      const docs = await loader.load()
      const pages = docs.map((d) => d.pageContent)
      const fullText = pages.join('\n\n')

      // Load page labels for converting physical pages to display labels
      const labelMap = await loadPageLabels(pdf.filepath)

      // Process chapter (chunk text)
      await processChapter(job.pdf_id, job.chapter_id, fullText, pages, labelMap)

      if (cancelRequested) {
        currentPdfId = null
        currentChapterId = null
        isProcessing = false
        processingTimeout = setTimeout(processNextJob, 100)
        return
      }

      // Generate embeddings for this chapter's chunks
      await processChapterEmbeddings(job.pdf_id, job.chapter_id)
    } else if (job.type === 'summary' && job.chapter_id !== null) {
      // Generate chapter summary using chapter data directly
      const pdf = getPdf(job.pdf_id)
      if (!pdf) throw new Error('PDF not found')
      const chapter = getChapter(job.chapter_id)
      if (!chapter) throw new Error('Chapter not found')

      const loader = new PDFLoader(pdf.filepath, { parsedItemSeparator: '\n' })
      const docs = await loader.load()
      const fullText = docs.map((d) => d.pageContent).join('\n\n')

      // Extract chapter text directly using chapter boundaries
      const chapterText = fullText.substring(chapter.start_idx, chapter.end_idx)

      const summary = await generateChapterSummary(chapterText)
      // Only update if summary was generated (null means chapter was too short)
      if (summary !== null) {
        updateChapterSummary(job.chapter_id, summary)
      }
    } else if (job.type === 'metadata') {
      // Generate PDF metadata
      const pdf = getPdf(job.pdf_id)
      if (!pdf) throw new Error('PDF not found')

      const loader = new PDFLoader(pdf.filepath, { parsedItemSeparator: '\n' })
      const docs = await loader.load()
      const fullText = docs.map((d) => d.pageContent).join('\n\n')

      const metadata = await generatePdfMetadata(fullText)
      updatePdfMetadata(job.pdf_id, metadata)
    } else if (job.type === 'concepts' && job.chapter_id !== null) {
      // Generate key concepts for chapter using chapter data directly
      updateChapterConceptsStatus(job.chapter_id, 'processing')

      notifyConceptsProgress({
        pdfId: job.pdf_id,
        chapterId: job.chapter_id,
        stage: 'extracting'
      })

      const pdf = getPdf(job.pdf_id)
      if (!pdf) throw new Error('PDF not found')
      const chapter = getChapter(job.chapter_id)
      if (!chapter) throw new Error('Chapter not found')

      const loader = new PDFLoader(pdf.filepath, { parsedItemSeparator: '\n' })
      const docs = await loader.load()
      const pages = docs.map((d) => d.pageContent)
      const fullText = pages.join('\n\n')
      const boundaries = computePageBoundaries(pages)

      // Load page labels for converting physical pages to display labels
      const labelMap = await loadPageLabels(pdf.filepath)

      // Extract chapter text directly using chapter boundaries
      const chapterText = fullText.substring(chapter.start_idx, chapter.end_idx)

      // Split chapter text into segments for page markers
      const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: CHUNK_SIZE,
        chunkOverlap: CHUNK_OVERLAP
      })
      const segments = await splitter.splitText(chapterText)

      // Calculate page numbers for each segment using page boundaries
      // Track position to handle repeated text (indexOf would always return first occurrence)
      const chunksWithPages: ChunkWithPage[] = []
      let searchStartInChapter = 0
      for (const content of segments) {
        const posInChapter = chapterText.indexOf(content, searchStartInChapter)
        const actualPos = posInChapter >= 0 ? posInChapter : searchStartInChapter

        const segmentStartInFull = chapter.start_idx + actualPos
        const segmentEndInFull = segmentStartInFull + content.length

        // Get physical pages then convert to labels for UI display
        const physicalStart = findPageFromCharIndex(boundaries, segmentStartInFull)
        const physicalEnd = findPageFromCharIndex(boundaries, segmentEndInFull)

        chunksWithPages.push({
          content,
          pageStart: physicalToLabel(physicalStart, labelMap),
          pageEnd: physicalToLabel(physicalEnd, labelMap)
        })

        // Update search position for next segment (step back by overlap)
        searchStartInChapter = Math.max(0, actualPos + content.length - CHUNK_OVERLAP)
      }

      const concepts = await generateChapterConcepts(chunksWithPages)

      if (cancelRequested) {
        currentPdfId = null
        currentChapterId = null
        isProcessing = false
        processingTimeout = setTimeout(processNextJob, 100)
        return
      }

      insertConcepts(job.pdf_id, job.chapter_id, concepts)
      updateChapterConceptsStatus(job.chapter_id, 'done')

      notifyConceptsProgress({
        pdfId: job.pdf_id,
        chapterId: job.chapter_id,
        stage: 'done',
        conceptsCount: concepts.length
      })
    } else if (job.type === 'consolidate') {
      // Consolidate all chapter concepts into PDF-level concepts
      notifyConceptsProgress({
        pdfId: job.pdf_id,
        chapterId: null,
        stage: 'consolidating'
      })

      await consolidatePdfConcepts(job.pdf_id)

      notifyConceptsProgress({
        pdfId: job.pdf_id,
        chapterId: null,
        stage: 'done'
      })
    }

    if (cancelRequested) {
      currentPdfId = null
      currentChapterId = null
      isProcessing = false
      processingTimeout = setTimeout(processNextJob, 100)
      return
    }

    updateJobStatus(job.id, 'done')
    // Only update chapter status for embed jobs (the primary processing job)
    if (job.type === 'embed' && job.chapter_id !== null) {
      updateChapterStatus(job.chapter_id, 'done')
    }

    // Check if all chapters are done (only for embed jobs)
    if (job.type === 'embed') {
      checkPdfCompletion(job.pdf_id)
    }
  } catch (err) {
    if (cancelRequested) {
      currentPdfId = null
      currentChapterId = null
      isProcessing = false
      processingTimeout = setTimeout(processNextJob, 100)
      return
    }

    const errorMsg = err instanceof Error ? err.message : String(err)
    console.error(`[JobQueue] Job ${job.id} (${job.type}) failed:`, errorMsg)

    if (job.attempts + 1 >= MAX_ATTEMPTS) {
      updateJobStatus(job.id, 'failed', errorMsg)
      // Only update chapter status for embed jobs (the primary processing job)
      if (job.type === 'embed' && job.chapter_id !== null) {
        updateChapterStatus(job.chapter_id, 'error', errorMsg)
      }
      // Update concepts status separately (non-blocking for chapter status)
      if (job.type === 'concepts' && job.chapter_id !== null) {
        updateChapterConceptsStatus(job.chapter_id, 'error', errorMsg)
      }
    } else {
      updateJobStatus(job.id, 'pending', errorMsg)
      const delay = BASE_DELAY * Math.pow(2, job.attempts)
      currentPdfId = null
      currentChapterId = null
      processingTimeout = setTimeout(processNextJob, delay)
      isProcessing = false
      return
    }
  }

  currentPdfId = null
  currentChapterId = null
  isProcessing = false
  processingTimeout = setTimeout(processNextJob, 100)
}

function checkPdfCompletion(pdfId: number): void {
  const chapters = getChaptersByPdfId(pdfId)
  const allDone = chapters.every((c) => c.status === 'done')
  const anyError = chapters.some((c) => c.status === 'error')

  if (allDone) {
    updatePdfStatus(pdfId, 'done')
  } else if (anyError && chapters.every((c) => c.status === 'done' || c.status === 'error')) {
    updatePdfStatus(pdfId, 'error', undefined, 'Some chapters failed to process')
  }
}

async function processChapterEmbeddings(pdfId: number, chapterId: number): Promise<void> {
  const chunks = getChunksByChapterId(chapterId)
  if (chunks.length === 0) return

  const totalEmbeddings = chunks.length

  // Emit 0% progress to show embedding stage started
  notifyChapterProgress({
    pdfId,
    chapterId,
    progress: 0,
    stage: 'embedding',
    embeddingsTotal: totalEmbeddings,
    embeddingsProcessed: 0
  })

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    if (cancelRequested) return

    const batch = chunks.slice(i, i + BATCH_SIZE)
    const texts = batch.map((c) => c.content)

    const embeddings = await generateEmbeddings(texts)

    if (cancelRequested) return

    for (let j = 0; j < batch.length; j++) {
      try {
        insertEmbedding(batch[j].id, embeddings[j])
      } catch (err) {
        console.error(`[JobQueue] insertEmbedding failed for chunk ${batch[j].id}:`, err)
        throw err
      }
    }

    const processedCount = i + batch.length
    const progress = Math.round((processedCount / chunks.length) * 100)

    notifyChapterProgress({
      pdfId,
      chapterId,
      progress,
      stage: 'embedding',
      embeddingsTotal: totalEmbeddings,
      embeddingsProcessed: processedCount
    })
  }
}

export interface ChapterProgressData {
  pdfId: number
  chapterId: number
  progress: number
  stage: ProcessingStage
  chunksTotal?: number
  chunksProcessed?: number
  embeddingsTotal?: number
  embeddingsProcessed?: number
}

export function notifyChapterProgress(data: ChapterProgressData): void {
  const windows = BrowserWindow.getAllWindows()
  for (const window of windows) {
    window.webContents.send('chapter:progress', data)
  }
}

export type ConceptsStage = 'extracting' | 'consolidating' | 'done'

export interface ConceptsProgressData {
  pdfId: number
  chapterId: number | null
  stage: ConceptsStage
  conceptsCount?: number
}

export function notifyConceptsProgress(data: ConceptsProgressData): void {
  const windows = BrowserWindow.getAllWindows()
  for (const window of windows) {
    window.webContents.send('concepts:progress', data)
  }
}

export function isJobProcessing(pdfId: number): boolean {
  const job = getNextPendingJob()
  return job?.pdf_id === pdfId
}

export function cancelProcessing(pdfId: number): boolean {
  // If this PDF is currently being processed, set cancel flag
  if (currentPdfId === pdfId) {
    cancelRequested = true
  }

  // Always delete the PDF and associated data (handles stale processing state after app restart)
  deletePdfFile(pdfId)
  deletePdf(pdfId)
  return true
}

// Request cancellation for current PDF without deleting (test-only)
export function requestCancelForPdf(pdfId: number): void {
  if (currentPdfId === pdfId) {
    cancelRequested = true
  }
}
