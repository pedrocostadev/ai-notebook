import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface PdfUploadProps {
  onUpload: () => void
}

export function PdfUpload({ onUpload }: PdfUploadProps) {
  return (
    <Button variant="outline" className="w-full" onClick={onUpload} data-testid="upload-pdf-btn">
      <Upload className="mr-2 h-4 w-4" />
      Upload PDF
    </Button>
  )
}
