import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { NotebookFormSchema, type NotebookFormData } from '@/lib/formSchemas'

interface NotebookFormProps {
  onSubmit: (data: NotebookFormData) => void
  onCancel?: () => void
}

export function NotebookForm({ onSubmit, onCancel }: NotebookFormProps) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [errors, setErrors] = useState<{ title?: string; content?: string }>({})

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setErrors({})

    const result = NotebookFormSchema.safeParse({ title, content })

    if (!result.success) {
      const fieldErrors: { title?: string; content?: string } = {}
      result.error.errors.forEach((error) => {
        const field = error.path[0] as 'title' | 'content'
        if (field && !fieldErrors[field]) {
          fieldErrors[field] = error.message
        }
      })
      setErrors(fieldErrors)
      return
    }

    onSubmit(result.data)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-testid="notebook-form">
      <div className="space-y-2">
        <Label htmlFor="title">
          Title <span className="text-destructive">*</span>
        </Label>
        <Input
          id="title"
          data-testid="notebook-title-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Enter notebook title"
          maxLength={100}
          aria-invalid={!!errors.title}
          aria-describedby={errors.title ? 'title-error' : undefined}
        />
        {errors.title && (
          <p id="title-error" className="text-sm text-destructive" data-testid="title-error">
            {errors.title}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="content">
          Content <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="content"
          data-testid="notebook-content-input"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Enter notebook content"
          rows={6}
          aria-invalid={!!errors.content}
          aria-describedby={errors.content ? 'content-error' : undefined}
        />
        {errors.content && (
          <p id="content-error" className="text-sm text-destructive" data-testid="content-error">
            {errors.content}
          </p>
        )}
      </div>

      <div className="flex gap-2 justify-end">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} data-testid="cancel-button">
            Cancel
          </Button>
        )}
        <Button type="submit" data-testid="submit-button">
          Create Notebook
        </Button>
      </div>
    </form>
  )
}
