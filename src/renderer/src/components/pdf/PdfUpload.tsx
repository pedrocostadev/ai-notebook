import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface PdfUploadProps {
  onUpload: () => void
}

export function PdfUpload({ onUpload }: PdfUploadProps) {
  return (
    <div className="space-y-1">
      <Button variant="outline" className="w-full" onClick={onUpload} data-testid="upload-pdf-btn">
        <Upload className="mr-2 h-4 w-4" />
        Upload
      </Button>
      <p className="text-xs text-muted-foreground text-center">Supported: PDF</p>
    </div>
  )
}
