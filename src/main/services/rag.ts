import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { streamText, generateObject, generateText } from 'ai'
import { BrowserWindow } from 'electron'
import {
  vectorSearch,
  ftsSearch,
  getChunksByIds,
  insertMessage,
  getMessagesByPdfId,
  getConversationSummary,
  upsertConversationSummary
} from './database'
import { generateEmbedding } from './embeddings'
import { getApiKey, getChatModel } from './settings'
import { estimateTokens } from '../lib/token-counter'
import { RerankedResultsSchema, ChatResponseMetadataSchema } from '../lib/schemas'
import type { ChatResponseMetadata } from '../lib/schemas'

const MAX_CONTEXT_TOKENS = 8000
const MAX_HISTORY_TOKENS = 16000
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

interface Message {
  id: number
  role: string
  content: string
}

async function summarizeMessages(
  messages: Message[],
  google: ReturnType<typeof createGoogleGenerativeAI>,
  model: string
): Promise<string> {
  const formatted = messages
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n\n')

  const { text } = await generateText({
    model: google(model),
    system: 'Summarize this conversation in 2-3 sentences, capturing key topics discussed and conclusions reached.',
    prompt: formatted
  })
  return text
}

export async function buildConversationHistory(
  pdfId: number,
  chapterId: number | null,
  google: ReturnType<typeof createGoogleGenerativeAI>,
  model: string
): Promise<string> {
  const messages = getMessagesByPdfId(pdfId, chapterId)
  if (messages.length === 0) return ''

  // Calculate total tokens
  let totalTokens = 0
  const tokenCounts: number[] = []
  for (const msg of messages) {
    const tokens = estimateTokens(`${msg.role}: ${msg.content}`)
    tokenCounts.push(tokens)
    totalTokens += tokens
  }

  // Format message for output
  const formatMessage = (m: Message) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`

  // Under budget: return all messages verbatim
  if (totalTokens <= MAX_HISTORY_TOKENS) {
    return messages.map(formatMessage).join('\n\n')
  }

  // Over budget: split 50/50, summarize older half
  const midpoint = Math.floor(messages.length / 2)
  const olderMessages = messages.slice(0, midpoint)
  const recentMessages = messages.slice(midpoint)

  // Check if we have a valid cached summary
  const cached = getConversationSummary(pdfId, chapterId)
  const lastOldMessageId = olderMessages[olderMessages.length - 1]?.id

  let summary: string
  if (cached && cached.lastMessageId === lastOldMessageId) {
    summary = cached.summary
  } else {
    summary = await summarizeMessages(olderMessages, google, model)
    if (lastOldMessageId) {
      upsertConversationSummary(pdfId, chapterId, summary, lastOldMessageId)
    }
  }

  const recentFormatted = recentMessages.map(formatMessage).join('\n\n')
  return `[Earlier in conversation: ${summary}]\n\n${recentFormatted}`
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

  // Build conversation history
  const history = await buildConversationHistory(pdfId, chapterId, google, chatModel)

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
  const prompt = history
    ? `Conversation history:\n${history}\n\nContext from the PDF:\n${context}\n\nQuestion: ${query}`
    : `Context from the PDF:\n${context}\n\nQuestion: ${query}`

  const { textStream, text } = streamText({
    model: google(chatModel),
    system: `You are a helpful assistant that answers questions about a PDF document.
             Use conversation history for context about prior discussion.
             Answer based ONLY on the provided PDF context. If the context doesn't contain
             enough information to answer, say so clearly.
             Do not make up information not present in the context.
             Answer directly without meta-references like "The text mentions...",
             "According to the document...", or "The provided context...".`,
    prompt
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
