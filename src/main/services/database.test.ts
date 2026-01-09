import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  initTestDatabase,
  closeDb,
  insertPdf,
  getPdf,
  getPdfByHash,
  getAllPdfs,
  updatePdfStatus,
  deletePdf,
  insertChapter,
  getChapter,
  getChaptersByPdfId,
  updateChapterStatus,
  insertChunk,
  getChunksByPdfId,
  getChunksByChapterId,
  insertMessage,
  getMessagesByPdfId,
  getSetting,
  setSetting,
  ftsSearch
} from './database'

describe('database', () => {
  beforeEach(() => {
    initTestDatabase()
  })

  afterEach(() => {
    closeDb()
  })

  describe('settings', () => {
    it('sets and gets a setting', () => {
      setSetting('test_key', 'test_value')
      expect(getSetting('test_key')).toBe('test_value')
    })

    it('returns undefined for missing setting', () => {
      expect(getSetting('nonexistent')).toBeUndefined()
    })

    it('overwrites existing setting', () => {
      setSetting('key', 'first')
      setSetting('key', 'second')
      expect(getSetting('key')).toBe('second')
    })
  })

  describe('pdfs', () => {
    it('inserts and retrieves a pdf', () => {
      const id = insertPdf('test.pdf', '/path/test.pdf', 'abc123', 1024)
      expect(id).toBe(1)

      const pdf = getPdf(id)
      expect(pdf).toBeDefined()
      expect(pdf!.filename).toBe('test.pdf')
      expect(pdf!.filepath).toBe('/path/test.pdf')
      expect(pdf!.status).toBe('pending')
    })

    it('finds pdf by hash', () => {
      insertPdf('test.pdf', '/path/test.pdf', 'hash123', 1024)
      const found = getPdfByHash('hash123')
      expect(found).toBeDefined()
      expect(found!.filename).toBe('test.pdf')
    })

    it('returns undefined for unknown hash', () => {
      expect(getPdfByHash('unknown')).toBeUndefined()
    })

    it('lists all pdfs', () => {
      insertPdf('a.pdf', '/a.pdf', 'h1', 100)
      insertPdf('b.pdf', '/b.pdf', 'h2', 200)
      const all = getAllPdfs()
      expect(all).toHaveLength(2)
    })

    it('updates pdf status', () => {
      const id = insertPdf('test.pdf', '/test.pdf', 'h', 100)
      updatePdfStatus(id, 'processing')
      expect(getPdf(id)!.status).toBe('processing')

      updatePdfStatus(id, 'error', undefined, 'Something went wrong')
      const pdf = getPdf(id)!
      expect(pdf.status).toBe('error')
      expect(pdf.error_message).toBe('Something went wrong')
    })

    it('updates pdf page count', () => {
      const id = insertPdf('test.pdf', '/test.pdf', 'h', 100)
      updatePdfStatus(id, 'done', 42)
      expect(getPdf(id)!.page_count).toBe(42)
    })

    it('deletes pdf', () => {
      const id = insertPdf('test.pdf', '/test.pdf', 'h', 100)
      deletePdf(id)
      expect(getPdf(id)).toBeUndefined()
    })
  })

  describe('chapters', () => {
    let pdfId: number

    beforeEach(() => {
      pdfId = insertPdf('book.pdf', '/book.pdf', 'bookhash', 5000)
    })

    it('inserts and retrieves chapter', () => {
      const chapterId = insertChapter(pdfId, 'Introduction', 0, 0, 1000)
      const chapter = getChapter(chapterId)
      expect(chapter).toBeDefined()
      expect(chapter!.title).toBe('Introduction')
      expect(chapter!.start_idx).toBe(0)
      expect(chapter!.end_idx).toBe(1000)
    })

    it('lists chapters by pdf', () => {
      insertChapter(pdfId, 'Chapter 1', 0, 0, 500)
      insertChapter(pdfId, 'Chapter 2', 1, 501, 1000)
      const chapters = getChaptersByPdfId(pdfId)
      expect(chapters).toHaveLength(2)
      expect(chapters[0].title).toBe('Chapter 1')
      expect(chapters[1].title).toBe('Chapter 2')
    })

    it('updates chapter status', () => {
      const id = insertChapter(pdfId, 'Test', 0, 0, 100)
      updateChapterStatus(id, 'done')
      expect(getChapter(id)!.status).toBe('done')
    })
  })

  describe('chunks', () => {
    let pdfId: number
    let chapterId: number

    beforeEach(() => {
      pdfId = insertPdf('doc.pdf', '/doc.pdf', 'dochash', 3000)
      chapterId = insertChapter(pdfId, 'Ch1', 0, 0, 2000)
    })

    it('inserts and retrieves chunks', () => {
      insertChunk(pdfId, chapterId, 0, 'Hello world', 'Heading', 1, 1, 3)
      insertChunk(pdfId, chapterId, 1, 'Second chunk', 'Heading', 2, 2, 3)

      const chunks = getChunksByPdfId(pdfId)
      expect(chunks).toHaveLength(2)
      expect(chunks[0].content).toBe('Hello world')
    })

    it('retrieves chunks by chapter', () => {
      insertChunk(pdfId, chapterId, 0, 'Chapter content', 'Title', 1, 5, 10)
      const chunks = getChunksByChapterId(chapterId)
      expect(chunks).toHaveLength(1)
      expect(chunks[0].content).toBe('Chapter content')
    })
  })

  describe('messages', () => {
    let pdfId: number
    let chapterId: number

    beforeEach(() => {
      pdfId = insertPdf('chat.pdf', '/chat.pdf', 'chathash', 1000)
      chapterId = insertChapter(pdfId, 'Ch', 0, 0, 500)
    })

    it('inserts and retrieves messages', () => {
      insertMessage(pdfId, null, 'user', 'Hello')
      insertMessage(pdfId, null, 'assistant', 'Hi there!')

      const messages = getMessagesByPdfId(pdfId)
      expect(messages).toHaveLength(2)
      expect(messages[0].role).toBe('user')
      expect(messages[1].role).toBe('assistant')
    })

    it('filters messages by chapter', () => {
      insertMessage(pdfId, null, 'user', 'PDF level message')
      insertMessage(pdfId, chapterId, 'user', 'Chapter message')

      const pdfMessages = getMessagesByPdfId(pdfId, null)
      expect(pdfMessages).toHaveLength(1)
      expect(pdfMessages[0].content).toBe('PDF level message')

      const chapterMessages = getMessagesByPdfId(pdfId, chapterId)
      expect(chapterMessages).toHaveLength(1)
      expect(chapterMessages[0].content).toBe('Chapter message')
    })
  })

  describe('fts search', () => {
    let pdfId: number
    let chapterId: number

    beforeEach(() => {
      pdfId = insertPdf('search.pdf', '/search.pdf', 'searchhash', 2000)
      chapterId = insertChapter(pdfId, 'Chapter', 0, 0, 1500)
      insertChunk(pdfId, chapterId, 0, 'Machine learning is transforming AI', 'ML', 1, 1, 10)
      insertChunk(pdfId, chapterId, 1, 'Deep learning uses neural networks', 'DL', 2, 2, 10)
      insertChunk(pdfId, chapterId, 2, 'Natural language processing', 'NLP', 3, 3, 10)
    })

    it('finds chunks by keyword', () => {
      const results = ftsSearch('learning')
      expect(results.length).toBeGreaterThanOrEqual(2)
    })

    it('finds chunks by partial match', () => {
      const results = ftsSearch('neural')
      expect(results).toHaveLength(1)
    })

    it('returns empty for no match', () => {
      const results = ftsSearch('quantum')
      expect(results).toHaveLength(0)
    })
  })
})
