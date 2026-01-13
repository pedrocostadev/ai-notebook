/**
 * Benchmark script for PDF processing performance
 * Run with: npx ts-node scripts/benchmark.ts
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf'

const SAMPLE_PDF = join(__dirname, '../pdfs/book_ai_enginering.pdf')
const CHUNK_SIZE = 1500
const CHUNK_OVERLAP = 200
const ITERATIONS = 3

interface BenchmarkResult {
  name: string
  avgMs: number
  minMs: number
  maxMs: number
}

async function benchmark(name: string, fn: () => Promise<void>, iterations = ITERATIONS): Promise<BenchmarkResult> {
  const times: number[] = []

  // Warmup
  await fn()

  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    await fn()
    times.push(performance.now() - start)
  }

  return {
    name,
    avgMs: times.reduce((a, b) => a + b, 0) / times.length,
    minMs: Math.min(...times),
    maxMs: Math.max(...times)
  }
}

async function main() {
  console.log('PDF Processing Benchmark')
  console.log('========================\n')
  console.log(`Sample PDF: ${SAMPLE_PDF}`)
  console.log(`Iterations: ${ITERATIONS}\n`)

  const results: BenchmarkResult[] = []

  // Pre-load PDF for subsequent benchmarks
  let pages: string[] = []
  let fullText = ''

  // 1. PDF Loading
  results.push(await benchmark('PDF Load (PDFLoader)', async () => {
    const loader = new PDFLoader(SAMPLE_PDF, { parsedItemSeparator: '\n' })
    const docs = await loader.load()
    pages = docs.map(d => d.pageContent)
    fullText = pages.join('\n\n')
  }))

  console.log(`PDF loaded: ${pages.length} pages, ${fullText.length} chars\n`)

  // 2. File hashing
  results.push(await benchmark('File Hash (SHA256)', async () => {
    const buffer = readFileSync(SAMPLE_PDF)
    createHash('sha256').update(buffer).digest('hex')
  }))

  // 3. Text splitting
  let chunks: string[] = []
  results.push(await benchmark('Text Splitting', async () => {
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: CHUNK_SIZE,
      chunkOverlap: CHUNK_OVERLAP
    })
    chunks = await splitter.splitText(fullText)
  }))

  console.log(`Chunks created: ${chunks.length}\n`)

  // 4. Chunk position finding - OLD WAY (indexOf loop)
  results.push(await benchmark('Chunk Positions (OLD - indexOf)', async () => {
    let searchStart = 0
    for (const chunk of chunks) {
      const pos = fullText.indexOf(chunk, searchStart)
      searchStart = Math.max(0, (pos >= 0 ? pos : searchStart) + chunk.length - CHUNK_OVERLAP)
    }
  }))

  // 5. Chunk position finding - NEW WAY (expected position)
  results.push(await benchmark('Chunk Positions (NEW - expected)', async () => {
    let expectedPos = 0
    for (const chunk of chunks) {
      let actualPos = expectedPos
      if (expectedPos + chunk.length <= fullText.length) {
        const expectedSubstr = fullText.substring(expectedPos, expectedPos + chunk.length)
        if (expectedSubstr !== chunk) {
          const windowStart = Math.max(0, expectedPos - 500)
          const windowEnd = Math.min(fullText.length, expectedPos + chunk.length + 500)
          const window = fullText.substring(windowStart, windowEnd)
          const posInWindow = window.indexOf(chunk)
          if (posInWindow >= 0) {
            actualPos = windowStart + posInWindow
          }
        }
      }
      expectedPos = actualPos + chunk.length - CHUNK_OVERLAP
    }
  }))

  // 6. Page boundary computation
  results.push(await benchmark('Page Boundaries', async () => {
    let currentIdx = 0
    for (let i = 0; i < pages.length; i++) {
      const boundary = {
        pageNumber: i + 1,
        startIdx: currentIdx,
        endIdx: currentIdx + pages[i].length
      }
      currentIdx += pages[i].length + 2
    }
  }))

  // 7. Token estimation - simple
  results.push(await benchmark('Token Estimation (simple)', async () => {
    for (const chunk of chunks) {
      Math.ceil(chunk.length / 4)
    }
  }))

  // 8. Token estimation - with cache simulation
  const tokenCache = new Map<string, number>()
  results.push(await benchmark('Token Estimation (cached)', async () => {
    for (const chunk of chunks) {
      const key = chunk.length <= 100 ? chunk : `${chunk.slice(0, 100)}:${chunk.length}`
      if (!tokenCache.has(key)) {
        tokenCache.set(key, Math.ceil(chunk.length / 4))
      }
      tokenCache.get(key)
    }
  }))

  // Print results
  console.log('\nResults')
  console.log('-------')
  console.log('| Operation | Avg (ms) | Min (ms) | Max (ms) |')
  console.log('|-----------|----------|----------|----------|')

  for (const r of results) {
    console.log(`| ${r.name.padEnd(35)} | ${r.avgMs.toFixed(2).padStart(8)} | ${r.minMs.toFixed(2).padStart(8)} | ${r.maxMs.toFixed(2).padStart(8)} |`)
  }

  // Calculate improvements
  const oldChunkPos = results.find(r => r.name.includes('OLD'))!
  const newChunkPos = results.find(r => r.name.includes('NEW'))!
  const improvement = ((oldChunkPos.avgMs - newChunkPos.avgMs) / oldChunkPos.avgMs * 100).toFixed(1)

  console.log('\n\nKey Improvements')
  console.log('----------------')
  console.log(`Chunk position finding: ${improvement}% faster (${oldChunkPos.avgMs.toFixed(2)}ms → ${newChunkPos.avgMs.toFixed(2)}ms)`)

  // Estimate full processing improvement
  const pdfLoadTime = results[0].avgMs
  const oldTotal = pdfLoadTime * 4 + oldChunkPos.avgMs // 4 loads per chapter (old)
  const newTotal = pdfLoadTime * 1 + newChunkPos.avgMs // 1 load (cached) + new positions
  const totalImprovement = ((oldTotal - newTotal) / oldTotal * 100).toFixed(1)

  console.log(`\nEstimated per-chapter improvement: ${totalImprovement}%`)
  console.log(`  Old: ${oldTotal.toFixed(0)}ms (4x PDF load + indexOf)`)
  console.log(`  New: ${newTotal.toFixed(0)}ms (1x PDF load + expected pos)`)
}

main().catch(console.error)
