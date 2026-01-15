import { useCallback, memo } from 'react'
import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'
import { ChapterSelectModal } from './ChapterSelectModal'
import { useChat } from '@/hooks/useChat'
import { useCommandExecution } from '@/hooks/useCommandExecution'
import { FileText, Upload, Loader2, Hash, ExternalLink, CheckCircle } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { SlashCommand } from './SlashCommandMenu'
import type { Chapter } from '../../../../preload'
import { type ChapterProgress, formatProgressDetails } from '@/lib/types'

interface ChatContainerProps {
  pdfId: number | null
  chapterId: number | null
  chapterTitle?: string
  chapters?: Chapter[]
  status?: string
  progress?: ChapterProgress
  isUploading?: boolean
  onUpload: () => void
}

export const ChatContainer = memo(function ChatContainer({ pdfId, chapterId, chapterTitle, chapters, status, progress, isUploading, onUpload }: ChatContainerProps) {
  const { messages, isStreaming, streamingContent, sendMessage, reloadHistory } = useChat(pdfId, chapterId)
  const {
    isExecuting: isExecutingCommand,
    loadingMessage: commandLoadingMessage,
    showChapterSelect,
    setShowChapterSelect,
    executeCommand,
    handleChapterSelect
  } = useCommandExecution({ pdfId, chapterId, onReloadHistory: reloadHistory })

  const handleOpenPdf = useCallback(async () => {
    if (!pdfId) return
    await window.api.openPdf(pdfId)
  }, [pdfId])

  const handleOpenChapter = useCallback(async () => {
    if (!chapterId) return
    await window.api.openChapter(chapterId)
  }, [chapterId])

  const handleSlashCommand = useCallback((command: SlashCommand) => {
    executeCommand(command)
  }, [executeCommand])

  if (!pdfId) {
    if (isUploading) {
      return (
        <div className="flex-1 flex flex-col bg-background">
          <div className="titlebar-drag h-12 shrink-0" />
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8">
            <div className="flex flex-col items-center max-w-sm text-center">
              <div className="mb-6 p-5 rounded-2xl bg-muted/60">
                <Loader2 className="h-10 w-10 text-primary animate-spin" />
              </div>
              <h2 className="text-lg font-semibold text-foreground mb-2">Uploading...</h2>
              <p className="text-sm text-muted-foreground">Please wait while we process your file</p>
            </div>
          </div>
        </div>
      )
    }
    return (
      <div className="flex-1 flex flex-col bg-background">
        <div className="titlebar-drag h-12 shrink-0" />
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8">
          <div className="flex flex-col items-center max-w-md text-center">
            <div className="mb-6 p-5 rounded-2xl bg-muted/60">
              <FileText className="h-10 w-10 text-muted-foreground/60" />
            </div>
            <h2 className="text-lg font-semibold text-foreground mb-2">No document selected</h2>
            <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
              Upload a document to start chatting with AI
            </p>
            <button
              onClick={onUpload}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 font-medium text-sm transition-colors shadow-sm"
            >
              <Upload className="h-4 w-4" />
              Upload
            </button>
            <p className="text-xs text-muted-foreground mt-3">Supported: PDF</p>
          </div>
        </div>
      </div>
    )
  }

  const isProcessing = status === 'processing' || status === 'pending'
  const hasError = status === 'error'
  const isChapterView = chapterId !== null

  // Calculate chapter processing progress for main PDF view
  const totalChapters = chapters?.length ?? 0
  const doneChapters = chapters?.filter(c => c.status === 'done').length ?? 0
  const processingChapterIndex = doneChapters + 1 // 1-indexed for display

  function getPlaceholder(): string {
    if (isExecutingCommand) return commandLoadingMessage || 'Processing...'
    if (isProcessing) return 'Processing...'
    if (isChapterView) return `Ask a question about "${chapterTitle}"...`
    return 'Ask a question about this document...'
  }

  const isDone = status === 'done'

  const showHeader = (isChapterView && chapterTitle) || (!isChapterView && isDone)

  return (
    <div className="flex-1 flex flex-col bg-background">
      {/* Chapter header */}
      {isChapterView && chapterTitle && (
        <div data-testid="chapter-header" className="titlebar-drag px-4 pt-7 pb-3 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Hash className="h-4 w-4 text-muted-foreground" />
            <span data-testid="chapter-title" className="text-sm font-semibold">{chapterTitle}</span>
          </div>
          {isDone && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  data-testid="open-chapter-btn"
                  onClick={handleOpenChapter}
                  className="titlebar-no-drag flex items-center gap-1.5 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>Open</span>
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Open current chapter in PDF</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      )}
      {/* PDF header (main chat view, not chapter) */}
      {!isChapterView && isDone && (
        <div data-testid="pdf-header" className="titlebar-drag px-4 pt-7 pb-3 border-b flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-[var(--color-success)]">
            <CheckCircle className="h-4 w-4" />
            <span className="font-medium">Ready to chat</span>
          </div>
          <button
            data-testid="open-pdf-btn"
            onClick={handleOpenPdf}
            className="titlebar-no-drag flex items-center gap-1.5 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
            title="Open in viewer"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span>Open</span>
          </button>
        </div>
      )}
      {/* Fallback titlebar when no header visible */}
      {!showHeader && <div className="titlebar-drag h-12 shrink-0" />}
      {isProcessing && (
        <div data-testid="processing-indicator" className="px-4 py-3 bg-muted/40 border-b flex items-center gap-3 text-sm">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span className="text-muted-foreground">
            {isChapterView
              ? (progress ? formatProgressDetails(progress) : 'Processing...')
              : (totalChapters > 0
                  ? `Processing chapter ${processingChapterIndex} of ${totalChapters}`
                  : 'Processing...')}
          </span>
        </div>
      )}
      {hasError && (
        <div className="px-4 py-3 bg-destructive/10 border-b text-sm text-destructive font-medium">
          Error processing. Please delete and try again.
        </div>
      )}
      <MessageList
        messages={messages}
        streamingContent={streamingContent}
        isStreaming={isStreaming}
        commandLoading={commandLoadingMessage}
        onFollowUpClick={sendMessage}
        isChapterLoading={isChapterView && isProcessing}
        chapterTitle={chapterTitle}
        pdfId={pdfId}
        chapterId={chapterId}
      />
      <ChatInput
        onSend={sendMessage}
        onSlashCommand={handleSlashCommand}
        disabled={isStreaming || isProcessing || hasError || isExecutingCommand}
        placeholder={getPlaceholder()}
        pdfId={pdfId}
        chapterId={chapterId}
      />
      <ChapterSelectModal
        open={showChapterSelect}
        onOpenChange={setShowChapterSelect}
        chapters={chapters ?? []}
        onSelect={handleChapterSelect}
      />
    </div>
  )
})
