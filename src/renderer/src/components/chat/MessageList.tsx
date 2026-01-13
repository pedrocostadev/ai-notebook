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

  const isEmpty = messages.length === 0 && !isStreaming && !commandLoading
  const showLoadingState = isEmpty && isChapterLoading

  return (
    <ScrollArea className="flex-1 px-4 py-6" viewportRef={scrollRef}>
      {showLoadingState ? (
        <div className="h-full flex flex-col items-center justify-center text-muted-foreground py-16">
          <div className="mb-5 p-4 rounded-2xl bg-muted/60">
            <div className="relative">
              <BookOpen className="h-8 w-8 text-muted-foreground/50" />
              <Loader2 className="h-4 w-4 absolute -bottom-1 -right-1 animate-spin text-primary" />
            </div>
          </div>
          <h3 className="text-base font-semibold text-foreground mb-1">Preparing chapter</h3>
          <p className="text-sm text-center max-w-xs text-muted-foreground">
            {chapterTitle ? (
              <>Processing "{chapterTitle}"...</>
            ) : (
              'Extracting text and generating embeddings...'
            )}
          </p>
          <p className="text-xs text-muted-foreground/60 mt-2">
            This may take a moment for longer chapters
          </p>
        </div>
      ) : isEmpty ? (
        <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
          <div className="flex flex-col items-center max-w-md text-center">
            <div className="mb-5 p-4 rounded-2xl bg-muted/60">
              <MessageSquareText className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <h3 className="text-base font-semibold text-foreground mb-2">Start a conversation</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Ask a question about this document, or explore with commands like{' '}
              <code className="px-1.5 py-0.5 rounded-md bg-muted text-xs font-mono">/summary</code> or{' '}
              <code className="px-1.5 py-0.5 rounded-md bg-muted text-xs font-mono">/key-concepts</code>
            </p>
          </div>
        </div>
      ) : (
      <div className="space-y-5 max-w-3xl mx-auto">
        {messages.map((message, index) => {
          const showCompactionDivider = compactionInfo?.isCompacted && index === compactionInfo.summarizedCount
          const hasQuiz = message.metadata?.quiz && message.metadata.quiz.length > 0
          const hasConcepts = message.metadata?.concepts && message.metadata.concepts.length > 0
          const isWideMessage = hasQuiz || hasConcepts

          return (
            <div key={message.id}>
              {showCompactionDivider && (
                <div className="mb-5">
                  <div className="flex items-center gap-3 py-2">
                    <div className="flex-1 border-t border-dashed border-muted-foreground/20" />
                    <button
                      onClick={() => setShowSummary(!showSummary)}
                      className="text-xs text-muted-foreground/70 flex items-center gap-1.5 hover:text-muted-foreground transition-colors"
                    >
                      <History className="h-3 w-3" />
                      above summarized
                      {showSummary ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>
                    <div className="flex-1 border-t border-dashed border-muted-foreground/20" />
                  </div>
                  {showSummary && (
                    <div className="mt-2 p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground italic">
                      {compactionInfo?.summary || 'Summary will be generated on next chat message'}
                    </div>
                  )}
                </div>
              )}
              <div className={cn('flex', message.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'rounded-2xl px-4 py-3',
                  isWideMessage ? 'max-w-[95%] w-full' : 'max-w-[80%]',
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground rounded-br-md'
                    : 'bg-muted rounded-bl-md'
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
                    <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{message.content}</p>
                    {message.metadata && message.role === 'assistant' &&
                      ((message.metadata.citations && message.metadata.citations.length > 0) ||
                       (message.metadata.followUpQuestions && message.metadata.followUpQuestions.length > 0)) && (
                      <div className="mt-3 pt-3 border-t border-foreground/10 space-y-3">
                        {message.metadata.citations && message.metadata.citations.length > 0 && (
                          <div className="space-y-1.5">
                            <p className="text-xs font-medium text-foreground/70">Sources:</p>
                            {message.metadata.citations.map((citation, i) => (
                              <blockquote
                                key={i}
                                className="text-xs italic border-l-2 border-primary/30 pl-2.5 py-0.5 text-muted-foreground hover:bg-foreground/5 cursor-pointer rounded-r transition-colors"
                                onClick={() => pdfId && window.api.openPdfAtPage(pdfId, citation.pageStart)}
                                title={`Open page ${citation.pageStart} in PDF viewer`}
                              >
                                <span className="not-italic font-medium text-primary/80">
                                  {citation.pageStart === citation.pageEnd
                                    ? `p. ${citation.pageStart}`
                                    : `pp. ${citation.pageStart}-${citation.pageEnd}`}
                                </span>
                                :{' '}
                                "{citation.quote}"
                              </blockquote>
                            ))}
                          </div>
                        )}
                        {message.metadata.followUpQuestions && message.metadata.followUpQuestions.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-xs font-medium text-foreground/70">Follow-up questions:</p>
                            <div className="flex flex-wrap gap-2">
                              {message.metadata.followUpQuestions.map((q, i) => (
                                <button
                                  key={i}
                                  onClick={() => onFollowUpClick?.(q)}
                                  className="text-xs text-left px-3 py-1.5 rounded-full bg-primary/10 hover:bg-primary/15 text-primary transition-colors cursor-pointer"
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
            <div className="max-w-[80%] rounded-2xl rounded-bl-md px-4 py-3 bg-muted">
              <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{streamingContent}</p>
              <span className="inline-block w-1.5 h-4 bg-primary/60 animate-pulse ml-0.5 rounded-sm" />
            </div>
          </div>
        )}
        {commandLoading && (
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-2xl rounded-bl-md px-4 py-3 bg-muted flex items-center gap-3">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-primary/50 rounded-full animate-bounce [animation-delay:-0.3s]" />
                <span className="w-1.5 h-1.5 bg-primary/50 rounded-full animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1.5 h-1.5 bg-primary/50 rounded-full animate-bounce" />
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
