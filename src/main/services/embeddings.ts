import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { embedMany } from 'ai'
import { getApiKey } from './settings'

const EMBEDDING_MODEL = 'text-embedding-004'
const BATCH_SIZE = 100

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const apiKey = getApiKey()
  if (!apiKey) {
    throw new Error('API key not configured')
  }

  const google = createGoogleGenerativeAI({ apiKey })
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
