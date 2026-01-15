import { useState, useMemo, memo } from 'react'
import { cn } from '@/lib/utils'
import { Lightbulb, ChevronDown, ChevronUp, BookOpen } from 'lucide-react'
import type { Concept, ConceptQuote } from '@/lib/types'

export type { Concept, ConceptQuote }

interface KeyConceptsMessageProps {
  concepts: Concept[]
  isDocumentLevel?: boolean
}

function ImportanceStars({ importance }: { importance: number }) {
  return (
    <div className="flex gap-0.5" title={`Importance: ${importance}/5`}>
      {[1, 2, 3, 4, 5].map((level) => (
        <span
          key={level}
          className={cn(
            'text-xs',
            level <= importance ? 'text-amber-500' : 'text-muted-foreground/30'
          )}
        >
          ★
        </span>
      ))}
    </div>
  )
}

const INITIAL_QUOTES_SHOWN = 3

const ConceptCard = memo(function ConceptCard({ concept, isDocumentLevel }: { concept: Concept; isDocumentLevel?: boolean }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [showAllQuotes, setShowAllQuotes] = useState(false)

  const hasMoreQuotes = concept.quotes.length > INITIAL_QUOTES_SHOWN
  const visibleQuotes = showAllQuotes ? concept.quotes : concept.quotes.slice(0, INITIAL_QUOTES_SHOWN)
  const hiddenCount = concept.quotes.length - INITIAL_QUOTES_SHOWN

  return (
    <div className="border rounded-lg overflow-hidden bg-card">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-3 flex items-start gap-3 text-left hover:bg-accent/50 transition-colors"
      >
        <Lightbulb className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">{concept.name}</span>
            <ImportanceStars importance={concept.importance} />
          </div>
          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
            {concept.definition}
          </p>
        </div>
        {concept.quotes.length > 0 && (
          <div className="flex-shrink-0 text-muted-foreground">
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </div>
        )}
      </button>

      {isExpanded && concept.quotes.length > 0 && (
        <div className="px-3 pb-3 pt-0 border-t bg-muted/30">
          <p className="text-xs font-medium text-muted-foreground mt-2 mb-2">
            Supporting Evidence
          </p>
          <div className="space-y-2">
            {visibleQuotes.map((quote) => (
              <blockquote
                key={`${quote.text.slice(0, 30)}-${quote.pageEstimate ?? 0}`}
                className="text-sm border-l-2 border-amber-500/50 pl-3 py-1"
              >
                <p className="italic text-muted-foreground">"{quote.text}"</p>
                <p className="text-xs text-muted-foreground/70 mt-1 flex items-center gap-1">
                  <BookOpen className="h-3 w-3" />
                  {isDocumentLevel && quote.chapterTitle && (
                    <span>{quote.chapterTitle}</span>
                  )}
                  {quote.pageEstimate && (
                    <span className="font-medium">p. {quote.pageEstimate}</span>
                  )}
                  {!quote.chapterTitle && !quote.pageEstimate && (
                    <span>Source text</span>
                  )}
                </p>
              </blockquote>
            ))}
          </div>
          {hasMoreQuotes && (
            <button
              onClick={() => setShowAllQuotes(!showAllQuotes)}
              className="mt-2 text-xs text-amber-600 dark:text-amber-400 hover:underline"
            >
              {showAllQuotes ? 'Show less' : `Show all references (+${hiddenCount})`}
            </button>
          )}
        </div>
      )}
    </div>
  )
})

export const KeyConceptsMessage = memo(function KeyConceptsMessage({ concepts, isDocumentLevel }: KeyConceptsMessageProps) {
  // Memoize grouped concepts to avoid recalculation on re-renders
  const { highImportance, mediumImportance, lowImportance } = useMemo(() => ({
    highImportance: concepts.filter((c) => c.importance >= 4),
    mediumImportance: concepts.filter((c) => c.importance === 3),
    lowImportance: concepts.filter((c) => c.importance <= 2)
  }), [concepts])

  if (concepts.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-4">
        No key concepts found.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 pb-2 border-b">
        <Lightbulb className="h-5 w-5 text-amber-500" />
        <h3 className="font-semibold">
          {isDocumentLevel ? 'Book Key Concepts' : 'Key Concepts'}
        </h3>
        <span className="text-sm text-muted-foreground">
          ({concepts.length} concepts)
        </span>
      </div>

      {highImportance.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wide">
            Core Concepts
          </p>
          <div className="space-y-2">
            {highImportance.map((concept) => (
              <ConceptCard key={concept.name} concept={concept} isDocumentLevel={isDocumentLevel} />
            ))}
          </div>
        </div>
      )}

      {mediumImportance.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Notable Concepts
          </p>
          <div className="space-y-2">
            {mediumImportance.map((concept) => (
              <ConceptCard key={concept.name} concept={concept} isDocumentLevel={isDocumentLevel} />
            ))}
          </div>
        </div>
      )}

      {lowImportance.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground/70 uppercase tracking-wide">
            Supporting Concepts
          </p>
          <div className="space-y-2">
            {lowImportance.map((concept) => (
              <ConceptCard key={concept.name} concept={concept} isDocumentLevel={isDocumentLevel} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
})
