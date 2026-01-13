import { Settings, BookOpen, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PdfList } from '@/components/pdf/PdfList'

interface Pdf {
  id: number
  filename: string
  status: string
  created_at: string
  title: string | null
}

interface Chapter {
  id: number
  pdf_id: number
  title: string
  chapter_index: number
  status: string
  error_message: string | null
  summary_status: string | null
  concepts_status: string | null
}

type ProcessingStage = 'extracting' | 'chunking' | 'embedding'

interface ChapterProgressState {
  [chapterId: number]: {
    progress: number
    stage: ProcessingStage
  }
}

interface ChaptersState {
  [pdfId: number]: Chapter[]
}

interface SidebarProps {
  pdfs: Pdf[]
  chapters: ChaptersState
  expandedPdfIds: Set<number>
  selectedPdfId: number | null
  selectedChapterId: number | null
  chapterProgress: ChapterProgressState
  recentlyCompletedChapters: Set<number>
  onSelectPdf: (pdfId: number, chapterId: number | null) => void
  onDeletePdf: (id: number) => void
  onCancelPdf: (id: number) => void
  onToggleExpand: (pdfId: number) => void
  onUploadPdf: () => void
  onOpenSettings: () => void
}

export function Sidebar({
  pdfs,
  chapters,
  expandedPdfIds,
  selectedPdfId,
  selectedChapterId,
  chapterProgress,
  recentlyCompletedChapters,
  onSelectPdf,
  onDeletePdf,
  onCancelPdf,
  onToggleExpand,
  onUploadPdf,
  onOpenSettings
}: SidebarProps) {
  return (
    <div className="w-72 flex flex-col h-full bg-[var(--color-sidebar)] text-[var(--color-sidebar-foreground)] overflow-hidden">
      {/* Workspace header - integrated with title bar */}
      <div className="titlebar-drag px-4 pt-12 pb-3 flex items-center justify-between border-b border-[var(--color-sidebar-border)]">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center">
            <BookOpen className="h-4 w-4" />
          </div>
          <span className="font-semibold text-[15px]">AI Notebook</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenSettings}
          data-testid="settings-btn"
          className="titlebar-no-drag h-8 w-8 text-[var(--color-sidebar-foreground)] hover:bg-[var(--color-sidebar-accent)] hover:text-[var(--color-sidebar-foreground)]"
        >
          <Settings className="h-4 w-4" />
        </Button>
      </div>

      {/* Section header with add button */}
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--color-sidebar-foreground)]/70 uppercase tracking-wide">Documents</span>
        <Button
          variant="ghost"
          size="icon"
          onClick={onUploadPdf}
          data-testid="upload-pdf-btn"
          className="h-6 w-6 text-[var(--color-sidebar-foreground)]/70 hover:text-[var(--color-sidebar-foreground)] hover:bg-[var(--color-sidebar-accent)]"
          title="Upload PDF"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <PdfList
        pdfs={pdfs}
        chapters={chapters}
        expandedPdfIds={expandedPdfIds}
        selectedPdfId={selectedPdfId}
        selectedChapterId={selectedChapterId}
        chapterProgress={chapterProgress}
        recentlyCompletedChapters={recentlyCompletedChapters}
        onSelect={onSelectPdf}
        onDelete={onDeletePdf}
        onCancel={onCancelPdf}
        onToggleExpand={onToggleExpand}
      />
    </div>
  )
}
