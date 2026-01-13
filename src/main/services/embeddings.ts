import { createGoogleGenerativeAI, type GoogleGenerativeAIProvider } from '@ai-sdk/google'
import { embedMany } from 'ai'
import { getApiKey } from './settings'

const EMBEDDING_MODEL = 'text-embedding-004'
const BATCH_SIZE = 100

// Singleton client - reused across calls to avoid connection overhead
let cachedClient: GoogleGenerativeAIProvider | null = null
let cachedApiKey: string | null = null

function getGoogleClient(): GoogleGenerativeAIProvider {
  const apiKey = getApiKey()
  if (!apiKey) {
    throw new Error('API key not configured')
  }

  // Recreate client only if API key changed
  if (!cachedClient || cachedApiKey !== apiKey) {
    cachedClient = createGoogleGenerativeAI({ apiKey })
    cachedApiKey = apiKey
  }

  return cachedClient
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const google = getGoogleClient()
  const embeddings: number[][] = []

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE)
    const { embeddings: batchEmbeddings } = await embedMany({
      model: google.textEmbeddingModel(EMBEDDING_MODEL),
      values: batch,
      abortSignal: AbortSignal.timeout(60000)
    })
    embeddings.push(...batchEmbeddings)
  }

  return embeddings
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const [embedding] = await generateEmbeddings([text])
  return embedding
}
