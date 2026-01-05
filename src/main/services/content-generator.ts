import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { generateText, generateObject } from 'ai'
import { z } from 'zod'
import { getApiKey, getChatModel } from './settings'
import {
  ChapterConceptsSchema,
  ConsolidatedConceptsSchema,
  QuizSchema,
  type Concept,
  type ConsolidatedConcept,
  type QuizQuestion
} from '../lib/schemas'
import {
  getConceptsByPdfId,
  getChaptersByPdfId,
  insertConcepts,
  deleteConceptsByPdfId,
  type ConceptQuote
} from './database'

export const PdfMetadataSchema = z.object({
  title: z.string().nullable().describe('The title of the book/document'),
  author: z.string().nullable().describe('The author(s) of the document'),
  publisher: z.string().nullable().describe('The publisher of the document'),
  publishDate: z.string().nullable().describe('Publication date (any format found)'),
  isbn: z.string().nullable().describe('ISBN if available'),
  edition: z.string().nullable().describe('Edition information if available'),
  language: z.string().nullable().describe('Language of the document'),
  subject: z.string().nullable().describe('Main subject or topic')
})

export type PdfMetadata = z.infer<typeof PdfMetadataSchema>

const MIN_CHARS_FOR_SUMMARY = 500 // Minimum characters needed to generate a meaningful summary

export async function generateChapterSummary(chapterText: string): Promise<string | null> {
  // Skip summary for very short chapters (preface, acknowledgments, etc.)
  if (chapterText.trim().length < MIN_CHARS_FOR_SUMMARY) {
    return null
  }

  const apiKey = getApiKey()
  if (!apiKey) {
    throw new Error('API key not configured')
  }

  const chatModel = getChatModel()
  const google = createGoogleGenerativeAI({ apiKey })

  // Limit text to avoid token limits (roughly 100k chars = ~25k tokens)
  const truncatedText = chapterText.slice(0, 100000)

  const { text } = await generateText({
    model: google(chatModel),
    system: `You are an expert at summarizing academic and technical content.
Create a detailed, comprehensive summary of the chapter provided.
The summary should:
- Cover all major topics and concepts discussed
- Preserve important details, examples, and key arguments
- Be well-structured with clear paragraphs
- Be 3-5 paragraphs long
- Use clear, professional language`,
    prompt: `Please provide a detailed summary of this chapter:\n\n${truncatedText}`
  })

  return text
}

export async function generatePdfMetadata(pdfText: string): Promise<PdfMetadata> {
  const apiKey = getApiKey()
  if (!apiKey) {
    throw new Error('API key not configured')
  }

  const chatModel = getChatModel()
  const google = createGoogleGenerativeAI({ apiKey })

  // Use only first portion of text (title page, copyright, etc. are usually at start)
  const textForMetadata = pdfText.slice(0, 20000)

  const { object } = await generateObject({
    model: google(chatModel),
    schema: PdfMetadataSchema,
    system: `You are an expert at extracting bibliographic metadata from documents.
Extract metadata from the provided text, which typically comes from the beginning of a book or document.
Look for information in:
- Title pages
- Copyright pages
- Preface or introduction
- Headers and footers

Return null for any field you cannot find with confidence.`,
    prompt: `Extract metadata from this document text:\n\n${textForMetadata}`
  })

  return object
}

export async function generateChapterConcepts(chapterText: string): Promise<Concept[]> {
  const apiKey = getApiKey()
  if (!apiKey) {
    throw new Error('API key not configured')
  }

  const chatModel = getChatModel()
  const google = createGoogleGenerativeAI({ apiKey })

  // Limit text to avoid token limits
  const truncatedText = chapterText.slice(0, 100000)

  const { object } = await generateObject({
    model: google(chatModel),
    schema: ChapterConceptsSchema,
    system: `You are an expert at extracting key concepts from educational content.
Extract 10-20 key concepts from the chapter provided.

For each concept:
- Name: Short, memorable identifier (2-5 words)
- Definition: Clear explanation in context of this material (1-3 sentences)
- Importance: Rate 1-5 (5=fundamental/core idea, 4=key supporting concept, 3=notable, 2=minor, 1=tangential)
- Quotes: 1-3 exact quotes from the text as evidence

Focus on:
- Core ideas the author emphasizes
- Technical terms and their meanings
- Frameworks, models, or theories introduced
- Key arguments or claims made

Order concepts by importance (highest first).`,
    prompt: `Extract key concepts from this chapter:\n\n${truncatedText}`
  })

  return object.concepts
}

export async function consolidatePdfConcepts(pdfId: number): Promise<void> {
  const apiKey = getApiKey()
  if (!apiKey) {
    throw new Error('API key not configured')
  }

  // Get all chapter concepts (non-consolidated)
  const allConcepts = getConceptsByPdfId(pdfId, false).filter((c) => !c.is_consolidated)
  if (allConcepts.length === 0) {
    return
  }

  // Get chapters for context
  const chapters = getChaptersByPdfId(pdfId)
  const chapterMap = new Map(chapters.map((c) => [c.id, c.title]))

  // Group concepts by chapter for the prompt
  const conceptsByChapter: Record<string, { name: string; definition: string; importance: number }[]> = {}
  for (const concept of allConcepts) {
    const chapterTitle = concept.chapter_id ? chapterMap.get(concept.chapter_id) || 'Unknown' : 'Document'
    if (!conceptsByChapter[chapterTitle]) {
      conceptsByChapter[chapterTitle] = []
    }
    conceptsByChapter[chapterTitle].push({
      name: concept.name,
      definition: concept.definition,
      importance: concept.importance
    })
  }

  const chatModel = getChatModel()
  const google = createGoogleGenerativeAI({ apiKey })

  // Truncate if too many concepts (to fit in context)
  const conceptsJson = JSON.stringify(conceptsByChapter)
  const truncatedJson = conceptsJson.slice(0, 80000)

  const { object } = await generateObject({
    model: google(chatModel),
    schema: ConsolidatedConceptsSchema,
    system: `You consolidate chapter-level concepts into document-level concepts.
Given concepts from multiple chapters:
- Merge overlapping/related concepts into unified definitions
- Keep the most important concepts (15-30 total for the document)
- Preserve the strongest supporting quotes with chapter attribution
- Rate overall importance to the document as a whole
- Prefer concepts that appear across multiple chapters`,
    prompt: `Consolidate these chapter concepts into document-level concepts:\n\n${truncatedJson}`
  })

  // Delete existing consolidated concepts for this PDF
  deleteConceptsByPdfId(pdfId, true)

  // Insert new consolidated concepts
  const consolidatedConcepts = object.consolidatedConcepts.map((c: ConsolidatedConcept) => ({
    name: c.name,
    definition: c.definition,
    importance: c.importance,
    quotes: c.quotes.map((q) => ({
      text: q.text,
      chapterTitle: q.chapterTitle
    })) as ConceptQuote[]
  }))

  insertConcepts(pdfId, null, consolidatedConcepts, true)
}

export async function generateQuizQuestions(
  concepts: Array<{ name: string; definition: string; importance: number; quotes: Array<{ text: string }> }>
): Promise<QuizQuestion[]> {
  const apiKey = getApiKey()
  if (!apiKey) {
    throw new Error('API key not configured')
  }

  if (concepts.length === 0) {
    return []
  }

  const chatModel = getChatModel()
  const google = createGoogleGenerativeAI({ apiKey })

  // Build concept summary for prompt
  const conceptSummary = concepts
    .slice(0, 15) // Limit to top 15 concepts
    .map((c) => {
      const quotesText = c.quotes.slice(0, 2).map((q) => `"${q.text}"`).join(' ')
      return `- **${c.name}**: ${c.definition}\n  Evidence: ${quotesText}`
    })
    .join('\n\n')

  const { object } = await generateObject({
    model: google(chatModel),
    schema: QuizSchema,
    system: `You are an expert at creating educational assessments.
Create multiple choice questions that test understanding of the provided concepts.

For each question:
- Test comprehension, not just recall
- Make wrong answers plausible but clearly incorrect
- Include brief explanation of why the correct answer is right
- Reference which concept the question tests

Question quality guidelines:
- Avoid "all of the above" or "none of the above"
- Make options similar in length
- Test understanding of relationships and applications`,
    prompt: `Create 5-10 multiple choice questions based on these key concepts:\n\n${conceptSummary}`
  })

  return object.questions
}
