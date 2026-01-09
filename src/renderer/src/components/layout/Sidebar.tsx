import { Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PdfList } from '@/components/pdf/PdfList'
import { PdfUpload } from '@/components/pdf/PdfUpload'

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
  onSelectPdf,
  onDeletePdf,
  onCancelPdf,
  onToggleExpand,
  onUploadPdf,
  onOpenSettings
}: SidebarProps) {
  return (
    <div className="w-80 border-r flex flex-col h-full bg-muted/30 overflow-hidden">
      <div className="p-4 border-b flex items-center justify-between">
        <h1 className="font-semibold">AI Notebook</h1>
        <Button variant="ghost" size="icon" onClick={onOpenSettings} data-testid="settings-btn">
          <Settings className="h-4 w-4" />
        </Button>
      </div>
      <div className="p-2">
        <PdfUpload onUpload={onUploadPdf} />
      </div>
      <PdfList
        pdfs={pdfs}
        chapters={chapters}
        expandedPdfIds={expandedPdfIds}
        selectedPdfId={selectedPdfId}
        selectedChapterId={selectedChapterId}
        chapterProgress={chapterProgress}
        onSelect={onSelectPdf}
        onDelete={onDeletePdf}
        onCancel={onCancelPdf}
        onToggleExpand={onToggleExpand}
      />
    </div>
  )
}
