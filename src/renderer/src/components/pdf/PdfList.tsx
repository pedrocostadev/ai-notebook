import { FileText, Trash2, Loader2, AlertCircle, CheckCircle, X, ChevronRight, ChevronDown, BookOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'

interface Pdf {
  id: number
  filename: string
  status: string
  created_at: string
}

interface Chapter {
  id: number
  pdf_id: number
  title: string
  chapter_index: number
  status: string
  error_message: string | null
}

type ProcessingStage = 'extracting' | 'chunking' | 'embedding'

interface ChapterProgressState {
  [chapterId: number]: {
    progress: number
    stage: ProcessingStage
    chunksTotal?: number
    chunksProcessed?: number
    embeddingsTotal?: number
    embeddingsProcessed?: number
  }
}

interface ChaptersState {
  [pdfId: number]: Chapter[]
}

const STAGE_LABELS: Record<ProcessingStage, string> = {
  extracting: 'Extracting',
  chunking: 'Chunking',
  embedding: 'Embedding'
}

interface PdfListProps {
  pdfs: Pdf[]
  chapters: ChaptersState
  expandedPdfIds: Set<number>
  selectedPdfId: number | null
  selectedChapterId: number | null
  chapterProgress: ChapterProgressState
  onSelect: (pdfId: number, chapterId: number | null) => void
  onDelete: (id: number) => void
  onCancel: (id: number) => void
  onToggleExpand: (pdfId: number) => void
}

export function PdfList({
  pdfs,
  chapters,
  expandedPdfIds,
  selectedPdfId,
  selectedChapterId,
  chapterProgress,
  onSelect,
  onDelete,
  onCancel,
  onToggleExpand
}: PdfListProps) {
  const getChapterStatusIndicator = (chapter: Chapter) => {
    const p = chapterProgress[chapter.id]

    if (chapter.status === 'done') {
      return <CheckCircle className="h-3.5 w-3.5 text-green-500" />
    }

    if (chapter.status === 'error') {
      return <AlertCircle className="h-3.5 w-3.5 text-destructive" title={chapter.error_message || 'Processing failed'} />
    }

    // Show progress if available
    if (p) {
      return (
        <span className="flex items-center gap-1" title={`${STAGE_LABELS[p.stage]}: ${p.progress}%`}>
          <span className="text-xs text-muted-foreground tabular-nums">{p.progress}%</span>
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        </span>
      )
    }

    // Pending - no progress yet
    return <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
  }

  const getPdfStatusIndicator = (pdf: Pdf) => {
    if (pdf.status === 'error') {
      return <AlertCircle className="h-4 w-4 text-destructive" />
    }
    if (pdf.status === 'done') {
      return <CheckCircle className="h-4 w-4 text-green-500" />
    }
    // Processing - show spinner
    return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
  }

  const isPdfProcessing = (pdf: Pdf) => {
    return pdf.status === 'processing' || pdf.status === 'pending'
  }

  if (pdfs.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-4 text-sm text-muted-foreground">
        No PDFs uploaded yet
      </div>
    )
  }

  return (
    <ScrollArea className="flex-1 [&>div>div]:!overflow-x-hidden">
      <div className="space-y-0.5 p-2">
        {pdfs.map((pdf) => {
          const isExpanded = expandedPdfIds.has(pdf.id)
          const pdfChapters = chapters[pdf.id] || []
          const hasChapters = pdfChapters.length > 0

          return (
            <div key={pdf.id}>
              {/* PDF Row */}
              <div
                className={cn(
                  'flex items-center gap-1 rounded-md px-2 py-1.5 cursor-pointer hover:bg-accent group',
                  selectedPdfId === pdf.id && selectedChapterId === null && 'bg-accent'
                )}
                onClick={() => onSelect(pdf.id, null)}
              >
                {hasChapters ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 p-0"
                    onClick={(e) => {
                      e.stopPropagation()
                      onToggleExpand(pdf.id)
                    }}
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                  </Button>
                ) : (
                  <div className="w-5" />
                )}
                <FileText className="h-4 w-4 flex-shrink-0" />
                <span className="flex-1 truncate text-sm">{pdf.filename}</span>
                {getPdfStatusIndicator(pdf)}
                {isPdfProcessing(pdf) ? (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Cancel Processing?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will stop processing and delete "{pdf.filename}" along with all associated data.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Keep Processing</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => onCancel(pdf.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Cancel & Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                ) : (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete PDF?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete "{pdf.filename}" and all associated chat history.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => onDelete(pdf.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>

              {/* Chapters */}
              {isExpanded && pdfChapters.length > 0 && (
                <div className="pl-5 pr-2 space-y-0.5 overflow-hidden">
                  {pdfChapters.map((chapter) => (
                    <div
                      key={chapter.id}
                      data-testid="chapter-row"
                      className={cn(
                        'grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1.5 rounded-md px-2 py-1 cursor-pointer hover:bg-accent overflow-hidden',
                        selectedChapterId === chapter.id && 'bg-accent'
                      )}
                      onClick={() => onSelect(pdf.id, chapter.id)}
                    >
                      <BookOpen className="h-3 w-3 text-muted-foreground" />
                      <span className="truncate text-sm text-muted-foreground">
                        {chapter.title}
                      </span>
                      <span data-testid="chapter-status">
                        {getChapterStatusIndicator(chapter)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </ScrollArea>
  )
}
