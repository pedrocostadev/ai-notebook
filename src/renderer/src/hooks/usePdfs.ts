import { useState, useEffect, useCallback } from 'react'

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

export function usePdfs() {
  const [pdfs, setPdfs] = useState<Pdf[]>([])
  const [chapters, setChapters] = useState<ChaptersState>({})
  const [expandedPdfIds, setExpandedPdfIds] = useState<Set<number>>(() => {
    const saved = localStorage.getItem('expandedPdfIds')
    return saved ? new Set(JSON.parse(saved)) : new Set()
  })
  const [selectedPdfId, setSelectedPdfId] = useState<number | null>(null)
  const [selectedChapterId, setSelectedChapterId] = useState<number | null>(null)
  const [chapterProgress, setChapterProgress] = useState<ChapterProgressState>({})
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const list = await window.api.listPdfs()
    setPdfs(list)
    // Load chapters for all PDFs
    for (const pdf of list) {
      const chapterList = await window.api.listChapters(pdf.id)
      setChapters((prev) => ({ ...prev, [pdf.id]: chapterList }))
    }
    setLoading(false)
  }, [])

  const loadChapters = useCallback(async (pdfId: number) => {
    const chapterList = await window.api.listChapters(pdfId)
    setChapters((prev) => ({ ...prev, [pdfId]: chapterList }))
  }, [])

  // Persist expanded state
  useEffect(() => {
    localStorage.setItem('expandedPdfIds', JSON.stringify([...expandedPdfIds]))
  }, [expandedPdfIds])

  useEffect(() => {
    refresh()

    const unsubscribeProgress = window.api.onChapterProgress(({ pdfId, chapterId, progress: p, stage, chunksTotal, chunksProcessed, embeddingsTotal, embeddingsProcessed }) => {
      setChapterProgress((prev) => ({
        ...prev,
        [chapterId]: {
          progress: p,
          stage,
          chunksTotal,
          chunksProcessed,
          embeddingsTotal,
          embeddingsProcessed
        }
      }))
      if (p === 100 && stage === 'embedding') {
        // Refresh chapters for this PDF
        loadChapters(pdfId)
        // Check if all chapters are done
        refresh()
      }
    })

    const unsubscribeAdded = window.api.onChapterAdded(({ pdfId, chapter }) => {
      // Append new chapter to state incrementally
      setChapters((prev) => {
        const existing = prev[pdfId] || []
        // Avoid duplicates
        if (existing.some((c) => c.id === chapter.id)) {
          return prev
        }
        return {
          ...prev,
          [pdfId]: [...existing, { ...chapter, pdf_id: pdfId, error_message: null }]
        }
      })
    })

    return () => {
      unsubscribeProgress()
      unsubscribeAdded()
    }
  }, [refresh, loadChapters])

  const uploadPdf = async (): Promise<{ success: boolean; error?: string; pdfId?: number; duplicate?: boolean }> => {
    const result = await window.api.uploadPdf()
    if (!result) {
      return { success: false }
    }
    if ('error' in result) {
      return { success: false, error: result.error }
    }
    await refresh()
    if (result.duplicate && result.existingPdfId) {
      setSelectedPdfId(result.existingPdfId)
      setSelectedChapterId(null)
      await loadChapters(result.existingPdfId)
      setExpandedPdfIds((prev) => new Set([...prev, result.existingPdfId!]))
      return { success: true, duplicate: true, pdfId: result.existingPdfId }
    }
    setSelectedPdfId(result.pdfId)
    setSelectedChapterId(null)
    await loadChapters(result.pdfId)
    setExpandedPdfIds((prev) => new Set([...prev, result.pdfId]))
    return { success: true, pdfId: result.pdfId }
  }

  const deletePdf = async (id: number) => {
    await window.api.deletePdf(id)
    if (selectedPdfId === id) {
      setSelectedPdfId(null)
      setSelectedChapterId(null)
    }
    setChapters((prev) => {
      const updated = { ...prev }
      delete updated[id]
      return updated
    })
    setExpandedPdfIds((prev) => {
      const updated = new Set(prev)
      updated.delete(id)
      return updated
    })
    await refresh()
  }

  const cancelPdfProcessing = async (id: number) => {
    const cancelled = await window.api.cancelPdfProcessing(id)
    if (cancelled) {
      if (selectedPdfId === id) {
        setSelectedPdfId(null)
        setSelectedChapterId(null)
      }
      await refresh()
    }
    return cancelled
  }

  const toggleExpanded = async (pdfId: number) => {
    setExpandedPdfIds((prev) => {
      const updated = new Set(prev)
      if (updated.has(pdfId)) {
        updated.delete(pdfId)
      } else {
        updated.add(pdfId)
        // Load chapters if not already loaded
        if (!chapters[pdfId]) {
          loadChapters(pdfId)
        }
      }
      return updated
    })
  }

  const selectPdf = (pdfId: number | null, chapterId: number | null = null) => {
    setSelectedPdfId(pdfId)
    setSelectedChapterId(chapterId)
  }

  const selectedPdf = pdfs.find((p) => p.id === selectedPdfId)
  const selectedChapter = selectedChapterId && selectedPdfId
    ? chapters[selectedPdfId]?.find((c) => c.id === selectedChapterId)
    : null

  return {
    pdfs,
    chapters,
    expandedPdfIds,
    selectedPdf,
    selectedPdfId,
    selectedChapter,
    selectedChapterId,
    chapterProgress,
    loading,
    uploadPdf,
    deletePdf,
    cancelPdfProcessing,
    toggleExpanded,
    selectPdf,
    loadChapters,
    refresh
  }
}
