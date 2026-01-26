import { BrowserWindow } from 'electron'
import {
  getNextPendingJob,
  getPendingJobs,
  updateJobStatus,
  getChunksByChapterId,
  insertEmbedding,
  updatePdfStatus,
  updateChapterStatus,
  getChaptersByPdfId,
  deletePdf,
  getPdf,
  getChapter,
  updateChapterSummary,
  updateChapterSummaryStatus,
  updatePdfMetadata,
  insertConcepts,
  updateChapterConceptsStatus,
  type PendingJob
} from './database'
import { generateEmbeddings } from './embeddings'
import { getApiKey } from './settings'
import { deletePdfFile, processChapter } from './pdf-processor'
import { getCachedPdfData, invalidatePdfCache } from './pdf-cache'
import {
  generateChapterSummary,
  generatePdfMetadata,
  generateChapterConcepts,
  consolidatePdfConcepts,
  type ChunkWithPage
} from './content-generator'

const MAX_ATTEMPTS = 3
const BASE_DELAY = 1000
const BATCH_SIZE = 100

// Parallel processing configuration
// Process up to 3 chapters concurrently to balance speed vs API rate limits
const MAX_CONCURRENT_JOBS = 3

// Track active workers by job ID
const activeWorkers = new Map<number, { pdfId: number; chapterId: number | null }>()

// Track cancel requests per PDF
const cancelRequestedFor = new Set<number>()

// Track retry delays for failed jobs (job ID -> retry timestamp)
const jobRetryAfter = new Map<number, number>()

let schedulerTimeout: NodeJS.Timeout | null = null
let isSchedulerRunning = false

export type ProcessingStage = 'extracting' | 'chunking' | 'embedding'

export function startJobQueue(): void {
  if (schedulerTimeout || isSchedulerRunning) return
  scheduleNextBatch()
}

export function stopJobQueue(): void {
  if (schedulerTimeout) {
    clearTimeout(schedulerTimeout)
    schedulerTimeout = null
  }
  isSchedulerRunning = false
}

/**
 * Scheduler that fills available worker slots with pending jobs.
 * Runs periodically to check for new jobs and spawn workers.
 */
async function scheduleNextBatch(): Promise<void> {
  if (isSchedulerRunning) return
  isSchedulerRunning = true

  try {
    // Check if API key is available
    if (!getApiKey()) {
      schedulerTimeout = setTimeout(scheduleNextBatch, 5000)
      isSchedulerRunning = false
      return
    }

    // Calculate available slots
    const availableSlots = MAX_CONCURRENT_JOBS - activeWorkers.size

    if (availableSlots <= 0) {
      // All slots full, wait for workers to finish
      schedulerTimeout = setTimeout(scheduleNextBatch, 500)
      isSchedulerRunning = false
      return
    }

    // Get pending jobs (up to available slots)
    const pendingJobs = getPendingJobs(availableSlots)

    if (pendingJobs.length === 0) {
      // No pending jobs, poll again later
      schedulerTimeout = setTimeout(scheduleNextBatch, 5000)
      isSchedulerRunning = false
      return
    }

    // Filter out jobs that are already being processed (by chapter or PDF-level jobs)
    const jobsToProcess = pendingJobs.filter((job) => {
      // Don't process if this job is already active
      if (activeWorkers.has(job.id)) return false

      // Don't process if cancel was requested for this PDF
      if (cancelRequestedFor.has(job.pdf_id)) return false

      // Respect exponential backoff for retries
      const retryAfter = jobRetryAfter.get(job.id)
      if (retryAfter && Date.now() < retryAfter) return false

      // For PDF-level jobs (metadata, consolidate), only run if no other jobs for this PDF are active
      if (job.chapter_id === null) {
        for (const [, worker] of activeWorkers) {
          if (worker.pdfId === job.pdf_id) return false
        }
      }

      // For chapter-level concepts/summary jobs, only run if embed job for same chapter is not active
      // (concepts depends on chunks created by embed)
      if ((job.type === 'concepts' || job.type === 'summary') && job.chapter_id !== null) {
        for (const [, worker] of activeWorkers) {
          if (worker.chapterId === job.chapter_id) return false
        }
      }

      return true
    })

    // Spawn workers for each job
    for (const job of jobsToProcess) {
      if (activeWorkers.size >= MAX_CONCURRENT_JOBS) break

      // Mark job as active
      activeWorkers.set(job.id, { pdfId: job.pdf_id, chapterId: job.chapter_id })

      // Spawn worker (don't await - run in parallel)
      processJob(job).catch((err) => {
        console.error(`[JobQueue] Unhandled error in worker for job ${job.id}:`, err)
      })
    }

    // Schedule next batch check
    schedulerTimeout = setTimeout(scheduleNextBatch, 100)
  } finally {
    isSchedulerRunning = false
  }
}

/**
 * Process a single job. Runs as an independent worker.
 */
async function processJob(job: PendingJob): Promise<void> {
  const isCancelled = (): boolean => cancelRequestedFor.has(job.pdf_id)

  try {
    updateJobStatus(job.id, 'running')

    if (job.type === 'embed' && job.chapter_id !== null) {
      // Load PDF text for chapter processing (cached)
      const pdf = getPdf(job.pdf_id)
      if (!pdf) throw new Error('PDF not found')

      const { fullText, boundaries } = await getCachedPdfData(pdf.filepath)

      // Process chapter (chunk text)
      await processChapter(job.pdf_id, job.chapter_id, fullText, boundaries)

      if (isCancelled()) {
        cleanupWorker(job.id)
        return
      }

      // Generate embeddings for this chapter's chunks
      await processChapterEmbeddings(job.pdf_id, job.chapter_id, isCancelled)
    } else if (job.type === 'summary' && job.chapter_id !== null) {
      // Generate chapter summary using chapter data directly (cached)
      updateChapterSummaryStatus(job.chapter_id, 'processing')

      const pdf = getPdf(job.pdf_id)
      if (!pdf) throw new Error('PDF not found')
      const chapter = getChapter(job.chapter_id)
      if (!chapter) throw new Error('Chapter not found')

      const { fullText } = await getCachedPdfData(pdf.filepath)

      // Extract chapter text directly using chapter boundaries
      const chapterText = fullText.substring(chapter.start_idx, chapter.end_idx)

      const summary = await generateChapterSummary(chapterText)
      // Only update if summary was generated (null means chapter was too short)
      if (summary !== null) {
        updateChapterSummary(job.chapter_id, summary)
      } else {
        // Mark as done even if no summary (chapter too short)
        updateChapterSummaryStatus(job.chapter_id, 'done')
      }
    } else if (job.type === 'metadata') {
      // Generate PDF metadata (cached)
      const pdf = getPdf(job.pdf_id)
      if (!pdf) throw new Error('PDF not found')

      const { fullText } = await getCachedPdfData(pdf.filepath)

      const metadata = await generatePdfMetadata(fullText)
      updatePdfMetadata(job.pdf_id, metadata)
    } else if (job.type === 'concepts' && job.chapter_id !== null) {
      // Generate key concepts for chapter - reuse existing chunks from embed job
      updateChapterConceptsStatus(job.chapter_id, 'processing')

      notifyConceptsProgress({
        pdfId: job.pdf_id,
        chapterId: job.chapter_id,
        stage: 'extracting'
      })

      // Reuse chunks already created during embed job (avoid re-splitting)
      const existingChunks = getChunksByChapterId(job.chapter_id)

      if (existingChunks.length === 0) {
        // Fallback: chapter has no chunks yet (shouldn't happen in normal flow)
        updateChapterConceptsStatus(job.chapter_id, 'error', 'No chunks available')
        throw new Error('No chunks found for chapter')
      }

      // Map existing chunks to ChunkWithPage format (page info already stored)
      const chunksWithPages: ChunkWithPage[] = existingChunks.map((chunk) => ({
        content: chunk.content,
        pageStart: chunk.page_start,
        pageEnd: chunk.page_end
      }))

      const concepts = await generateChapterConcepts(chunksWithPages)

      if (isCancelled()) {
        cleanupWorker(job.id)
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

    if (isCancelled()) {
      cleanupWorker(job.id)
      return
    }

    updateJobStatus(job.id, 'done')
    jobRetryAfter.delete(job.id) // Clear any retry delay on success
    // Only update chapter status for embed jobs (the primary processing job)
    if (job.type === 'embed' && job.chapter_id !== null) {
      updateChapterStatus(job.chapter_id, 'done')
    }

    // Check if all chapters are done (only for embed jobs)
    if (job.type === 'embed') {
      checkPdfCompletion(job.pdf_id)
    }
  } catch (err) {
    if (isCancelled()) {
      cleanupWorker(job.id)
      return
    }

    const errorMsg = err instanceof Error ? err.message : String(err)
    console.error(`[JobQueue] Job ${job.id} (${job.type}) failed:`, errorMsg)

    if (job.attempts + 1 >= MAX_ATTEMPTS) {
      updateJobStatus(job.id, 'failed', errorMsg)
      // Update job-specific status if chapter-scoped
      if (job.chapter_id !== null) {
        switch (job.type) {
          case 'embed':
            updateChapterStatus(job.chapter_id, 'error', errorMsg)
            break
          case 'concepts':
            updateChapterConceptsStatus(job.chapter_id, 'error', errorMsg)
            break
          case 'summary':
            updateChapterSummaryStatus(job.chapter_id, 'error', errorMsg)
            break
        }
      }
    } else {
      // Reset to pending for retry with exponential backoff
      const delay = BASE_DELAY * Math.pow(2, job.attempts)
      jobRetryAfter.set(job.id, Date.now() + delay)
      updateJobStatus(job.id, 'pending', errorMsg)
    }
  } finally {
    cleanupWorker(job.id)
  }
}

/**
 * Clean up worker state after job completion or cancellation.
 */
function cleanupWorker(jobId: number): void {
  activeWorkers.delete(jobId)
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

async function processChapterEmbeddings(
  pdfId: number,
  chapterId: number,
  isCancelled: () => boolean
): Promise<void> {
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
    if (isCancelled()) return

    const batch = chunks.slice(i, i + BATCH_SIZE)
    const texts = batch.map((c) => c.content)

    const embeddings = await generateEmbeddings(texts)

    if (isCancelled()) return

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

// Debounce state for progress notifications
const PROGRESS_DEBOUNCE_MS = 100
let lastProgressNotify: { [key: string]: number } = {}
let pendingProgress: { [key: string]: ChapterProgressData } = {}
let progressTimeouts: { [key: string]: NodeJS.Timeout } = {}

export function notifyChapterProgress(data: ChapterProgressData): void {
  const key = `${data.pdfId}-${data.chapterId}`
  const now = Date.now()
  const lastNotify = lastProgressNotify[key] || 0

  // Always send immediately if progress is 0 or 100 (start/end)
  if (data.progress === 0 || data.progress === 100) {
    sendProgressToWindows(data)
    lastProgressNotify[key] = now
    // Clear any pending update
    if (progressTimeouts[key]) {
      clearTimeout(progressTimeouts[key])
      delete progressTimeouts[key]
    }
    delete pendingProgress[key]
    return
  }

  // Debounce intermediate progress updates
  if (now - lastNotify >= PROGRESS_DEBOUNCE_MS) {
    sendProgressToWindows(data)
    lastProgressNotify[key] = now
    delete pendingProgress[key]
  } else {
    // Store pending and schedule flush
    pendingProgress[key] = data
    if (!progressTimeouts[key]) {
      progressTimeouts[key] = setTimeout(() => {
        const pending = pendingProgress[key]
        if (pending) {
          sendProgressToWindows(pending)
          lastProgressNotify[key] = Date.now()
          delete pendingProgress[key]
        }
        delete progressTimeouts[key]
      }, PROGRESS_DEBOUNCE_MS)
    }
  }
}

function sendProgressToWindows(data: ChapterProgressData): void {
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
  // Check if any active worker is processing this PDF
  for (const [, worker] of activeWorkers) {
    if (worker.pdfId === pdfId) return true
  }
  // Also check pending jobs
  const job = getNextPendingJob()
  return job?.pdf_id === pdfId
}

export function cancelProcessing(pdfId: number): boolean {
  // Mark this PDF as cancelled (active workers will check this)
  cancelRequestedFor.add(pdfId)

  // Invalidate PDF cache before deletion
  const pdf = getPdf(pdfId)
  if (pdf) {
    invalidatePdfCache(pdf.filepath)
  }

  // Always delete the PDF and associated data (handles stale processing state after app restart)
  deletePdfFile(pdfId)
  deletePdf(pdfId)

  // Clean up cancel request after a delay (allow workers to see it)
  setTimeout(() => {
    cancelRequestedFor.delete(pdfId)
  }, 5000)

  return true
}

// Request cancellation for current PDF without deleting (test-only)
export function requestCancelForPdf(pdfId: number): void {
  cancelRequestedFor.add(pdfId)
  // Clean up after delay
  setTimeout(() => {
    cancelRequestedFor.delete(pdfId)
  }, 5000)
}

// Export for testing/debugging
export function getActiveWorkerCount(): number {
  return activeWorkers.size
}

export function getMaxConcurrentJobs(): number {
  return MAX_CONCURRENT_JOBS
}
