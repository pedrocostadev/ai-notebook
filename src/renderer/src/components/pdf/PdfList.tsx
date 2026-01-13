import {
  FileText,
  Trash2,
  Loader2,
  AlertCircle,
  CheckCircle,
  X,
  ChevronRight,
  ChevronDown,
  Hash,
  CircleDashed,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface Pdf {
  id: number;
  filename: string;
  status: string;
  created_at: string;
  title: string | null;
}

interface Chapter {
  id: number;
  pdf_id: number;
  title: string;
  chapter_index: number;
  status: string;
  error_message: string | null;
  summary_status: string | null;
  concepts_status: string | null;
}

type ProcessingStage = "extracting" | "chunking" | "embedding";

interface ChapterProgressState {
  [chapterId: number]: {
    progress: number;
    stage: ProcessingStage;
    chunksTotal?: number;
    chunksProcessed?: number;
    embeddingsTotal?: number;
    embeddingsProcessed?: number;
  };
}

interface ChaptersState {
  [pdfId: number]: Chapter[];
}

const STAGE_LABELS: Record<ProcessingStage, string> = {
  extracting: "Extracting",
  chunking: "Chunking",
  embedding: "Embedding",
};

interface PdfListProps {
  pdfs: Pdf[];
  chapters: ChaptersState;
  expandedPdfIds: Set<number>;
  selectedPdfId: number | null;
  selectedChapterId: number | null;
  chapterProgress: ChapterProgressState;
  recentlyCompletedChapters: Set<number>;
  onSelect: (pdfId: number, chapterId: number | null) => void;
  onDelete: (id: number) => void;
  onCancel: (id: number) => void;
  onToggleExpand: (pdfId: number) => void;
}

export function PdfList({
  pdfs,
  chapters,
  expandedPdfIds,
  selectedPdfId,
  selectedChapterId,
  chapterProgress,
  recentlyCompletedChapters,
  onSelect,
  onDelete,
  onCancel,
  onToggleExpand,
}: PdfListProps) {
  const getChapterStatusIndicator = (chapter: Chapter) => {
    const p = chapterProgress[chapter.id];
    const isFullyProcessed =
      chapter.status === "done" &&
      chapter.summary_status === "done" &&
      chapter.concepts_status === "done";
    const isPartiallyProcessed = chapter.status === "done" && !isFullyProcessed;
    const isRecentlyCompleted = recentlyCompletedChapters.has(chapter.id);

    // Error state
    if (chapter.status === "error") {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <AlertCircle className="h-3 w-3 text-red-400" />
          </TooltipTrigger>
          <TooltipContent side="right">
            <p>{chapter.error_message || "Processing failed"}</p>
          </TooltipContent>
        </Tooltip>
      );
    }

    // Recently completed - show green check with fade
    if (isFullyProcessed && isRecentlyCompleted) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <CheckCircle className="h-3 w-3 text-emerald-400 animate-fade-out" />
          </TooltipTrigger>
          <TooltipContent side="right">
            <p>Fully processed</p>
          </TooltipContent>
        </Tooltip>
      );
    }

    // Fully processed (not recently) - no indicator
    if (isFullyProcessed) {
      return null;
    }

    // Partially processed - show amber dashed circle
    if (isPartiallyProcessed) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <CircleDashed className="h-3 w-3 text-amber-400" />
          </TooltipTrigger>
          <TooltipContent side="right">
            <p>Chapter partially processed but you can chat already.</p>
          </TooltipContent>
        </Tooltip>
      );
    }

    // Still processing embed - show progress
    if (p) {
      return (
        <span
          className="flex items-center gap-1"
          title={`${STAGE_LABELS[p.stage]}: ${p.progress}%`}
        >
          <span className="text-[10px] text-[var(--color-sidebar-foreground)]/50 tabular-nums">
            {p.progress}%
          </span>
          <Loader2 className="h-3 w-3 animate-spin text-[var(--color-sidebar-foreground)]/50" />
        </span>
      );
    }

    return (
      <Loader2 className="h-3 w-3 animate-spin text-[var(--color-sidebar-foreground)]/50" />
    );
  };

  const getPdfStatusIndicator = (pdf: Pdf) => {
    if (pdf.status === "error") {
      return <AlertCircle className="h-3.5 w-3.5 text-red-400" />;
    }
    if (pdf.status === "done") {
      return <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />;
    }
    return (
      <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--color-sidebar-foreground)]/50" />
    );
  };

  const isPdfProcessing = (pdf: Pdf) => {
    return pdf.status === "processing" || pdf.status === "pending";
  };

  if (pdfs.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-4 text-sm text-[var(--color-sidebar-foreground)]/50">
        No documents yet
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="px-2 pb-2 w-full">
        {pdfs.map((pdf) => {
          const isExpanded = expandedPdfIds.has(pdf.id);
          const pdfChapters = chapters[pdf.id] || [];
          const hasChapters = pdfChapters.length > 0;
          const isSelected =
            selectedPdfId === pdf.id && selectedChapterId === null;

          return (
            <div key={pdf.id} className="overflow-hidden">
              {/* PDF Row */}
              <div
                data-testid="pdf-row"
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer group min-w-0 overflow-hidden transition-colors",
                  "hover:bg-[var(--color-sidebar-accent)]",
                  isSelected && "bg-[var(--color-sidebar-accent)]"
                )}
                onClick={() => onSelect(pdf.id, null)}
              >
                {hasChapters ? (
                  <button
                    className="h-4 w-4 flex items-center justify-center text-[var(--color-sidebar-foreground)]/60 hover:text-[var(--color-sidebar-foreground)] transition-colors"
                    data-testid="expand-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleExpand(pdf.id);
                    }}
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                  </button>
                ) : (
                  <div className="w-4" />
                )}
                <FileText className="h-4 w-4 flex-shrink-0 text-[var(--color-sidebar-foreground)]/70" />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className={cn(
                        "w-0 flex-1 truncate text-[13px]",
                        isSelected
                          ? "text-[var(--color-sidebar-foreground)]"
                          : "text-[var(--color-sidebar-foreground)]/90"
                      )}
                      title={pdf.title || pdf.filename}
                    >
                      {pdf.title || pdf.filename}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p>{pdf.title || pdf.filename}</p>
                  </TooltipContent>
                </Tooltip>
                <div className="flex items-center gap-1">
                  {getPdfStatusIndicator(pdf)}
                  {isPdfProcessing(pdf) ? (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 hover:bg-transparent"
                          data-testid="cancel-pdf-btn"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            Cancel Processing?
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            This will stop processing and delete "{pdf.filename}
                            " along with all associated data.
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
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 text-[var(--color-sidebar-foreground)]/60 hover:text-[var(--color-sidebar-foreground)] hover:bg-transparent"
                          data-testid="delete-pdf-btn"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete PDF?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete "{pdf.filename}" and
                            all associated chat history.
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
              </div>

              {/* Chapters */}
              {isExpanded && pdfChapters.length > 0 && (
                <div className="ml-4 pl-2 border-l border-[var(--color-sidebar-border)] space-y-0.5">
                  {pdfChapters.map((chapter) => {
                    const isChapterReady = chapter.status === "done";
                    const isChapterSelected = selectedChapterId === chapter.id;
                    return (
                      <div
                        key={chapter.id}
                        data-testid="chapter-row"
                        className={cn(
                          "flex items-center gap-2 rounded-md px-2 py-1 min-w-0 overflow-hidden transition-colors",
                          isChapterReady &&
                            "cursor-pointer hover:bg-[var(--color-sidebar-accent)]",
                          !isChapterReady && "opacity-40 cursor-not-allowed",
                          isChapterSelected &&
                            "bg-[var(--color-sidebar-accent)]"
                        )}
                        onClick={() =>
                          isChapterReady && onSelect(pdf.id, chapter.id)
                        }
                      >
                        <Hash className="h-3 w-3 flex-shrink-0 text-[var(--color-sidebar-foreground)]/50" />
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span
                              className={cn(
                                "w-0 flex-1 truncate text-[13px]",
                                isChapterSelected
                                  ? "text-[var(--color-sidebar-foreground)]"
                                  : "text-[var(--color-sidebar-foreground)]/70"
                              )}
                              title={chapter.title}
                            >
                              {chapter.title}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="right">
                            <p>{chapter.title}</p>
                          </TooltipContent>
                        </Tooltip>
                        <span data-testid="chapter-status">
                          {getChapterStatusIndicator(chapter)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
