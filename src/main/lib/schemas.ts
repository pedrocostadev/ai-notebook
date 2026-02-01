import { z } from 'zod'

export const RerankedResultsSchema = z.object({
  rankedChunkIds: z
    .array(z.number())
    .describe(
      'Array of chunk IDs sorted by relevance to the query. ' +
        'The first ID is the most relevant, last is least relevant. ' +
        'Only include IDs from the provided candidate chunks.'
    ),
  reasoning: z
    .string()
    .optional()
    .describe(
      'Brief explanation of why the top chunks were ranked highest. ' +
        'Focus on semantic relevance to the query, not keyword matches.'
    )
})

export const ChatResponseMetadataSchema = z.object({
  citations: z
    .array(
      z.object({
        chunkId: z.number().describe('The ID of the chunk this citation comes from'),
        quote: z
          .string()
          .describe(
            'An exact quote from the chunk that supports your answer. ' +
              'Keep quotes concise (1-2 sentences max).'
          ),
        pageStart: z.number().optional().describe('Starting page number (injected at runtime)'),
        pageEnd: z.number().optional().describe('Ending page number (injected at runtime)')
      })
    )
    .optional()
    .describe(
      'Citations from the source chunks that support your answer. ' +
        'Include 1-3 citations for factual claims. ' +
        'Omit if the answer is a general statement not tied to specific text.'
    ),
  followUpQuestions: z
    .array(z.string())
    .optional()
    .describe(
      '2-3 natural follow-up questions the user might ask next. ' +
        'Questions should be answerable from the PDF content. ' +
        'Omit if the topic is fully covered.'
    )
})

export const TocSchema = z.object({
  hasToc: z
    .boolean()
    .describe('Whether the document has a table of contents'),
  chapters: z
    .array(
      z.object({
        title: z.string().describe('Chapter title as it appears in the TOC'),
        pageNumber: z.number().describe('Page number where the chapter starts'),
        isAuxiliary: z
          .boolean()
          .describe(
            'True if this is auxiliary content (Table of Contents, Index, Bibliography, ' +
              'Acknowledgments, Preface, Foreword, Appendix, Glossary, List of Figures, ' +
              'List of Tables, About the Author, Copyright, Dedication, Notes, References). ' +
              'False if this is a main content chapter with substantive material.'
          )
      })
    )
    .describe(
      'List of chapters extracted from the table of contents. ' +
        'Include main chapters only, not sub-sections. ' +
        'Page numbers should be the actual document page numbers.'
    )
})

export const ChapterClassificationSchema = z.object({
  classifications: z
    .array(
      z.object({
        title: z.string().describe('The chapter title exactly as provided'),
        isAuxiliary: z
          .boolean()
          .describe(
            'True if auxiliary content (Table of Contents, Index, Bibliography, ' +
              'Acknowledgments, Preface, Foreword, Appendix, Glossary, List of Figures, ' +
              'List of Tables, About the Author, Copyright, Dedication, Notes, References). ' +
              'False if main content chapter with substantive material.'
          )
      })
    )
    .describe('Classification for each chapter title')
})

export type ChatResponseMetadata = z.infer<typeof ChatResponseMetadataSchema>

// Key Concepts schemas
export const ConceptQuoteSchema = z.object({
  text: z.string().describe('Exact quote from the text (1-2 sentences)'),
  pageEstimate: z.number().optional().describe('Approximate page number if determinable')
})

export const ConceptSchema = z.object({
  name: z.string().describe('Concise name for the concept (2-5 words)'),
  definition: z
    .string()
    .describe('Clear definition in 1-3 sentences explaining what this concept means in context'),
  importance: z
    .number()
    .min(1)
    .max(5)
    .describe('Importance: 5=fundamental/core, 4=key supporting, 3=notable, 2=minor, 1=tangential'),
  quotes: z
    .array(ConceptQuoteSchema)
    .min(1)
    .describe('Exact quotes from the text, ordered by relevance (most relevant first)')
})

export const ChapterConceptsSchema = z.object({
  concepts: z
    .array(ConceptSchema)
    .transform((arr) => arr.slice(0, 20)) // Keep top 20 by importance
    .describe('Key concepts from this chapter, ordered by importance (highest first). Return empty array if chapter has no substantive concepts (e.g., preface, acknowledgments, index).')
})

export const ConsolidatedConceptSchema = z.object({
  name: z.string().describe('Unified concept name'),
  definition: z.string().describe('Consolidated definition combining insights from all chapters'),
  importance: z.number().min(1).max(5).describe('Overall importance to the document'),
  sourceConceptNames: z.array(z.string()).describe('Names of chapter concepts this consolidates'),
  quotes: z
    .array(
      z.object({
        text: z.string(),
        chapterTitle: z.string()
      })
    )
    .max(3)
    .describe('Best supporting quotes with chapter attribution')
})

export const ConsolidatedConceptsSchema = z.object({
  consolidatedConcepts: z
    .array(ConsolidatedConceptSchema)
    .min(15)
    .max(30)
    .describe('Document-level concepts merged from chapter concepts')
})

export type ConceptQuote = z.infer<typeof ConceptQuoteSchema>
export type Concept = z.infer<typeof ConceptSchema>
export type ConsolidatedConcept = z.infer<typeof ConsolidatedConceptSchema>
export type ConsolidatedConcepts = z.infer<typeof ConsolidatedConceptsSchema>

// Quiz schemas
export const QuizQuestionSchema = z.object({
  question: z.string().describe('Clear question testing understanding of the concept'),
  options: z
    .array(z.string())
    .min(2)
    .max(6)
    .describe('2-6 answer options'),
  correctIndex: z
    .number()
    .min(0)
    .max(5)
    .describe('Index of correct answer'),
  explanation: z
    .string()
    .describe('Brief explanation of why the correct answer is right'),
  conceptName: z.string().describe('Name of the concept this question tests')
})

export const QuizSchema = z.object({
  questions: z
    .array(QuizQuestionSchema)
    .min(1)
    .max(15)
    .describe('Multiple choice questions testing key concepts')
})

export type QuizQuestion = z.infer<typeof QuizQuestionSchema>

// Query classification schema for guardrails
export const QueryClassificationSchema = z.object({
  isOnTopic: z
    .boolean()
    .describe(
      'True if query is related to the book/document content or subjects. ' +
        'Subject questions (what is X?, explain Y) should be ON-TOPIC if X/Y relate to book topics. ' +
        'False if query is off-topic (clearly unrelated general knowledge, coding, personal advice, etc.)'
    ),
  reason: z.string().optional().describe('Brief reason for classification')
})
