import { useState, useEffect, useCallback } from 'react'
import { Sidebar } from '@/components/layout/Sidebar'
import { ChatContainer } from '@/components/chat/ChatContainer'
import { SettingsDialog } from '@/components/settings/SettingsDialog'
import { WelcomeScreen } from '@/components/settings/WelcomeScreen'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ErrorBoundary } from '@/components/ui/error-boundary'
import { useSettings } from '@/hooks/useSettings'
import { usePdfs } from '@/hooks/usePdfs'

export default function App() {
  const settings = useSettings()
  const pdfs = usePdfs()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'info' } | null>(null)

  // Handle welcome screen completion
  const handleWelcomeComplete = async (apiKey: string, model: string): Promise<boolean> => {
    const success = await settings.saveApiKey(apiKey)
    if (success) {
      await settings.setModel(model)
      return true
    }
    return false
  }

  const handleUpload = useCallback(async () => {
    const result = await pdfs.uploadPdf()
    if (!result.success && result.error) {
      if (result.error === 'SCANNED_PDF') {
        setToast({ message: 'This PDF appears to be scanned. Only text-based PDFs are supported.', type: 'error' })
      } else if (result.error === 'PASSWORD_REQUIRED') {
        setToast({ message: 'Password-protected PDFs are not yet supported.', type: 'error' })
      } else {
        setToast({ message: result.error, type: 'error' })
      }
    } else if (result.duplicate) {
      setToast({ message: 'This PDF is already uploaded. Navigating to it.', type: 'info' })
    }
  }, [pdfs.uploadPdf])

  const handleOpenSettings = useCallback(() => setSettingsOpen(true), [])

  // Auto-dismiss toast
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [toast])

  if (settings.loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-pulse">Loading...</div>
      </div>
    )
  }

  // Show welcome screen on first run (no API key)
  if (!settings.hasApiKey) {
    return (
      <WelcomeScreen
        models={settings.models}
        defaultModel={settings.currentModel}
        onComplete={handleWelcomeComplete}
      />
    )
  }

  // Get the status to show - either chapter status or PDF status
  const getDisplayStatus = () => {
    if (pdfs.selectedChapterId && pdfs.selectedChapter) {
      return pdfs.selectedChapter.status
    }
    return pdfs.selectedPdf?.status
  }

  // Get progress to show - chapter progress or undefined
  const getDisplayProgress = () => {
    if (pdfs.selectedChapterId) {
      return pdfs.chapterProgress[pdfs.selectedChapterId]
    }
    return undefined
  }

  return (
    <TooltipProvider>
    <div className="h-screen flex">
      <ErrorBoundary>
        <Sidebar
          pdfs={pdfs.pdfs}
          chapters={pdfs.chapters}
          expandedPdfIds={pdfs.expandedPdfIds}
          selectedPdfId={pdfs.selectedPdfId}
          selectedChapterId={pdfs.selectedChapterId}
          chapterProgress={pdfs.chapterProgress}
          recentlyCompletedChapters={pdfs.recentlyCompletedChapters}
          onSelectPdf={pdfs.selectPdf}
          onDeletePdf={pdfs.deletePdf}
          onCancelPdf={pdfs.cancelPdfProcessing}
          onToggleExpand={pdfs.toggleExpanded}
          onUploadPdf={handleUpload}
          onOpenSettings={handleOpenSettings}
        />
      </ErrorBoundary>
      <ErrorBoundary>
        <ChatContainer
          pdfId={pdfs.selectedPdfId}
          chapterId={pdfs.selectedChapterId}
          chapterTitle={pdfs.selectedChapter?.title}
          chapters={pdfs.selectedPdfId ? pdfs.chapters[pdfs.selectedPdfId] : undefined}
          status={getDisplayStatus()}
          progress={getDisplayProgress()}
          isUploading={pdfs.isUploading}
          onUpload={handleUpload}
        />
      </ErrorBoundary>
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        hasApiKey={settings.hasApiKey}
        currentModel={settings.currentModel}
        models={settings.models}
        maskedKey={settings.maskedKey}
        onSaveApiKey={settings.saveApiKey}
        onSetModel={settings.setModel}
      />
      {toast && (
        <div
          data-testid="toast"
          data-toast-type={toast.type}
          className={`fixed bottom-6 right-6 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${
            toast.type === 'error' ? 'bg-destructive text-destructive-foreground' : 'bg-primary text-primary-foreground'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
    </TooltipProvider>
  )
}
