import { contextBridge, ipcRenderer } from 'electron'

export type QuizQuestion = {
  question: string
  options: string[]
  correctIndex: number
  explanation: string
  conceptName: string
}

export type ChatMessage = {
  id: number
  role: 'user' | 'assistant'
  content: string
  metadata: {
    citations?: { chunkId: number; quote: string }[]
    confidence?: 'high' | 'medium' | 'low'
    followUpQuestions?: string[]
    quiz?: QuizQuestion[]
  } | null
}

export type Pdf = {
  id: number
  filename: string
  status: 'pending' | 'processing' | 'done' | 'error'
  page_count: number | null
  error_message: string | null
  created_at: string
}

export type Chapter = {
  id: number
  pdf_id: number
  title: string
  chapter_index: number
  is_auxiliary: boolean
  status: 'pending' | 'processing' | 'done' | 'error'
  error_message: string | null
}

export type ProcessingStage = 'extracting' | 'chunking' | 'embedding'

export type ChapterProgress = {
  pdfId: number
  chapterId: number
  progress: number
  stage: ProcessingStage
  chunksTotal?: number
  chunksProcessed?: number
  embeddingsTotal?: number
  embeddingsProcessed?: number
}

export type ChatModel = {
  id: string
  name: string
}

export type PdfMetadata = {
  title: string | null
  author: string | null
  publisher: string | null
  publishDate: string | null
  isbn: string | null
  edition: string | null
  language: string | null
  subject: string | null
}

export type SlashSummaryResult = { summary: string } | { pending: true } | { error: string } | { empty: true }
export type SlashMetadataResult = { metadata: PdfMetadata } | { pending: true } | { error: string }

export type ConceptQuote = {
  text: string
  pageEstimate?: number
  chapterTitle?: string
}

export type Concept = {
  id: number
  pdf_id: number
  chapter_id: number | null
  name: string
  definition: string
  importance: number
  quotes: ConceptQuote[]
  is_consolidated: boolean
  source_concept_ids: number[] | null
  created_at: string
}

export type ConceptsResult = { concepts: Concept[] } | { pending: true } | { error: string }

export type QuizResult = { questions: QuizQuestion[] } | { pending: true } | { empty: true } | { error: string }

export type ConceptsStage = 'extracting' | 'consolidating' | 'done'

export type ConceptsProgress = {
  pdfId: number
  chapterId: number | null
  stage: ConceptsStage
  conceptsCount?: number
}

const api = {
  // Settings
  hasApiKey: (): Promise<boolean> => ipcRenderer.invoke('settings:has-api-key'),
  getModel: (): Promise<string> => ipcRenderer.invoke('settings:get-model'),
  getModels: (): Promise<ChatModel[]> => ipcRenderer.invoke('settings:get-models'),
  setModel: (model: string): Promise<boolean> => ipcRenderer.invoke('settings:set-model', model),
  validateKey: (key: string): Promise<boolean> => ipcRenderer.invoke('settings:validate-key', key),
  saveKey: (key: string): Promise<boolean> => ipcRenderer.invoke('settings:save-key', key),
  // Test-only: Set API key without validation
  setKeyTest: (key: string): Promise<boolean> => ipcRenderer.invoke('settings:set-key-test', key),
  getMaskedKey: (): Promise<string | null> => ipcRenderer.invoke('settings:get-key-masked'),

  // PDFs
  uploadPdf: (): Promise<{ pdfId: number; duplicate: boolean; existingPdfId?: number } | { error: string } | null> =>
    ipcRenderer.invoke('pdf:upload'),
  uploadPdfWithPassword: (
    filePath: string,
    password: string
  ): Promise<{ pdfId: number } | { error: string }> =>
    ipcRenderer.invoke('pdf:upload-with-password', filePath, password),
  // Test-only: Direct file upload
  uploadPdfFile: (
    filePath: string
  ): Promise<{ pdfId: number; duplicate: boolean; existingPdfId?: number } | { error: string }> =>
    ipcRenderer.invoke('pdf:upload-file', filePath),
  // Test-only: Get conversation history stats
  getHistoryStats: (
    pdfId: number,
    chapterId: number | null
  ): Promise<{
    messageCount: number
    totalTokens: number
    cachedSummary: string | null
    isCompacted: boolean
    summarizedCount: number
  }> => ipcRenderer.invoke('chat:test-history-stats', pdfId, chapterId),
  // Test-only: Build conversation history
  buildHistory: (
    pdfId: number,
    chapterId: number | null
  ): Promise<{ history: string } | { error: string }> =>
    ipcRenderer.invoke('chat:test-build-history', pdfId, chapterId),
  // Test-only: Set chapter summary directly
  setChapterSummary: (chapterId: number, summary: string): Promise<boolean> =>
    ipcRenderer.invoke('chat:test-set-chapter-summary', chapterId, summary),
  // Test-only: Set PDF status directly (bypasses embedding)
  setPdfStatusTest: (pdfId: number, status: string): Promise<{ success: boolean } | { error: string }> =>
    ipcRenderer.invoke('pdf:set-status-test', pdfId, status),
  listPdfs: (): Promise<{ id: number; filename: string; status: string; created_at: string; title: string | null }[]> =>
    ipcRenderer.invoke('pdf:list'),
  getPdf: (id: number): Promise<Pdf | undefined> => ipcRenderer.invoke('pdf:get', id),
  deletePdf: (id: number): Promise<boolean> => ipcRenderer.invoke('pdf:delete', id),
  cancelPdfProcessing: (id: number): Promise<boolean> => ipcRenderer.invoke('pdf:cancel', id),
  openPdf: (pdfId: number): Promise<{ success: boolean } | { error: string }> =>
    ipcRenderer.invoke('pdf:open', pdfId),
  openChapter: (chapterId: number): Promise<{ success: boolean; page?: number } | { error: string }> =>
    ipcRenderer.invoke('pdf:open-chapter', chapterId),

  // Chapters
  listChapters: (pdfId: number): Promise<Chapter[]> => ipcRenderer.invoke('chapter:list', pdfId),

  // Chat
  sendMessage: (pdfId: number, chapterId: number | null, message: string): Promise<boolean> =>
    ipcRenderer.invoke('chat:send', pdfId, chapterId, message),
  getChatHistory: (pdfId: number, chapterId: number | null): Promise<ChatMessage[]> =>
    ipcRenderer.invoke('chat:history', pdfId, chapterId),
  saveMessage: (pdfId: number, chapterId: number | null, role: 'user' | 'assistant', content: string, metadata?: object): Promise<number> =>
    ipcRenderer.invoke('chat:save-message', pdfId, chapterId, role, content, metadata),

  // Slash commands
  getChapterSummary: (chapterId: number): Promise<SlashSummaryResult> =>
    ipcRenderer.invoke('slash:get-summary', chapterId),
  getPdfMetadata: (pdfId: number): Promise<SlashMetadataResult> =>
    ipcRenderer.invoke('slash:get-metadata', pdfId),

  // Concepts
  getChapterConcepts: (chapterId: number): Promise<ConceptsResult> =>
    ipcRenderer.invoke('concepts:get-chapter', chapterId),
  getDocumentConcepts: (pdfId: number, consolidatedOnly: boolean = true): Promise<ConceptsResult> =>
    ipcRenderer.invoke('concepts:get-pdf', pdfId, consolidatedOnly),

  // Quiz
  generateQuiz: (pdfId: number, chapterId: number | null): Promise<QuizResult> =>
    ipcRenderer.invoke('quiz:generate', pdfId, chapterId),

  // Event listeners
  onChatStream: (callback: (chunk: string) => void) => {
    const listener = (_: unknown, chunk: string) => callback(chunk)
    ipcRenderer.on('chat:stream', listener)
    return () => ipcRenderer.removeListener('chat:stream', listener)
  },
  onChatDone: (callback: (metadata: ChatMessage['metadata']) => void) => {
    const listener = (_: unknown, metadata: ChatMessage['metadata']) => callback(metadata)
    ipcRenderer.on('chat:done', listener)
    return () => ipcRenderer.removeListener('chat:done', listener)
  },
  onChapterProgress: (callback: (data: ChapterProgress) => void) => {
    const listener = (_: unknown, data: ChapterProgress) => callback(data)
    ipcRenderer.on('chapter:progress', listener)
    return () => ipcRenderer.removeListener('chapter:progress', listener)
  },
  onChapterAdded: (callback: (data: { pdfId: number; chapter: Chapter }) => void) => {
    const listener = (_: unknown, data: { pdfId: number; chapter: Chapter }) => callback(data)
    ipcRenderer.on('chapter:added', listener)
    return () => ipcRenderer.removeListener('chapter:added', listener)
  },
  onConceptsProgress: (callback: (data: ConceptsProgress) => void) => {
    const listener = (_: unknown, data: ConceptsProgress) => callback(data)
    ipcRenderer.on('concepts:progress', listener)
    return () => ipcRenderer.removeListener('concepts:progress', listener)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type API = typeof api
