import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { streamObject } from 'ai'
import { getApiKey, getChatModel } from './settings'
import { TocSchema } from '../lib/schemas'

export interface TocChapter {
  title: string
  pageNumber: number
}

export interface ParsedToc {
  hasToc: boolean
  chapters: TocChapter[]
}

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
      system: `You are a document analyzer. Your task is to find and extract the table of contents from a PDF document.

Rules:
- Look for a table of contents, index, or contents page
- Extract chapter titles and their page numbers
- Include only main chapters, not sub-sections or detailed entries
- If there's no clear table of contents, set hasToc to false and return empty chapters
- Page numbers should match what's written in the TOC, not the position in this text
- Clean up chapter titles (remove dots, leaders, extra whitespace)`,
      prompt: `Analyze these pages and extract the table of contents:\n\n${pagesText}`
    })

    // Track emitted chapters by unique key to avoid duplicates
    const emittedChapters = new Set<string>()
    let emittedCount = 0
    let finalResult: ParsedToc = { hasToc: false, chapters: [] }

    for await (const partial of partialObjectStream) {
      if (partial.chapters && Array.isArray(partial.chapters)) {
        // Emit new chapters that haven't been emitted yet
        for (const chapter of partial.chapters) {
          // Only emit if chapter has both title and pageNumber
          if (chapter && typeof chapter.title === 'string' && typeof chapter.pageNumber === 'number') {
            // Create unique key to prevent duplicates
            const key = `${chapter.title}::${chapter.pageNumber}`
            if (!emittedChapters.has(key)) {
              emittedChapters.add(key)
              onChapter(chapter as TocChapter, emittedCount)
              emittedCount++
            }
          }
        }
      }
      // Update final result
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
