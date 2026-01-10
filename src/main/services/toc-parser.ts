import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { streamObject, generateObject } from 'ai'
import { getApiKey, getChatModel } from './settings'
import { TocSchema, ChapterClassificationSchema } from '../lib/schemas'

// pdfjs-dist types
interface PDFDocumentProxy {
  numPages: number
  getOutline(): Promise<OutlineItem[] | null>
  getDestination(dest: string): Promise<unknown[] | null>
  getPageIndex(ref: unknown): Promise<number>
  getPageLabels(): Promise<string[] | null>
  getMetadata(): Promise<{ info: Record<string, unknown> } | null>
}

interface OutlineItem {
  title: string
  dest: unknown
  items?: OutlineItem[]
}

export interface TocChapter {
  title: string
  pageNumber: number // Physical page index (1-indexed) for text boundary calculation
  pageLabel?: number // Page label (printed number) for Preview navigation
  isAuxiliary?: boolean
  isPhysicalPage?: boolean // true = pageNumber is physical page index (from PDF outline)
}

export interface ParsedToc {
  hasToc: boolean
  chapters: TocChapter[]
  title?: string
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

    // Extract title from PDF metadata
    let title: string | undefined
    try {
      const metadata = await doc.getMetadata()
      if (metadata?.info?.Title && typeof metadata.info.Title === 'string') {
        title = metadata.info.Title.trim()
      }
    } catch {
      // Ignore metadata extraction errors
    }

    const outline = await doc.getOutline()

    if (!outline || outline.length === 0) {
      return { hasToc: false, chapters: [], title }
    }

    // Get page labels for converting physical page to display label
    let pageLabels: string[] | null = null
    try {
      pageLabels = await doc.getPageLabels()
    } catch {
      // Some PDFs don't have page labels
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

      // Get page label (printed number) for Preview navigation
      let pageLabel: number | undefined
      if (pageLabels && pageNumber > 0 && pageNumber <= pageLabels.length) {
        const label = pageLabels[pageNumber - 1] // pageLabels is 0-indexed
        // Try to parse as number (some labels might be Roman numerals or other formats)
        const parsed = parseInt(label, 10)
        if (!isNaN(parsed)) {
          pageLabel = parsed
        }
      }

      const chapter: TocChapter = {
        title: item.title.trim(),
        pageNumber,
        pageLabel, // May be undefined if no labels or non-numeric label
        isPhysicalPage: true // Outline gives physical page indices
      }

      chapters.push(chapter)
      onChapter(chapter, index)
      index++
    }

    return { hasToc: true, chapters, title }
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
          if (
            chapter &&
            typeof chapter.title === 'string' &&
            typeof chapter.pageNumber === 'number' &&
            typeof chapter.isAuxiliary === 'boolean'
          ) {
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
            typeof c.pageNumber === 'number' &&
            typeof c.isAuxiliary === 'boolean'
        )
      }
    }

    return finalResult
  } catch (error) {
    console.error('TOC parsing error:', error)
    return { hasToc: false, chapters: [] }
  }
}

/**
 * Classify chapter titles as auxiliary or main content using AI.
 * Used for outline-based TOC extraction where we don't have AI classification built-in.
 */
export async function classifyChapterTitles(titles: string[]): Promise<Map<string, boolean>> {
  const apiKey = getApiKey()
  if (!apiKey || titles.length === 0) {
    return new Map()
  }

  const chatModel = getChatModel()
  const google = createGoogleGenerativeAI({ apiKey })

  try {
    const { object } = await generateObject({
      model: google(chatModel),
      schema: ChapterClassificationSchema,
      system: `You classify chapter titles as either auxiliary content or main content.

Auxiliary content includes: Table of Contents, Index, Bibliography, Acknowledgments,
Preface, Foreword, Appendix, Glossary, List of Figures, List of Tables, About the Author,
Copyright, Dedication, Notes, References, Introduction (if it's just a brief intro),
Conclusion (if it's just a summary), Epilogue, Prologue.

Main content includes: Numbered chapters (Chapter 1, Part I), topical chapters with
substantive titles, any chapter that appears to contain the core material of the book.

When in doubt, classify as main content (isAuxiliary: false).`,
      prompt: `Classify each of these chapter titles:\n\n${titles.map((t, i) => `${i + 1}. "${t}"`).join('\n')}`
    })

    const result = new Map<string, boolean>()
    for (const c of object.classifications) {
      result.set(c.title, c.isAuxiliary)
    }
    return result
  } catch (error) {
    console.error('Chapter classification error:', error)
    return new Map()
  }
}
