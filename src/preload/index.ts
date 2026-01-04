import { contextBridge, ipcRenderer } from 'electron'

export type ChatMessage = {
  id: number
  role: 'user' | 'assistant'
  content: string
  metadata: {
    citations?: { chunkId: number; quote: string }[]
    confidence?: 'high' | 'medium' | 'low'
    followUpQuestions?: string[]
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
  listPdfs: (): Promise<{ id: number; filename: string; status: string; created_at: string }[]> =>
    ipcRenderer.invoke('pdf:list'),
  getPdf: (id: number): Promise<Pdf | undefined> => ipcRenderer.invoke('pdf:get', id),
  deletePdf: (id: number): Promise<boolean> => ipcRenderer.invoke('pdf:delete', id),
  cancelPdfProcessing: (id: number): Promise<boolean> => ipcRenderer.invoke('pdf:cancel', id),

  // Chapters
  listChapters: (pdfId: number): Promise<Chapter[]> => ipcRenderer.invoke('chapter:list', pdfId),

  // Chat
  sendMessage: (pdfId: number, chapterId: number | null, message: string): Promise<boolean> =>
    ipcRenderer.invoke('chat:send', pdfId, chapterId, message),
  getChatHistory: (pdfId: number, chapterId: number | null): Promise<ChatMessage[]> =>
    ipcRenderer.invoke('chat:history', pdfId, chapterId),

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
  }
}

contextBridge.exposeInMainWorld('api', api)

export type API = typeof api
