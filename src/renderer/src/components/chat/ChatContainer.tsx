import { useState, useCallback } from 'react'
import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'
import { ChapterSelectModal } from './ChapterSelectModal'
import { useChat } from '@/hooks/useChat'
import { FileText, Upload, Loader2, BookOpen } from 'lucide-react'
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
  onUpload: () => void
}

const COMMAND_LOADING_MESSAGES: Record<string, string> = {
  '/test-my-knowledge': 'Generating quiz questions...',
  '/summary': 'Loading summary...',
  '/book_meta_data': 'Loading metadata...',
  '/key-concepts': 'Loading key concepts...'
}

export function ChatContainer({ pdfId, chapterId, chapterTitle, chapters, status, progress, onUpload }: ChatContainerProps) {
  const { messages, isStreaming, streamingContent, sendMessage, reloadHistory } = useChat(pdfId, chapterId)
  const [showChapterSelect, setShowChapterSelect] = useState(false)
  const [pendingCommand, setPendingCommand] = useState<SlashCommand | null>(null)
  const [isExecutingCommand, setIsExecutingCommand] = useState(false)
  const [commandLoadingMessage, setCommandLoadingMessage] = useState<string | null>(null)

  // Helper to save command interaction and reload
  const saveCommandResult = useCallback(async (command: string, result: string, targetChapterId?: number, metadata?: object) => {
    if (!pdfId) return
    const effectiveChapterId = targetChapterId ?? chapterId
    // User message already saved before execution, just save assistant response
    await window.api.saveMessage(pdfId, effectiveChapterId, 'assistant', result, metadata)
    reloadHistory()
  }, [pdfId, chapterId, reloadHistory])

  // Save user command immediately for feedback
  const saveUserCommand = useCallback(async (command: string, targetChapterId?: number) => {
    if (!pdfId) return
    const effectiveChapterId = targetChapterId ?? chapterId
    await window.api.saveMessage(pdfId, effectiveChapterId, 'user', command)
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
              const lines = ['## Key Concepts (Document-wide)', '']
              for (const concept of result.concepts) {
                const stars = '★'.repeat(concept.importance) + '☆'.repeat(5 - concept.importance)
                lines.push(`### ${concept.name}`)
                lines.push(`**Importance:** ${stars}`)
                lines.push('')
                lines.push(concept.definition)
                if (concept.quotes.length > 0) {
                  lines.push('')
                  lines.push('**Supporting quotes:**')
                  for (const q of concept.quotes) {
                    const source = q.chapterTitle ? ` *(${q.chapterTitle})*` : ''
                    lines.push(`> "${q.text}"${source}`)
                  }
                }
                lines.push('')
                lines.push('---')
                lines.push('')
              }
              await saveCommandResult(command.name, lines.join('\n'))
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
              const lines = ['## Key Concepts', '']
              for (const concept of result.concepts) {
                const stars = '★'.repeat(concept.importance) + '☆'.repeat(5 - concept.importance)
                lines.push(`### ${concept.name}`)
                lines.push(`**Importance:** ${stars}`)
                lines.push('')
                lines.push(concept.definition)
                if (concept.quotes.length > 0) {
                  lines.push('')
                  lines.push('**Supporting quotes:**')
                  for (const q of concept.quotes) {
                    const pageInfo = q.pageEstimate ? ` *(p. ${q.pageEstimate})*` : ''
                    lines.push(`> "${q.text}"${pageInfo}`)
                  }
                }
                lines.push('')
                lines.push('---')
                lines.push('')
              }
              await saveCommandResult(command.name, lines.join('\n'), chapterToUse)
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
      <MessageList
        messages={messages}
        streamingContent={streamingContent}
        isStreaming={isStreaming}
        commandLoading={commandLoadingMessage}
      />
      <ChatInput
        onSend={sendMessage}
        onSlashCommand={handleSlashCommand}
        disabled={isStreaming || isProcessing || hasError || isExecutingCommand}
        placeholder={
          isExecutingCommand
            ? commandLoadingMessage || 'Processing...'
            : isProcessing
              ? 'Processing...'
            : isChapterView
              ? `Ask a question about "${chapterTitle}"...`
              : 'Ask a question about this PDF...'
        }
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
