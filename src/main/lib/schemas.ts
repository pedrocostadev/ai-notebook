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
          )
      })
    )
    .optional()
    .describe(
      'Citations from the source chunks that support your answer. ' +
        'Include 1-3 citations for factual claims. ' +
        'Omit if the answer is a general statement not tied to specific text.'
    ),
  confidence: z
    .enum(['high', 'medium', 'low'])
    .describe(
      'Your confidence in the answer based on context quality. ' +
        'high: context directly answers the question. ' +
        'medium: context partially answers or requires inference. ' +
        'low: context is tangentially related or insufficient.'
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
        pageNumber: z.number().describe('Page number where the chapter starts')
      })
    )
    .describe(
      'List of chapters extracted from the table of contents. ' +
        'Include main chapters only, not sub-sections. ' +
        'Page numbers should be the actual document page numbers.'
    )
})

export type RerankedResults = z.infer<typeof RerankedResultsSchema>
export type ChatResponseMetadata = z.infer<typeof ChatResponseMetadataSchema>
export type TocResult = z.infer<typeof TocSchema>
