import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'
import { useChat } from '@/hooks/useChat'
import { FileText, Upload, Loader2, BookOpen } from 'lucide-react'

type ProcessingStage = 'extracting' | 'chunking' | 'embedding'

interface Progress {
  progress: number
  stage: ProcessingStage
  chunksTotal?: number
  chunksProcessed?: number
  embeddingsTotal?: number
  embeddingsProcessed?: number
}

const STAGE_LABELS: Record<ProcessingStage, string> = {
  extracting: 'Extracting text',
  chunking: 'Creating chunks',
  embedding: 'Generating embeddings'
}

function formatProgressDetails(progress: Progress): string {
  const { stage, progress: percent, chunksTotal, chunksProcessed, embeddingsTotal, embeddingsProcessed } = progress

  if (stage === 'chunking' && chunksTotal !== undefined) {
    return `${STAGE_LABELS[stage]} (${chunksProcessed ?? 0}/${chunksTotal}) - ${percent}%`
  }

  if (stage === 'embedding' && embeddingsTotal !== undefined) {
    return `${STAGE_LABELS[stage]} (${embeddingsProcessed ?? 0}/${embeddingsTotal}) - ${percent}%`
  }

  return `${STAGE_LABELS[stage]} - ${percent}%`
}

interface ChatContainerProps {
  pdfId: number | null
  chapterId: number | null
  chapterTitle?: string
  status?: string
  progress?: Progress
  onUpload: () => void
}

export function ChatContainer({ pdfId, chapterId, chapterTitle, status, progress, onUpload }: ChatContainerProps) {
  const { messages, isStreaming, streamingContent, sendMessage } = useChat(pdfId, chapterId)

  if (!pdfId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8">
        <FileText className="h-16 w-16 mb-4 opacity-20" />
        <h2 className="text-xl font-medium mb-2">No PDF Selected</h2>
        <p className="text-sm mb-4">Upload a PDF to start chatting</p>
        <button
          onClick={onUpload}
          className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Upload className="h-4 w-4" />
          Upload PDF
        </button>
      </div>
    )
  }

  const isProcessing = status === 'processing' || status === 'pending'
  const hasError = status === 'error'
  const isChapterView = chapterId !== null

  return (
    <div className="flex-1 flex flex-col">
      {/* Chapter header */}
      {isChapterView && chapterTitle && (
        <div className="p-3 border-b flex items-center gap-2 bg-muted/30">
          <BookOpen className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{chapterTitle}</span>
        </div>
      )}
      {isProcessing && (
        <div className="p-4 bg-muted/50 border-b flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>
            {progress ? formatProgressDetails(progress) : 'Processing...'}
          </span>
        </div>
      )}
      {hasError && (
        <div className="p-4 bg-destructive/10 border-b text-sm text-destructive">
          Error processing. Please delete and try again.
        </div>
      )}
      <MessageList messages={messages} streamingContent={streamingContent} isStreaming={isStreaming} />
      <ChatInput
        onSend={sendMessage}
        disabled={isStreaming || isProcessing || hasError}
        placeholder={
          isProcessing
            ? 'Processing...'
            : isChapterView
              ? `Ask a question about "${chapterTitle}"...`
              : 'Ask a question about this PDF...'
        }
      />
    </div>
  )
}
