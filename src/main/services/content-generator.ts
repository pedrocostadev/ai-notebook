import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { generateText, generateObject } from 'ai'
import { z } from 'zod'
import { getApiKey, getChatModel } from './settings'

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

export async function generateChapterSummary(chapterText: string): Promise<string> {
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
