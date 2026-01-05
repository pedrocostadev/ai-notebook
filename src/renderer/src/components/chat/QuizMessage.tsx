import { useState } from 'react'
import { cn } from '@/lib/utils'
import { CheckCircle2, XCircle, HelpCircle } from 'lucide-react'

export interface QuizQuestion {
  question: string
  options: string[]
  correctIndex: number
  explanation: string
  conceptName: string
}

interface QuizMessageProps {
  questions: QuizQuestion[]
}

type AnswerState = 'unanswered' | 'correct' | 'incorrect'

export function QuizMessage({ questions }: QuizMessageProps) {
  const [selectedAnswers, setSelectedAnswers] = useState<(number | null)[]>(
    new Array(questions.length).fill(null)
  )
  const [showResults, setShowResults] = useState<boolean[]>(
    new Array(questions.length).fill(false)
  )

  const handleSelect = (questionIndex: number, optionIndex: number) => {
    if (showResults[questionIndex]) return // Don't allow changes after revealing

    const newAnswers = [...selectedAnswers]
    newAnswers[questionIndex] = optionIndex
    setSelectedAnswers(newAnswers)
  }

  const handleCheck = (questionIndex: number) => {
    const newShowResults = [...showResults]
    newShowResults[questionIndex] = true
    setShowResults(newShowResults)
  }

  const getAnswerState = (questionIndex: number): AnswerState => {
    if (!showResults[questionIndex]) return 'unanswered'
    return selectedAnswers[questionIndex] === questions[questionIndex].correctIndex
      ? 'correct'
      : 'incorrect'
  }

  const optionLabels = ['A', 'B', 'C', 'D']

  const answeredCount = showResults.filter(Boolean).length
  const correctCount = questions.filter(
    (q, i) => showResults[i] && selectedAnswers[i] === q.correctIndex
  ).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Knowledge Test</h3>
        {answeredCount > 0 && (
          <span className="text-sm text-muted-foreground">
            Score: {correctCount}/{answeredCount}
          </span>
        )}
      </div>

      {questions.map((q, qIndex) => {
        const answerState = getAnswerState(qIndex)
        const isRevealed = showResults[qIndex]

        return (
          <div
            key={qIndex}
            className={cn(
              'p-4 rounded-lg border transition-colors',
              answerState === 'correct' && 'border-green-500 bg-green-50 dark:bg-green-950/30',
              answerState === 'incorrect' && 'border-red-500 bg-red-50 dark:bg-red-950/30',
              answerState === 'unanswered' && 'border-border'
            )}
          >
            <div className="flex items-start gap-2 mb-3">
              <span className="font-medium text-muted-foreground">Q{qIndex + 1}.</span>
              <p className="font-medium flex-1">{q.question}</p>
              {isRevealed && (
                answerState === 'correct'
                  ? <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
                  : <XCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
              )}
            </div>

            <div className="space-y-2 ml-6">
              {q.options.map((option, oIndex) => {
                const isSelected = selectedAnswers[qIndex] === oIndex
                const isCorrect = q.correctIndex === oIndex

                return (
                  <label
                    key={oIndex}
                    className={cn(
                      'flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors',
                      !isRevealed && 'hover:bg-accent',
                      !isRevealed && isSelected && 'bg-accent',
                      isRevealed && isCorrect && 'bg-green-100 dark:bg-green-900/50',
                      isRevealed && isSelected && !isCorrect && 'bg-red-100 dark:bg-red-900/50',
                      isRevealed && 'cursor-default'
                    )}
                  >
                    <input
                      type="radio"
                      name={`question-${qIndex}`}
                      checked={isSelected}
                      onChange={() => handleSelect(qIndex, oIndex)}
                      disabled={isRevealed}
                      className="h-4 w-4 text-primary"
                    />
                    <span className="font-mono text-sm text-muted-foreground">
                      {optionLabels[oIndex]})
                    </span>
                    <span className={cn(
                      'flex-1',
                      isRevealed && isCorrect && 'font-medium text-green-700 dark:text-green-300'
                    )}>
                      {option}
                    </span>
                  </label>
                )
              })}
            </div>

            {!isRevealed && selectedAnswers[qIndex] !== null && (
              <button
                onClick={() => handleCheck(qIndex)}
                className="mt-3 ml-6 px-4 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
              >
                Check Answer
              </button>
            )}

            {isRevealed && (
              <div className="mt-3 ml-6 p-3 rounded-md bg-muted/50 space-y-1">
                <p className="text-sm">{q.explanation}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <HelpCircle className="h-3 w-3" />
                  Concept: {q.conceptName}
                </p>
              </div>
            )}
          </div>
        )
      })}

      {answeredCount === questions.length && (
        <div className={cn(
          'p-4 rounded-lg text-center',
          correctCount === questions.length
            ? 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-200'
            : correctCount >= questions.length / 2
              ? 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-200'
              : 'bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-200'
        )}>
          <p className="font-semibold text-lg">
            Final Score: {correctCount}/{questions.length}
          </p>
          <p className="text-sm mt-1">
            {correctCount === questions.length
              ? 'Perfect! You nailed it!'
              : correctCount >= questions.length / 2
                ? 'Good job! Keep studying to improve.'
                : 'Keep practicing! Review the concepts and try again.'}
          </p>
        </div>
      )}
    </div>
  )
}
