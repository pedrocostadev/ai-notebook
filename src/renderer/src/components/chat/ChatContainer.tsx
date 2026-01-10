import { useState, useCallback } from 'react'
import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'
import { ChapterSelectModal } from './ChapterSelectModal'
import { useChat } from '@/hooks/useChat'
import { FileText, Upload, Loader2, Hash, ExternalLink, CheckCircle } from 'lucide-react'
import type { SlashCommand } from './SlashCommandMenu'
import type { Chapter } from '../../../../preload'

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
  chapters?: Chapter[]
  status?: string
  progress?: Progress
  isUploading?: boolean
  onUpload: () => void
}

const COMMAND_LOADING_MESSAGES: Record<string, string> = {
  '/test-my-knowledge': 'Generating quiz questions...',
  '/summary': 'Loading summary...',
  '/book_meta_data': 'Loading metadata...',
  '/key-concepts': 'Loading key concepts...'
}

export function ChatContainer({ pdfId, chapterId, chapterTitle, chapters, status, progress, isUploading, onUpload }: ChatContainerProps) {
  const { messages, isStreaming, streamingContent, sendMessage, reloadHistory } = useChat(pdfId, chapterId)
  const [showChapterSelect, setShowChapterSelect] = useState(false)
  const [pendingCommand, setPendingCommand] = useState<SlashCommand | null>(null)
  const [isExecutingCommand, setIsExecutingCommand] = useState(false)
  const [commandLoadingMessage, setCommandLoadingMessage] = useState<string | null>(null)

  const handleOpenPdf = useCallback(async () => {
    if (!pdfId) return
    await window.api.openPdf(pdfId)
  }, [pdfId])

  const handleOpenChapter = useCallback(async () => {
    if (!chapterId) return
    await window.api.openChapter(chapterId)
  }, [chapterId])

  // Helper to save command interaction and reload
  // Always save to current view context (chapterId), not target chapter
  const saveCommandResult = useCallback(async (command: string, result: string, _targetChapterId?: number, metadata?: object) => {
    if (!pdfId) return
    await window.api.saveMessage(pdfId, chapterId, 'assistant', result, metadata)
    reloadHistory()
  }, [pdfId, chapterId, reloadHistory])

  // Save user command immediately for feedback
  // Always save to current view context (chapterId), not target chapter
  const saveUserCommand = useCallback(async (command: string, _targetChapterId?: number) => {
    if (!pdfId) return
    await window.api.saveMessage(pdfId, chapterId, 'user', command)
    reloadHistory()
  }, [pdfId, chapterId, reloadHistory])

  const executeCommand = useCallback(async (command: SlashCommand, targetChapterId?: number) => {
    if (!pdfId) return

    // Handle chapter select modal case - don't show loading yet
    if (command.name === '/summary') {
      const chapterToUse = targetChapterId ?? chapterId
      if (chapterToUse === null) {
        setPendingCommand(command)
        setShowChapterSelect(true)
        return
      }
    }

    // Show loading state
    const loadingMessage = COMMAND_LOADING_MESSAGES[command.name] || 'Processing...'
    setIsExecutingCommand(true)
    setCommandLoadingMessage(loadingMessage)

    // Save user command immediately for feedback
    await saveUserCommand(command.name, targetChapterId)

    try {
      if (command.name === '/summary') {
        const chapterToUse = targetChapterId ?? chapterId
        const result = await window.api.getChapterSummary(chapterToUse!)
        if ('summary' in result) {
          await saveCommandResult(command.name, result.summary, chapterToUse!)
        } else if ('empty' in result) {
          await saveCommandResult(command.name, 'This chapter doesn\'t have enough content to generate a summary (e.g., preface, acknowledgments, or table of contents).', chapterToUse!)
        } else if ('pending' in result) {
          await saveCommandResult(command.name, 'Summary is still being generated. Please try again later.', chapterToUse!)
        } else {
          await saveCommandResult(command.name, `Error: ${result.error}`, chapterToUse!)
        }
      } else if (command.name === '/book_meta_data') {
        const result = await window.api.getPdfMetadata(pdfId)
        if ('metadata' in result) {
          const meta = result.metadata
          const lines = [
            `**Title:** ${meta.title ?? 'Not found'}`,
            `**Author:** ${meta.author ?? 'Not found'}`,
            `**Publisher:** ${meta.publisher ?? 'Not found'}`,
            `**Publish Date:** ${meta.publishDate ?? 'Not found'}`,
            `**ISBN:** ${meta.isbn ?? 'Not found'}`,
            `**Edition:** ${meta.edition ?? 'Not found'}`,
            `**Language:** ${meta.language ?? 'Not found'}`,
            `**Subject:** ${meta.subject ?? 'Not found'}`
          ]
          await saveCommandResult(command.name, lines.join('\n'))
        } else if ('pending' in result) {
          await saveCommandResult(command.name, 'Metadata is still being extracted. Please try again later.')
        } else {
          await saveCommandResult(command.name, `Error: ${result.error}`)
        }
      } else if (command.name === '/key-concepts') {
        const chapterToUse = targetChapterId ?? chapterId
        if (chapterToUse === null) {
          // In main channel, show consolidated PDF concepts
          const result = await window.api.getDocumentConcepts(pdfId, true)
          if ('concepts' in result) {
            if (result.concepts.length === 0) {
              await saveCommandResult(command.name, 'No key concepts have been extracted for this document yet.')
            } else {
              // Store concepts in metadata for rich UI rendering
              const concepts = result.concepts.map((c) => ({
                name: c.name,
                definition: c.definition,
                importance: c.importance,
                quotes: c.quotes
              }))
              await saveCommandResult(command.name, '', undefined, { concepts, isDocumentLevel: true })
            }
          } else if ('pending' in result) {
            await saveCommandResult(command.name, 'Key concepts are still being extracted. Please try again later.')
          } else {
            await saveCommandResult(command.name, `Error: ${result.error}`)
          }
        } else {
          // Chapter-specific concepts
          const result = await window.api.getChapterConcepts(chapterToUse)
          if ('concepts' in result) {
            if (result.concepts.length === 0) {
              await saveCommandResult(command.name, 'This chapter doesn\'t contain key concepts to extract (e.g., preface, acknowledgments, or index).', chapterToUse)
            } else {
              // Store concepts in metadata for rich UI rendering
              const concepts = result.concepts.map((c) => ({
                name: c.name,
                definition: c.definition,
                importance: c.importance,
                quotes: c.quotes
              }))
              await saveCommandResult(command.name, '', chapterToUse, { concepts, isDocumentLevel: false })
            }
          } else if ('pending' in result) {
            await saveCommandResult(command.name, 'Key concepts are still being extracted. Please try again later.', chapterToUse)
          } else {
            await saveCommandResult(command.name, `Error: ${result.error}`, chapterToUse)
          }
        }
      } else if (command.name === '/test-my-knowledge') {
        const chapterToUse = targetChapterId ?? chapterId
        const result = await window.api.generateQuiz(pdfId, chapterToUse)

        if ('questions' in result) {
          await saveCommandResult(
            command.name,
            '', // Empty content, quiz is in metadata
            chapterToUse ?? undefined,
            { quiz: result.questions }
          )
        } else if ('empty' in result) {
          await saveCommandResult(
            command.name,
            'This chapter doesn\'t have key concepts to generate a quiz from (e.g., preface, acknowledgments, or index).',
            chapterToUse ?? undefined
          )
        } else if ('pending' in result) {
          await saveCommandResult(
            command.name,
            'Key concepts are still being extracted. Please try again later.',
            chapterToUse ?? undefined
          )
        } else {
          await saveCommandResult(command.name, `Error: ${result.error}`, chapterToUse ?? undefined)
        }
      }
    } finally {
      setIsExecutingCommand(false)
      setCommandLoadingMessage(null)
    }
  }, [pdfId, chapterId, saveCommandResult, saveUserCommand])

  const handleSlashCommand = useCallback((command: SlashCommand) => {
    executeCommand(command)
  }, [executeCommand])

  const handleChapterSelect = useCallback((selectedChapterId: number) => {
    setShowChapterSelect(false)
    if (pendingCommand) {
      executeCommand(pendingCommand, selectedChapterId)
      setPendingCommand(null)
    }
  }, [pendingCommand, executeCommand])

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
              <h2 className="text-lg font-semibold text-foreground mb-2">Uploading PDF...</h2>
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
              Upload a PDF to start chatting with your documents using AI
            </p>
            <button
              onClick={onUpload}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 font-medium text-sm transition-colors shadow-sm"
            >
              <Upload className="h-4 w-4" />
              Upload PDF
            </button>
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
    return 'Ask a question about this PDF...'
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
            <button
              data-testid="open-chapter-btn"
              onClick={handleOpenChapter}
              className="titlebar-no-drag flex items-center gap-1.5 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
              title="Open in PDF viewer"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span>Open</span>
            </button>
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
            title="Open PDF in viewer"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span>Open PDF</span>
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
}
