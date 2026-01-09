import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { streamObject } from 'ai'
import { getApiKey, getChatModel } from './settings'
import { TocSchema } from '../lib/schemas'

// pdfjs-dist types
interface PDFDocumentProxy {
  numPages: number
  getOutline(): Promise<OutlineItem[] | null>
  getDestination(dest: string): Promise<unknown[] | null>
  getPageIndex(ref: unknown): Promise<number>
}

interface OutlineItem {
  title: string
  dest: unknown
  items?: OutlineItem[]
}

export interface TocChapter {
  title: string
  pageNumber: number
}

export interface ParsedToc {
  hasToc: boolean
  chapters: TocChapter[]
}

/**
 * Extract TOC from PDF's embedded outline/bookmarks (Level 0 only).
 * This is the preferred method as it uses the PDF's structured data.
 */
export async function parseOutlineFromPdf(
  pdfPath: string,
  onChapter: (chapter: TocChapter, index: number) => void
): Promise<ParsedToc> {
  try {
    // Dynamic import for ESM module
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const doc: PDFDocumentProxy = await pdfjs.getDocument(pdfPath).promise

    const outline = await doc.getOutline()

    if (!outline || outline.length === 0) {
      return { hasToc: false, chapters: [] }
    }

    const chapters: TocChapter[] = []
    let index = 0

    // Only process Level 0 items (main chapters)
    for (const item of outline as OutlineItem[]) {
      if (!item.title) continue

      // Get page number from destination
      let pageNumber = 1
      if (item.dest) {
        try {
          if (typeof item.dest === 'string') {
            const dest = await doc.getDestination(item.dest)
            if (dest && Array.isArray(dest)) {
              const pageRef = dest[0]
              pageNumber = (await doc.getPageIndex(pageRef)) + 1
            }
          } else if (Array.isArray(item.dest)) {
            const pageRef = item.dest[0]
            pageNumber = (await doc.getPageIndex(pageRef)) + 1
          }
        } catch {
          // Keep default pageNumber = 1
        }
      }

      const chapter: TocChapter = {
        title: item.title.trim(),
        pageNumber
      }

      chapters.push(chapter)
      onChapter(chapter, index)
      index++
    }

    return { hasToc: true, chapters }
  } catch (error) {
    console.error('Outline extraction error:', error)
    return { hasToc: false, chapters: [] }
  }
}

/**
 * Fallback: Parse TOC from text using AI when PDF has no embedded outline.
 */
export async function parseTocStreaming(
  pages: string[],
  onChapter: (chapter: TocChapter, index: number) => void
): Promise<ParsedToc> {
  const apiKey = getApiKey()
  if (!apiKey) {
    return { hasToc: false, chapters: [] }
  }

  const chatModel = getChatModel()
  const google = createGoogleGenerativeAI({ apiKey })

  // Send first 15 pages to AI to find and parse TOC
  const pagesToAnalyze = pages.slice(0, 15)
  const pagesText = pagesToAnalyze
    .map((content, i) => `--- Page ${i + 1} ---\n${content}`)
    .join('\n\n')

  try {
    const { partialObjectStream } = streamObject({
      model: google(chatModel),
      schema: TocSchema,
      system: `You are a document analyzer. Extract the table of contents from a PDF.

Rules:
- Look for a table of contents, index, or contents page
- Extract ONLY main chapters (top-level entries), NOT sub-chapters
- A typical book has 5-25 main chapters
- Main chapters are usually bold, numbered (Chapter 1, Part I), or at the left margin
- Sub-chapters are indented or nested under main chapters - SKIP these
- If there's no clear table of contents, set hasToc to false
- Page numbers should match what's written in the TOC
- Clean up chapter titles (remove dots, leaders, extra whitespace)`,
      prompt: `Analyze these pages and extract only the main chapters from the table of contents:\n\n${pagesText}`
    })

    const emittedChapters = new Set<string>()
    let emittedCount = 0
    let finalResult: ParsedToc = { hasToc: false, chapters: [] }

    for await (const partial of partialObjectStream) {
      if (partial.chapters && Array.isArray(partial.chapters)) {
        for (const chapter of partial.chapters) {
          if (chapter && typeof chapter.title === 'string' && typeof chapter.pageNumber === 'number') {
            const key = `${chapter.title}::${chapter.pageNumber}`
            if (!emittedChapters.has(key)) {
              emittedChapters.add(key)
              onChapter(chapter as TocChapter, emittedCount)
              emittedCount++
            }
          }
        }
      }
      if (partial.hasToc !== undefined) {
        finalResult.hasToc = partial.hasToc
      }
      if (partial.chapters) {
        finalResult.chapters = partial.chapters.filter(
          (c): c is TocChapter =>
            c !== undefined &&
            typeof c.title === 'string' &&
            typeof c.pageNumber === 'number'
        )
      }
    }

    return finalResult
  } catch (error) {
    console.error('TOC parsing error:', error)
    return { hasToc: false, chapters: [] }
  }
}
