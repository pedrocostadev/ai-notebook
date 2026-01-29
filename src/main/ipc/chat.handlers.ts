import { ipcMain, BrowserWindow } from 'electron'
import { chat, getChatHistory, buildConversationHistory, MAX_HISTORY_TOKENS } from '../services/rag'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { getApiKey, getChatModel } from '../services/settings'
import {
  getPdf,
  getChapter,
  getChapterSummary,
  updateChapterSummary,
  getPdfMetadata,
  getConceptsByChapterId,
  getConceptsByPdfId,
  getChapterConceptsStatus,
  getChunksByChapterId,
  insertMessage,
  updateMessageMetadata,
  getMessagesByPdfId,
  getConversationSummary,
  isJobPending,
  type Concept
} from '../services/database'
import { estimateTokens } from '../lib/token-counter'
import { generateQuizQuestions, type PdfMetadata } from '../services/content-generator'
import type { QuizQuestion } from '../lib/schemas'

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

  // Save a message directly (for slash commands)
  ipcMain.handle(
    'chat:save-message',
    (_, pdfId: number, chapterId: number | null, role: 'user' | 'assistant', content: string, metadata?: object) => {
      return insertMessage(pdfId, chapterId, role, content, metadata)
    }
  )

  // Update message metadata (e.g., quiz answers)
  ipcMain.handle('chat:update-metadata', (_, messageId: number, metadata: object) => {
    updateMessageMetadata(messageId, metadata)
  })

  // Slash command handlers
  ipcMain.handle('slash:get-summary', (_, chapterId: number): { summary: string } | { pending: true } | { error: string } | { empty: true } => {
    const chapter = getChapter(chapterId)
    if (!chapter) {
      return { error: 'Chapter not found' }
    }

    const summary = getChapterSummary(chapterId)

    // If summary exists, return it
    if (summary && summary.trim().length > 0) {
      return { summary }
    }

    // Check if summary job is still pending (embed done but summary not yet)
    if (isJobPending(chapterId, 'summary')) {
      return { pending: true }
    }

    // If chapter processing is done and no pending summary job, chapter had no substantive content
    if (chapter.status === 'done') {
      return { empty: true }
    }

    // Still processing (embed not done yet)
    return { pending: true }
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

  // Concepts handlers
  ipcMain.handle(
    'concepts:get-chapter',
    (_, chapterId: number): { concepts: Concept[] } | { pending: true } | { error: string } => {
      const chapter = getChapter(chapterId)
      if (!chapter) {
        return { error: 'Chapter not found' }
      }

      const status = getChapterConceptsStatus(chapterId)
      if (status.status === 'error') {
        return { error: status.error || 'Concepts extraction failed' }
      }

      // If status is 'done', return concepts (even if empty)
      if (status.status === 'done') {
        const concepts = getConceptsByChapterId(chapterId)
        return { concepts }
      }

      // Still processing or not started
      return { pending: true }
    }
  )

  ipcMain.handle(
    'concepts:get-pdf',
    (_, pdfId: number, consolidatedOnly: boolean = true): { concepts: Concept[] } | { pending: true } | { error: string } => {
      const pdf = getPdf(pdfId)
      if (!pdf) {
        return { error: 'PDF not found' }
      }

      const concepts = getConceptsByPdfId(pdfId, consolidatedOnly)
      if (concepts.length === 0) {
        return { pending: true }
      }

      return { concepts }
    }
  )

  // Quiz generation
  ipcMain.handle(
    'quiz:generate',
    async (
      _,
      pdfId: number,
      chapterId: number | null
    ): Promise<{ questions: QuizQuestion[] } | { pending: true } | { empty: true } | { error: string }> => {
      try {
        let concepts: Concept[]

        if (chapterId !== null) {
          // Chapter-specific quiz
          const chapter = getChapter(chapterId)
          if (!chapter) {
            return { error: 'Chapter not found' }
          }

          // Check if chapter has enough content for meaningful quiz
          const chunks = getChunksByChapterId(chapterId)
          const totalTokens = chunks.reduce((sum, c) => sum + c.token_count, 0)
          if (totalTokens < 500) {
            return { error: 'This chapter does not have enough content to generate a quiz' }
          }

          const status = getChapterConceptsStatus(chapterId)
          if (status.status !== 'done') {
            return { pending: true }
          }

          concepts = getConceptsByChapterId(chapterId)
        } else {
          // PDF-wide quiz using consolidated concepts
          const pdf = getPdf(pdfId)
          if (!pdf) {
            return { error: 'PDF not found' }
          }

          concepts = getConceptsByPdfId(pdfId, true)
          if (concepts.length === 0) {
            return { pending: true }
          }
        }

        if (concepts.length === 0) {
          return { empty: true }
        }

        const questions = await generateQuizQuestions(concepts)
        return { questions }
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  // Test-only: Get conversation history stats (no API call needed)
  // Returns effective tokens (accounting for compaction when over budget)
  ipcMain.handle(
    'chat:test-history-stats',
    (
      _,
      pdfId: number,
      chapterId: number | null
    ): {
      messageCount: number
      totalTokens: number
      cachedSummary: string | null
      isCompacted: boolean
      summarizedCount: number
    } => {
      const messages = getMessagesByPdfId(pdfId, chapterId)
      const tokenCounts: number[] = []
      let totalTokens = 0
      for (const msg of messages) {
        const tokens = estimateTokens(`${msg.role}: ${msg.content}`)
        tokenCounts.push(tokens)
        totalTokens += tokens
      }
      const cached = getConversationSummary(pdfId, chapterId)

      // Calculate effective tokens (same logic as buildConversationHistory)
      let effectiveTokens = totalTokens
      let isCompacted = false
      let summarizedCount = 0
      if (totalTokens > MAX_HISTORY_TOKENS && messages.length > 0) {
        isCompacted = true

        // Find split point to fit within budget (same as buildConversationHistory)
        const summaryBudget = 200
        const recentBudget = MAX_HISTORY_TOKENS - summaryBudget

        let recentTokens = 0
        let splitIndex = messages.length
        for (let i = messages.length - 1; i >= 0; i--) {
          if (recentTokens + tokenCounts[i] > recentBudget) break
          recentTokens += tokenCounts[i]
          splitIndex = i
        }
        if (splitIndex === 0) splitIndex = 1

        summarizedCount = splitIndex
        const summaryTokens = cached ? estimateTokens(cached.summary) : summaryBudget
        effectiveTokens = summaryTokens + recentTokens
      }

      return {
        messageCount: messages.length,
        totalTokens: effectiveTokens,
        cachedSummary: cached?.summary ?? null,
        isCompacted,
        summarizedCount
      }
    }
  )

  // Test-only: Build conversation history (requires valid API key for summarization)
  ipcMain.handle(
    'chat:test-build-history',
    async (_, pdfId: number, chapterId: number | null): Promise<{ history: string } | { error: string }> => {
      try {
        const apiKey = getApiKey()
        if (!apiKey) {
          return { error: 'API key not configured' }
        }
        const chatModel = getChatModel()
        const google = createGoogleGenerativeAI({ apiKey })
        const history = await buildConversationHistory(pdfId, chapterId, google, chatModel)
        return { history }
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  // Test-only: Set chapter summary directly
  ipcMain.handle('chat:test-set-chapter-summary', (_, chapterId: number, summary: string): boolean => {
    const chapter = getChapter(chapterId)
    if (!chapter) {
      return false
    }
    updateChapterSummary(chapterId, summary)
    return true
  })
}
