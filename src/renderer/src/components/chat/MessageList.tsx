import { useEffect, useRef, useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { QuizMessage, type QuizQuestion } from './QuizMessage'
import { KeyConceptsMessage, type Concept } from './KeyConceptsMessage'
import { MessageSquareText, BookOpen, Loader2, History, ChevronDown, ChevronUp } from 'lucide-react'

interface ChatMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
  metadata: {
    citations?: { chunkId: number; pageStart: number; pageEnd: number; quote: string }[]
    confidence?: 'high' | 'medium' | 'low'
    followUpQuestions?: string[]
    quiz?: QuizQuestion[]
    concepts?: Concept[]
    isDocumentLevel?: boolean
  } | null
}

interface MessageListProps {
  messages: ChatMessage[]
  streamingContent: string
  isStreaming: boolean
  commandLoading?: string | null
  onFollowUpClick?: (question: string) => void
  isChapterLoading?: boolean
  chapterTitle?: string
  pdfId?: number | null
  chapterId?: number | null
}

const CONFIDENCE_COLORS: Record<string, string> = {
  high: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  low: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
}

export function MessageList({ messages, streamingContent, isStreaming, commandLoading, onFollowUpClick, isChapterLoading, chapterTitle, pdfId, chapterId }: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [compactionInfo, setCompactionInfo] = useState<{ isCompacted: boolean; summarizedCount: number; summary: string | null } | null>(null)
  const [showSummary, setShowSummary] = useState(false)

  // Fetch compaction info in dev mode
  useEffect(() => {
    if (!import.meta.env.DEV || !pdfId) {
      setCompactionInfo(null)
      return
    }

    const fetchStats = async () => {
      try {
        const stats = await window.api.getHistoryStats(pdfId, chapterId ?? null)
        setCompactionInfo({ isCompacted: stats.isCompacted, summarizedCount: stats.summarizedCount, summary: stats.cachedSummary })
      } catch {
        setCompactionInfo(null)
      }
    }

    fetchStats()
  }, [pdfId, chapterId, messages.length])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, streamingContent, commandLoading])

  function renderConfidenceBadge(confidence: string) {
    return (
      <span className={cn('text-xs px-2 py-0.5 rounded-full', CONFIDENCE_COLORS[confidence])}>
        {confidence} confidence
      </span>
    )
  }

  const isEmpty = messages.length === 0 && !isStreaming && !commandLoading
  const showLoadingState = isEmpty && isChapterLoading

  return (
    <ScrollArea className="flex-1 p-4" viewportRef={scrollRef}>
      {showLoadingState ? (
        <div className="h-full flex flex-col items-center justify-center text-muted-foreground py-16">
          <div className="relative">
            <BookOpen className="h-16 w-16 mb-4 opacity-20" />
            <Loader2 className="h-6 w-6 absolute -bottom-1 -right-1 animate-spin text-primary" />
          </div>
          <h3 className="text-lg font-medium mb-2">Preparing chapter</h3>
          <p className="text-sm text-center max-w-xs">
            {chapterTitle ? (
              <>Processing "<span className="font-medium">{chapterTitle}</span>"...</>
            ) : (
              'Extracting text and generating embeddings...'
            )}
          </p>
          <p className="text-xs text-muted-foreground/70 mt-2">
            This may take a moment for longer chapters
          </p>
        </div>
      ) : isEmpty ? (
        <div className="h-full flex flex-col items-center justify-center text-muted-foreground py-16">
          <MessageSquareText className="h-16 w-16 mb-4 opacity-20" />
          <h3 className="text-lg font-medium mb-2">Start a conversation</h3>
          <p className="text-sm text-center max-w-xs">
            Ask a question about this document or use a slash command like /summary or /key-concepts
          </p>
        </div>
      ) : (
      <div className="space-y-4 max-w-3xl mx-auto">
        {messages.map((message, index) => {
          const showCompactionDivider = compactionInfo?.isCompacted && index === compactionInfo.summarizedCount
          const hasQuiz = message.metadata?.quiz && message.metadata.quiz.length > 0
          const hasConcepts = message.metadata?.concepts && message.metadata.concepts.length > 0
          const isWideMessage = hasQuiz || hasConcepts

          return (
            <div key={message.id}>
              {showCompactionDivider && (
                <div className="mb-4">
                  <div className="flex items-center gap-3 py-2">
                    <div className="flex-1 border-t border-dashed border-muted-foreground/30" />
                    <button
                      onClick={() => setShowSummary(!showSummary)}
                      className="text-xs text-muted-foreground flex items-center gap-1.5 hover:text-foreground transition-colors"
                    >
                      <History className="h-3 w-3" />
                      above summarized
                      {showSummary ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>
                    <div className="flex-1 border-t border-dashed border-muted-foreground/30" />
                  </div>
                  {showSummary && (
                    <div className="mt-2 p-3 rounded-md bg-muted/50 text-xs text-muted-foreground italic">
                      {compactionInfo?.summary || 'Summary will be generated on next chat message'}
                    </div>
                  )}
                </div>
              )}
              <div className={cn('flex', message.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'rounded-lg px-4 py-2',
                  isWideMessage ? 'max-w-[95%] w-full' : 'max-w-[80%]',
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted'
                )}
                data-testid={`message-${message.role}`}
              >
                {hasQuiz ? (
                  <QuizMessage questions={message.metadata!.quiz!} />
                ) : hasConcepts ? (
                  <KeyConceptsMessage
                    concepts={message.metadata!.concepts!}
                    isDocumentLevel={message.metadata!.isDocumentLevel}
                  />
                ) : (
                  <>
                    <p className="whitespace-pre-wrap">{message.content}</p>
                    {message.metadata && message.role === 'assistant' && (
                      <div className="mt-2 pt-2 border-t border-border/50 space-y-2">
                        {message.metadata.confidence && renderConfidenceBadge(message.metadata.confidence)}
                        {message.metadata.citations && message.metadata.citations.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-xs font-medium">Sources:</p>
                            {message.metadata.citations.map((citation, i) => (
                              <blockquote key={i} className="text-xs italic border-l-2 pl-2 text-muted-foreground">
                                <span className="not-italic font-medium">
                                  {citation.pageStart === citation.pageEnd
                                    ? `p. ${citation.pageStart}`
                                    : `pp. ${citation.pageStart}-${citation.pageEnd}`}
                                  :
                                </span>{' '}
                                "{citation.quote}"
                              </blockquote>
                            ))}
                          </div>
                        )}
                        {message.metadata.followUpQuestions && message.metadata.followUpQuestions.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-xs font-medium">Follow-up questions:</p>
                            <div className="flex flex-wrap gap-2">
                              {message.metadata.followUpQuestions.map((q, i) => (
                                <button
                                  key={i}
                                  onClick={() => onFollowUpClick?.(q)}
                                  className="text-xs text-left px-3 py-1.5 rounded-full bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 transition-colors cursor-pointer"
                                >
                                  {q}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
              </div>
            </div>
          )
        })}
        {isStreaming && streamingContent && (
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-lg px-4 py-2 bg-muted">
              <p className="whitespace-pre-wrap">{streamingContent}</p>
              <span className="inline-block w-2 h-4 bg-foreground/50 animate-pulse ml-1" />
            </div>
          </div>
        )}
        {commandLoading && (
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-lg px-4 py-3 bg-muted flex items-center gap-2">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce [animation-delay:-0.3s]" />
                <span className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce [animation-delay:-0.15s]" />
                <span className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce" />
              </div>
              <span className="text-sm text-muted-foreground">{commandLoading}</span>
            </div>
          </div>
        )}
      </div>
      )}
    </ScrollArea>
  )
}
