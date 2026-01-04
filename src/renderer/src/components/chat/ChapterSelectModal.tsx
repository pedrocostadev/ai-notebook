import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { BookOpen } from 'lucide-react'
import type { Chapter } from '../../../../preload'

interface ChapterSelectModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  chapters: Chapter[]
  onSelect: (chapterId: number) => void
}

export function ChapterSelectModal({ open, onOpenChange, chapters, onSelect }: ChapterSelectModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Select a Chapter</DialogTitle>
          <DialogDescription>
            Choose which chapter you want to view the summary for.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-64 mt-2">
          <div className="space-y-1">
            {chapters.map((chapter) => (
              <button
                key={chapter.id}
                className="w-full text-left px-3 py-2 rounded-md flex items-center gap-3 hover:bg-accent transition-colors"
                onClick={() => onSelect(chapter.id)}
                type="button"
              >
                <BookOpen className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="text-sm truncate">{chapter.title}</span>
              </button>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
