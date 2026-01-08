import { useEffect, useRef } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { QuizMessage, type QuizQuestion } from './QuizMessage'

interface ChatMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
  metadata: {
    citations?: { chunkId: number; pageStart: number; pageEnd: number; quote: string }[]
    confidence?: 'high' | 'medium' | 'low'
    followUpQuestions?: string[]
    quiz?: QuizQuestion[]
  } | null
}

interface MessageListProps {
  messages: ChatMessage[]
  streamingContent: string
  isStreaming: boolean
  commandLoading?: string | null
  onFollowUpClick?: (question: string) => void
}

export function MessageList({ messages, streamingContent, isStreaming, commandLoading, onFollowUpClick }: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, streamingContent, commandLoading])

  const getConfidenceBadge = (confidence: string) => {
    const colors = {
      high: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      low: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
    }
    return (
      <span className={cn('text-xs px-2 py-0.5 rounded-full', colors[confidence as keyof typeof colors])}>
        {confidence} confidence
      </span>
    )
  }

  return (
    <ScrollArea className="flex-1 p-4" ref={scrollRef}>
      <div className="space-y-4 max-w-3xl mx-auto">
        {messages.map((message) => {
          const hasQuiz = message.metadata?.quiz && message.metadata.quiz.length > 0

          return (
            <div
              key={message.id}
              className={cn('flex', message.role === 'user' ? 'justify-end' : 'justify-start')}
            >
              <div
                className={cn(
                  'rounded-lg px-4 py-2',
                  hasQuiz ? 'max-w-[95%] w-full' : 'max-w-[80%]',
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted'
                )}
                data-testid={`message-${message.role}`}
              >
                {hasQuiz ? (
                  <QuizMessage questions={message.metadata!.quiz!} />
                ) : (
                  <>
                    <p className="whitespace-pre-wrap">{message.content}</p>
                    {message.metadata && message.role === 'assistant' && (
                      <div className="mt-2 pt-2 border-t border-border/50 space-y-2">
                        {message.metadata.confidence && getConfidenceBadge(message.metadata.confidence)}
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
    </ScrollArea>
  )
}
