import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf'
import {
  computePageBoundaries,
  getPhysicalPageNumbers,
  buildLabelMap,
  physicalToDisplayPages,
  type PageBoundary
} from './pdf-processor'

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
  // Check if we have a complete cache entry (pages loaded)
  if (existing && existing.pages.length > 0) {
    existing.lastAccessed = Date.now()
    return existing
  }

  // Preserve pre-set labelMap if available (from TOC parsing)
  const presetLabelMap = existing?.labelMap

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

  // Build page boundaries with display labels
  const physicalPageNumbers = getPhysicalPageNumbers(docs)
  const totalPhysicalPages = (docs[0]?.metadata?.pdf?.totalPages as number) ?? pages.length
  const labelMap = await buildLabelMap(filepath, pages, totalPhysicalPages, presetLabelMap)
  const pageNumbers = physicalToDisplayPages(physicalPageNumbers, labelMap)
  const boundaries = computePageBoundaries(pages, pageNumbers)

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
 * Set page labels for a cached PDF (call after TOC parsing with known-good labels).
 * If the PDF is not yet cached, this stores the labels for later use.
 */
export function setCachedPageLabels(filepath: string, labelMap: Map<number, number>): void {
  const existing = cache.get(filepath)
  if (existing) {
    existing.labelMap = labelMap
    existing.lastAccessed = Date.now()
  } else {
    // Store labels in a partial cache entry - will be completed when getCachedPdfData is called
    // Use a marker to indicate this is incomplete
    cache.set(filepath, {
      pages: [],
      fullText: '',
      boundaries: [],
      labelMap,
      lastAccessed: Date.now()
    })
  }
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
