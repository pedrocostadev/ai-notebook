import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf'
import { loadPageLabels, computePageBoundaries, type PageBoundary } from './pdf-processor'

export interface CachedPdfData {
  pages: string[]
  fullText: string
  boundaries: PageBoundary[]
  labelMap: Map<number, number>
  lastAccessed: number
}

// LRU cache with max 3 PDFs (typical processing scenario)
const MAX_CACHE_SIZE = 3
const cache = new Map<string, CachedPdfData>()

/**
 * Get parsed PDF data from cache or load it.
 * Caches pages, fullText, boundaries, and labelMap for reuse across job types.
 */
export async function getCachedPdfData(filepath: string): Promise<CachedPdfData> {
  const existing = cache.get(filepath)
  if (existing) {
    existing.lastAccessed = Date.now()
    return existing
  }

  // Evict oldest entry if cache is full
  if (cache.size >= MAX_CACHE_SIZE) {
    let oldestKey: string | null = null
    let oldestTime = Infinity
    for (const [key, value] of cache) {
      if (value.lastAccessed < oldestTime) {
        oldestTime = value.lastAccessed
        oldestKey = key
      }
    }
    if (oldestKey) {
      cache.delete(oldestKey)
    }
  }

  // Load and parse PDF
  const loader = new PDFLoader(filepath, { parsedItemSeparator: '\n' })
  const docs = await loader.load()
  const pages = docs.map((d) => d.pageContent)
  const fullText = pages.join('\n\n')
  const boundaries = computePageBoundaries(pages)
  const labelMap = await loadPageLabels(filepath)

  const data: CachedPdfData = {
    pages,
    fullText,
    boundaries,
    labelMap,
    lastAccessed: Date.now()
  }

  cache.set(filepath, data)
  return data
}

/**
 * Invalidate cache entry for a PDF (call when PDF is deleted).
 */
export function invalidatePdfCache(filepath: string): void {
  cache.delete(filepath)
}

/**
 * Clear entire cache.
 */
export function clearPdfCache(): void {
  cache.clear()
}
