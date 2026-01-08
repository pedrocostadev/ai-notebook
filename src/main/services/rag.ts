import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { streamText, generateObject } from 'ai'
import { BrowserWindow } from 'electron'
import { vectorSearch, ftsSearch, getChunksByIds, insertMessage, getMessagesByPdfId } from './database'
import { generateEmbedding } from './embeddings'
import { getApiKey, getChatModel } from './settings'
import { estimateTokens } from '../lib/token-counter'
import { RerankedResultsSchema, ChatResponseMetadataSchema } from '../lib/schemas'
import type { ChatResponseMetadata } from '../lib/schemas'

const MAX_CONTEXT_TOKENS = 8000
const RRF_K = 60

interface RankedChunk {
  id: number
  content: string
  heading: string | null
  page_start: number
  page_end: number
  token_count: number
  score: number
}

export async function chat(
  pdfId: number,
  chapterId: number | null,
  query: string,
  window: BrowserWindow
): Promise<void> {
  const apiKey = getApiKey()
  if (!apiKey) {
    throw new Error('API key not configured')
  }

  const chatModel = getChatModel()
  const google = createGoogleGenerativeAI({ apiKey })

  // Save user message
  insertMessage(pdfId, chapterId, 'user', query)

  // Step 1: Embed query
  const queryEmbedding = await generateEmbedding(query)

  // Step 2: Parallel search (scoped to chapter if provided)
  const [vectorResults, ftsResults] = await Promise.all([
    Promise.resolve(vectorSearch(queryEmbedding, 20, chapterId ?? undefined)),
    Promise.resolve(ftsSearch(query, 20, chapterId ?? undefined))
  ])

  // Step 3: RRF fusion
  const vectorRanks = new Map<number, number>()
  vectorResults.forEach((r, i) => vectorRanks.set(r.chunk_id, i + 1))

  const ftsRanks = new Map<number, number>()
  ftsResults.forEach((id, i) => ftsRanks.set(id, i + 1))

  const scores = new Map<number, number>()
  for (const [id, rank] of vectorRanks) {
    scores.set(id, (scores.get(id) || 0) + 1 / (RRF_K + rank))
  }
  for (const [id, rank] of ftsRanks) {
    scores.set(id, (scores.get(id) || 0) + 1 / (RRF_K + rank))
  }

  const topIds = [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id]) => id)

  if (topIds.length === 0) {
    const response = chapterId
      ? "I couldn't find relevant information in this chapter to answer your question."
      : "I couldn't find relevant information in the PDF to answer your question."
    insertMessage(pdfId, chapterId, 'assistant', response, { confidence: 'low' })
    window.webContents.send('chat:stream', response)
    window.webContents.send('chat:done', { confidence: 'low' })
    return
  }

  const chunks = getChunksByIds(topIds)
  const chunksMap = new Map(chunks.map((c) => [c.id, c]))
  const rankedChunks: RankedChunk[] = topIds
    .map((id) => {
      const chunk = chunksMap.get(id)
      if (!chunk) return null
      return { ...chunk, score: scores.get(id) || 0 }
    })
    .filter((c): c is RankedChunk => c !== null)

  // Step 4: Semantic re-ranking
  let rerankedChunks = rankedChunks
  if (rankedChunks.length > 2) {
    try {
      const { object: reranked } = await generateObject({
        model: google(chatModel),
        schema: RerankedResultsSchema,
        system: `You are a search result reranker. Given a query and candidate chunks,
                 return chunk IDs ordered by relevance to answering the query.
                 Consider semantic meaning, not just keyword matches.`,
        prompt: `Query: ${query}\n\nCandidate chunks:\n${rankedChunks
          .map((c) => `[ID: ${c.id}] ${c.content.slice(0, 500)}`)
          .join('\n\n')}`
      })

      const rerankedMap = new Map(rankedChunks.map((c) => [c.id, c]))
      rerankedChunks = reranked.rankedChunkIds
        .map((id) => rerankedMap.get(id))
        .filter((c): c is RankedChunk => c !== undefined)
    } catch (err) {
      console.error('[RAG] Re-ranking failed, using RRF ranking:', err)
    }
  }

  // Step 5: Build context with token limit
  const contextChunks: RankedChunk[] = []
  let tokenCount = 0
  for (const chunk of rerankedChunks.slice(0, 5)) {
    const tokens = chunk.token_count ?? estimateTokens(chunk.content)
    if (tokenCount + tokens > MAX_CONTEXT_TOKENS) break
    contextChunks.push(chunk)
    tokenCount += tokens
  }

  const context = contextChunks
    .map(
      (c) =>
        `[Chunk ${c.id}${c.heading ? ` - ${c.heading}` : ''}, Pages ${c.page_start}-${c.page_end}]\n${c.content}`
    )
    .join('\n\n---\n\n')

  // Step 6: Stream response
  const { textStream, text } = streamText({
    model: google(chatModel),
    system: `You are a helpful assistant that answers questions about a PDF document.
             Answer based ONLY on the provided context. If the context doesn't contain
             enough information to answer, say so clearly.
             Do not make up information not present in the context.
             Answer directly without meta-references like "The text mentions...",
             "According to the document...", or "The provided context...".`,
    prompt: `Context from the PDF:\n${context}\n\nQuestion: ${query}`
  })

  let fullResponse = ''
  for await (const chunk of textStream) {
    fullResponse += chunk
    window.webContents.send('chat:stream', chunk)
  }

  // Ensure we have the full text
  fullResponse = await text

  // Step 7: Generate metadata
  let metadata: ChatResponseMetadata = { confidence: 'medium' }
  try {
    const { object } = await generateObject({
      model: google(chatModel),
      schema: ChatResponseMetadataSchema,
      prompt: `Given this answer to a question, extract metadata.

Question: ${query}

Answer: ${fullResponse}

Context chunks used (with IDs and pages):
${contextChunks.map((c) => `[ID: ${c.id}, Pages: ${c.page_start}-${c.page_end}] ${c.content.slice(0, 300)}`).join('\n\n')}`
    })
    metadata = object
  } catch (err) {
    console.error('[RAG] Metadata generation failed:', err)
  }

  // Save assistant message
  insertMessage(pdfId, chapterId, 'assistant', fullResponse, metadata)

  window.webContents.send('chat:done', metadata)
}

export function getChatHistory(pdfId: number, chapterId: number | null = null): {
  id: number
  role: string
  content: string
  metadata: ChatResponseMetadata | null
}[] {
  const messages = getMessagesByPdfId(pdfId, chapterId)
  return messages.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    metadata: m.metadata ? JSON.parse(m.metadata) : null
  }))
}
