import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { NotebookForm } from './NotebookForm'
import type { NotebookFormData } from '@/lib/formSchemas'

interface NotebookDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: NotebookFormData) => void
}

export function NotebookDialog({ open, onOpenChange, onSubmit }: NotebookDialogProps) {
  const handleSubmit = (data: NotebookFormData) => {
    onSubmit(data)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="notebook-dialog">
        <DialogHeader>
          <DialogTitle>Create New Notebook</DialogTitle>
          <DialogDescription>
            Add a title and content for your new notebook entry.
          </DialogDescription>
        </DialogHeader>
        <NotebookForm onSubmit={handleSubmit} onCancel={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}
