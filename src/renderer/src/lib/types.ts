// Shared types used across components

export type ProcessingStage = 'extracting' | 'chunking' | 'embedding'

export interface ChapterProgress {
  progress: number
  stage: ProcessingStage
  chunksTotal?: number
  chunksProcessed?: number
  embeddingsTotal?: number
  embeddingsProcessed?: number
}

export interface ChapterProgressState {
  [chapterId: number]: ChapterProgress
}

export const STAGE_LABELS: Record<ProcessingStage, string> = {
  extracting: 'Extracting',
  chunking: 'Chunking',
  embedding: 'Embedding'
}

export function formatProgressDetails(progress: ChapterProgress): string {
  const { stage, progress: percent, chunksTotal, chunksProcessed, embeddingsTotal, embeddingsProcessed } = progress

  if (stage === 'chunking' && chunksTotal !== undefined) {
    return `${STAGE_LABELS[stage]} (${chunksProcessed ?? 0}/${chunksTotal}) - ${percent}%`
  }

  if (stage === 'embedding' && embeddingsTotal !== undefined) {
    return `${STAGE_LABELS[stage]} (${embeddingsProcessed ?? 0}/${embeddingsTotal}) - ${percent}%`
  }

  return `${STAGE_LABELS[stage]} - ${percent}%`
}

// Chat message types
export interface Citation {
  chunkId: number
  pageStart: number
  pageEnd: number
  quote: string
}

export interface QuizQuestion {
  question: string
  options: string[]
  correctIndex: number
  explanation: string
  conceptName: string
}

export interface ConceptQuote {
  text: string
  pageEstimate?: number
  chapterTitle?: string
}

export interface Concept {
  name: string
  definition: string
  importance: number
  quotes: ConceptQuote[]
}

export interface ChatMessageMetadata {
  citations?: Citation[]
  followUpQuestions?: string[]
  quiz?: QuizQuestion[]
  quizAnswers?: (number | null)[]
  concepts?: Concept[]
  isDocumentLevel?: boolean
}

export interface ChatMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
  metadata: ChatMessageMetadata | null
}
