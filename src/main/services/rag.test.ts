import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  initTestDatabase,
  closeDb,
  insertPdf,
  insertChapter,
  insertMessage
} from './database'
import { getChatHistory, MAX_HISTORY_TOKENS } from './rag'

describe('rag', () => {
  beforeEach(() => {
    initTestDatabase()
  })

  afterEach(() => {
    closeDb()
  })

  describe('getChatHistory', () => {
    let pdfId: number
    let chapterId: number

    beforeEach(() => {
      pdfId = insertPdf('test.pdf', '/test.pdf', 'hash123', 1000)
      chapterId = insertChapter(pdfId, 'Chapter 1', 0, 0, 500)
    })

    it('returns empty array when no messages', () => {
      const history = getChatHistory(pdfId)
      expect(history).toHaveLength(0)
    })

    it('returns messages for pdf', () => {
      insertMessage(pdfId, null, 'user', 'Hello')
      insertMessage(pdfId, null, 'assistant', 'Hi there!')

      const history = getChatHistory(pdfId)
      expect(history).toHaveLength(2)
      expect(history[0].role).toBe('user')
      expect(history[0].content).toBe('Hello')
      expect(history[1].role).toBe('assistant')
      expect(history[1].content).toBe('Hi there!')
    })

    it('returns messages with metadata', () => {
      insertMessage(pdfId, null, 'user', 'Question')
      insertMessage(pdfId, null, 'assistant', 'Answer', { confidence: 'high' })

      const history = getChatHistory(pdfId)
      expect(history[0].metadata).toBeNull()
      expect(history[1].metadata).toEqual({ confidence: 'high' })
    })

    it('filters by chapter', () => {
      insertMessage(pdfId, null, 'user', 'PDF-level message')
      insertMessage(pdfId, chapterId, 'user', 'Chapter message')

      const pdfHistory = getChatHistory(pdfId, null)
      expect(pdfHistory).toHaveLength(1)
      expect(pdfHistory[0].content).toBe('PDF-level message')

      const chapterHistory = getChatHistory(pdfId, chapterId)
      expect(chapterHistory).toHaveLength(1)
      expect(chapterHistory[0].content).toBe('Chapter message')
    })
  })

  describe('MAX_HISTORY_TOKENS', () => {
    it('is defined and reasonable', () => {
      expect(MAX_HISTORY_TOKENS).toBe(16000)
    })
  })
})
