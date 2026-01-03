# AI-Notebook Implementation Plan

## Tech Stack

- **Desktop**: Electron (Electron Forge + electron-vite)
- **Frontend**: React 19 + TypeScript + Tailwind CSS v4 + shadcn-ui
- **AI**: Google Gemini via AI-SDK (`@ai-sdk/google`)
  - Chat: `gemini-2.5-flash-lite`
  - Embeddings: `gemini-embedding-001` (3072 dims)
- **Vector DB**: SQLite + sqlite-vec
- **PDF**: LangChain.js (`@langchain/community` PDFLoader + `pdf-parse`)

## Project Structure

```
ai-notebook/
├── src/
│   ├── main/                      # Electron main process
│   │   ├── index.ts               # Entry, window creation
│   │   ├── ipc/
│   │   │   ├── handlers.ts        # IPC registration
│   │   │   ├── pdf.handlers.ts    # PDF processing
│   │   │   └── chat.handlers.ts   # Chat/RAG
│   │   ├── services/
│   │   │   ├── database.ts        # SQLite + sqlite-vec + FTS5
│   │   │   ├── pdf-processor.ts   # PDF loading + chunking
│   │   │   ├── ocr.ts             # Tesseract.js OCR service
│   │   │   ├── embeddings.ts      # Gemini embeddings
│   │   │   ├── job-queue.ts       # Background job processing
│   │   │   └── rag.ts             # RAG pipeline
│   │   └── lib/
│   │       ├── heading-detector.ts
│   │       ├── schemas.ts         # Zod schemas for type-safe LLM calls
│   │       └── token-counter.ts   # Gemini countTokens API wrapper
│   ├── preload/
│   │   ├── index.ts               # contextBridge API
│   │   └── index.d.ts             # Type declarations
│   └── renderer/
│       └── src/
│           ├── components/
│           │   ├── ui/            # shadcn
│           │   ├── layout/        # Sidebar, MainContent
│           │   ├── pdf/           # PdfList, PdfUpload, PasswordDialog
│           │   └── chat/          # ChatContainer, MessageList, ChatInput
│           └── hooks/
│               ├── usePdfs.ts
│               └── useChat.ts
├── e2e/                           # Playwright E2E tests
│   └── chat.spec.ts
└── # Data stored in app.getPath('userData')
    # - /pdfs/           (copied PDF files)
    # - /ai-notebook.db  (SQLite database)
```

## SQLite Schema

```sql
CREATE TABLE pdfs (
  id INTEGER PRIMARY KEY,
  filename TEXT NOT NULL,
  filepath TEXT NOT NULL,
  file_hash TEXT UNIQUE,
  file_size INTEGER,  -- bytes, max 50MB enforced at upload
  page_count INTEGER,
  status TEXT CHECK(status IN ('pending', 'processing', 'done', 'error')) DEFAULT 'pending',
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE chunks (
  id INTEGER PRIMARY KEY,
  pdf_id INTEGER REFERENCES pdfs(id) ON DELETE CASCADE,
  chunk_index INTEGER,
  content TEXT,
  heading TEXT,
  page_start INTEGER,
  page_end INTEGER,
  token_count INTEGER  -- cached Gemini token count
);

CREATE TABLE messages (
  id INTEGER PRIMARY KEY,
  pdf_id INTEGER REFERENCES pdfs(id) ON DELETE CASCADE,
  role TEXT CHECK(role IN ('user', 'assistant')),
  content TEXT,
  metadata JSON,  -- citations, confidence, followUpQuestions
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Job queue for embedding generation
CREATE TABLE jobs (
  id INTEGER PRIMARY KEY,
  pdf_id INTEGER REFERENCES pdfs(id) ON DELETE CASCADE,
  type TEXT CHECK(type IN ('embed', 'ocr')),
  status TEXT CHECK(status IN ('pending', 'running', 'done', 'failed')) DEFAULT 'pending',
  attempts INTEGER DEFAULT 0,
  last_error TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- sqlite-vec for vector search
CREATE VIRTUAL TABLE vec_chunks USING vec0(
  chunk_id INTEGER PRIMARY KEY,
  embedding FLOAT[3072]
);

-- FTS5 for full-text search (replaces okapibm25)
CREATE VIRTUAL TABLE chunks_fts USING fts5(
  content,
  content_rowid=id,
  tokenize='porter unicode61'
);

-- Trigger to sync FTS5 with chunks table
CREATE TRIGGER chunks_ai AFTER INSERT ON chunks BEGIN
  INSERT INTO chunks_fts(rowid, content) VALUES (new.id, new.content);
END;

CREATE TRIGGER chunks_ad AFTER DELETE ON chunks BEGIN
  DELETE FROM chunks_fts WHERE rowid = old.id;
END;

-- Trigger to cleanup vec_chunks when chunk is deleted
CREATE TRIGGER chunks_vec_ad AFTER DELETE ON chunks BEGIN
  DELETE FROM vec_chunks WHERE chunk_id = old.id;
END;
```

## PDF Processing Pipeline

1. Load PDF with `PDFLoader`
2. Detect headings via:

   **Primary: Font metadata (if available from pdf-parse)**

   - Font size > base size
   - Bold/weight detection

   **Fallback: Regex patterns**

   ```typescript
   const HEADING_PATTERNS = [
     /^Chapter\s+\d+/i, // Chapter 1, CHAPTER 2
     /^Part\s+([IVX]+|\d+)/i, // Part I, Part 3
     /^Section\s+([IVX]+|\d+(\.\d+)*)/i, // Section IV, Section 1.2
     /^Appendix\s+[A-Z\d]/i, // Appendix A, Appendix 1
     /^(\d+\.)+\s+[A-Z]/, // 1.2.3 Title
     /^(Introduction|Conclusion|Abstract|Summary|References|Bibliography|Acknowledgments)$/i,
     /^[A-Z][A-Z\s]{10,50}$/, // ALL CAPS (10-50 chars to reduce false positives)
   ];
   ```

3. Split by headings, then `RecursiveCharacterTextSplitter` (1500 chars, 200 overlap)
4. Generate embeddings in batches via `gemini-embedding-001`
5. Store chunks + embeddings in SQLite

## RAG Query Flow (Hybrid Search + RRF + Re-ranking)

1. Embed user question
2. **Parallel search:**
   - Vector search: `SELECT chunk_id, distance FROM vec_chunks WHERE embedding MATCH ? LIMIT 20`
   - FTS5 search: `SELECT chunk_id FROM chunks_fts WHERE content MATCH ? LIMIT 20`
   - **FTS5 query sanitization** (escape special chars):
     ```typescript
     function escapeFTS5Query(query: string): string {
       return query
         .replace(/"/g, '""')
         .split(/\s+/)
         .filter((t) => t.length > 0)
         .map((t) => `"${t}"`)
         .join(" ");
     }
     ```
3. **Reciprocal Rank Fusion (k=60):**
   ```typescript
   // Combine rankings from vector + BM25
   function rrf(vectorRanks: Map<id, rank>, bm25Ranks: Map<id, rank>, k = 60) {
     const scores = new Map<id, number>();
     for (const [id, rank] of vectorRanks) {
       scores.set(id, (scores.get(id) || 0) + 1 / (k + rank));
     }
     for (const [id, rank] of bm25Ranks) {
       scores.set(id, (scores.get(id) || 0) + 1 / (k + rank));
     }
     return [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
   }
   ```
4. **Semantic re-ranking with Gemini:**

   ```typescript
   import { generateObject } from "ai";
   import { google } from "@ai-sdk/google";
   import { z } from "zod";

   const RerankedResultsSchema = z.object({
     rankedChunkIds: z
       .array(z.number())
       .describe("Chunk IDs ordered by relevance, most relevant first"),
     reasoning: z
       .string()
       .optional()
       .describe("Brief explanation of ranking decisions"),
   });

   const reranked = await generateObject({
     model: google("gemini-2.5-flash-lite"),
     system: `You are a search result reranker. Given a query and candidate chunks,
              return chunk IDs ordered by relevance to answering the query.
              Consider semantic meaning, not just keyword matches.`,
     schema: RerankedResultsSchema,
     prompt: `Query: ${query}\n\nCandidate chunks:\n${chunks
       .map((c) => `[ID: ${c.id}] ${c.content.slice(0, 500)}`)
       .join("\n\n")}`,
   });
   ```

5. Retrieve top 5 re-ranked chunks
6. Build prompt with context
7. **Two-phase response:**

   ```typescript
   // Phase 1: Stream the answer
   const { textStream } = await streamText({
     model: google("gemini-2.5-flash-lite"),
     system: "Answer based on the provided context...",
     prompt: `Context:\n${context}\n\nQuestion: ${query}`,
   });
   for await (const chunk of textStream) {
     event.sender.send("chat:stream", chunk);
   }

   // Phase 2: Generate metadata (citations, confidence, follow-ups)
   const metadata = await generateObject({
     model: google("gemini-2.5-flash-lite"),
     schema: ChatResponseMetadataSchema,
     prompt: `Given answer and context, extract citations and confidence...`,
   });
   event.sender.send("chat:metadata", metadata.object);
   ```

## NPM Packages

```
# Dependencies
react@19, react-dom@19, @ai-sdk/google, ai, better-sqlite3, sqlite-vec
@langchain/community, @langchain/textsplitters, pdf-parse
tesseract.js, @google/generative-ai, zod, dotenv
clsx, tailwind-merge, class-variance-authority, lucide-react

# DevDependencies
electron, electron-vite, @vitejs/plugin-react, typescript
@types/react@19, @types/react-dom@19
tailwindcss, @tailwindcss/vite, @electron-forge/*
vitest, @playwright/test
```

**Note**: `@google/generative-ai` is for the `countTokens` API (accurate Gemini token counting).

**Note on shadcn-ui**: Not an npm package. Use CLI to copy components into project:

```bash
npx shadcn@latest init
npx shadcn@latest add button input scroll-area card sheet
```

Components copied to `src/renderer/src/components/ui/`.

**Tailwind v4 + shadcn-ui Config**:

- Use `@theme inline` instead of `@layer base`
- Colors use OKLCH format
- Remove `forwardRef` from components, add `data-slot` attributes
- See: https://ui.shadcn.com/docs/tailwind-v4

## Implementation Phases

### 1. Project Scaffold

- `npm create electron-vite@latest ai-notebook`
- **Build workflow**: electron-vite (dev/build) → Electron Forge (packaging)
  - Dev: `npm run dev` (electron-vite)
  - Build: `npm run build && npm run make` (vite → forge)
- Configure Tailwind v4 (see config notes above)
- Init shadcn-ui (button, input, scroll-area, card, sheet)

### 2. Database Layer

- Setup better-sqlite3 + sqlite-vec
- Create schema with FTS5 tables and triggers
- Create jobs table for queue system
- CRUD operations for pdfs, chunks, messages, jobs
- Add electron-rebuild for native modules
- Use `app.getPath('userData')` for DB location

### 3. PDF Processing

- **File size validation**: Reject files > 50MB at upload
  ```typescript
  const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
  if (stats.size > MAX_FILE_SIZE) throw new Error("File exceeds 50MB limit");
  ```
- Implement PDFLoader + heading detector
- RecursiveCharacterTextSplitter
- **OCR auto-detection**: Trigger if < 50 chars/page extracted
  ```typescript
  const MIN_CHARS_PER_PAGE = 50;
  const avgChars = pages.reduce((s, p) => s + p.text.length, 0) / pages.length;
  if (avgChars < MIN_CHARS_PER_PAGE) await runOCR(filepath);
  ```
- **Password-protected PDF handling**:
  1. Catch password error from PDFLoader
  2. IPC: `pdf:password-required` → renderer shows PasswordDialog
  3. IPC: `pdf:submit-password` → retry with password (max 3 attempts)
- Duplicate detection (navigate to existing, show toast)
- Copy PDF to `app.getPath('userData')/pdfs/`
- IPC handlers for upload with progress events
- Unit tests (Vitest):

```typescript
// src/main/lib/__tests__/heading-detector.test.ts
describe("detectHeadings", () => {
  it('detects "Chapter X" pattern', () => {
    expect(detectHeadings("Chapter 1: Introduction")).toEqual([
      { heading: "Chapter 1: Introduction", startIdx: 0 },
    ]);
  });
  it("detects numbered sections", () => {
    expect(detectHeadings("1.2.3 Methods")).toEqual([
      { heading: "1.2.3 Methods", startIdx: 0 },
    ]);
  });
});

// src/main/services/__tests__/pdf-processor.test.ts
describe("chunkText", () => {
  it("respects chunk size", () => {
    const chunks = chunkText(longText, { size: 1500, overlap: 200 });
    chunks.forEach((c) => expect(c.length).toBeLessThanOrEqual(1500));
  });
  it("maintains overlap", () => {
    const chunks = chunkText(longText, { size: 100, overlap: 20 });
    expect(chunks[1].startsWith(chunks[0].slice(-20))).toBe(true);
  });
});
```

- Test with `pdfs/book_ai_enginering.pdf`

### 4. Embeddings & Vector Store

- Gemini embedding service
- Job queue with exponential backoff for rate limits
- Batch embedding generation (background processing)
- sqlite-vec storage + search
- **Token counting with Gemini `countTokens` API**:

  ```typescript
  import { GoogleGenerativeAI } from "@google/generative-ai";
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

  async function countTokens(text: string): Promise<number> {
    const { totalTokens } = await model.countTokens(text);
    return totalTokens;
  }
  ```

- Cache token counts in `chunks.token_count` column (computed once per chunk)
- Test: verify `pdfs/book_ai_enginerring.pdf` vectors saved to DB

### 5. RAG Pipeline

- Hybrid search (vector + FTS5)
- RRF fusion
- Semantic re-ranking with `generateObject` + Zod schema
- Two-phase response: streamText → generateObject (metadata)
- **Context window management** (cap at 8000 tokens for fast responses):
  ```typescript
  const MAX_CONTEXT_TOKENS = 8000;
  async function buildContext(chunks: Chunk[]): Promise<string> {
    let context = "",
      tokenCount = 0;
    for (const chunk of chunks) {
      const tokens = chunk.token_count ?? (await countTokens(chunk.content));
      if (tokenCount + tokens > MAX_CONTEXT_TOKENS) break;
      context += `\n---\n${chunk.content}`;
      tokenCount += tokens;
    }
    return context;
  }
  ```
- Implement chat guardrails:
  - Input validation (max length, sanitization)
  - System prompt protection (prevent injection)
  - Token limit checks before API call
- Test: query `pdfs/book_ai_enginerring.pdf` and verify relevant context retrieved + response generated

### 6. UI

- Sidebar (PDF list with processing status indicators)
- PdfUpload (drag-drop)
- PasswordDialog for protected PDFs
- Progress bar for PDF processing
- Duplicate upload toast notification
- ChatContainer + MessageList + ChatInput
- Streaming response + metadata display (citations, confidence, follow-ups)
- E2E test with Playwright:

```typescript
// e2e/chat.spec.ts
test("upload PDF and chat", async () => {
  const app = await electron.launch({ args: ["."] });
  const window = await app.firstWindow();

  // Upload PDF
  await window
    .locator('[data-testid="pdf-upload"]')
    .setInputFiles("pdfs/book_ai_enginerring.pdf");
  await expect(window.locator('[data-testid="pdf-list"]')).toContainText(
    "book_ai_enginerring"
  );

  // Send chat message
  await window
    .locator('[data-testid="chat-input"]')
    .fill("What is this book about?");
  await window.locator('[data-testid="chat-submit"]').click();

  // Verify response
  await expect(window.locator('[data-testid="message-assistant"]')).toBeVisible(
    { timeout: 30000 }
  );

  await app.close();
});
```

### 7. Polish & Packaging

- Error handling, loading states
- App icons
- Configure asarUnpack for native modules
- Update CLAUDE.md with:
  - Build/test commands
  - Architecture overview
  - Key files and their purposes

```json
// forge.config.ts
{
  "asar": true,
  "asarUnpack": [
    "**/*.node",
    "**/*.dylib",
    "**/*.so",
    "**/*.dll",
    "node_modules/better-sqlite3/**/*",
    "node_modules/sqlite-vec/**/*"
  ]
}
```

## Critical Files

- `src/main/lib/schemas.ts` - Zod schemas for type-safe LLM calls
- `src/main/lib/token-counter.ts` - Context window management
- `src/main/services/database.ts` - SQLite + sqlite-vec + FTS5 setup
- `src/main/services/pdf-processor.ts` - PDF loading, chunking
- `src/main/services/ocr.ts` - Tesseract.js for scanned PDFs
- `src/main/services/job-queue.ts` - Background processing with retries
- `src/main/services/rag.ts` - Hybrid search + RRF + re-ranking + streaming
- `src/preload/index.ts` - IPC API surface
- `src/preload/index.d.ts` - TypeScript declarations for IPC
- `src/renderer/src/hooks/useChat.ts` - Streaming + metadata state

## Design Decisions

- **Single PDF per chat** - each chat session is scoped to one PDF
- **Two-phase chat response** - stream answer first, then generate metadata (citations, confidence)
- **SQLite FTS5** - replaces okapibm25 for persistent full-text search
- **OCR support** - Tesseract.js for scanned PDFs
- **Background processing** - large PDFs processed incrementally with progress UI
- **Password-protected PDFs** - prompt user for password
- **Duplicate handling** - navigate to existing PDF, show toast
- **Job queue** - background embedding with exponential backoff for rate limits
- **PDF storage** - copy to `app.getPath('userData')/pdfs/`
- **File size limit** - 50MB max per PDF
- **Token counting** - Gemini `countTokens` API, cached in DB per chunk
- **Context limit** - 8000 tokens max for fast responses
- **Vector cleanup** - SQLite triggers auto-delete from vec_chunks
- **Type-safe LLM calls** - all `generateObject` calls use Zod schemas:

```typescript
// src/main/lib/schemas.ts
import { z } from "zod";

// Re-ranking schema
export const RerankedResultsSchema = z.object({
  rankedChunkIds: z
    .array(z.number())
    .describe(
      "Array of chunk IDs sorted by relevance to the query. " +
        "The first ID is the most relevant, last is least relevant. " +
        "Only include IDs from the provided candidate chunks."
    ),
  reasoning: z
    .string()
    .optional()
    .describe(
      "Brief explanation of why the top chunks were ranked highest. " +
        "Focus on semantic relevance to the query, not keyword matches."
    ),
});

// Chat metadata schema (generated after streaming answer)
export const ChatResponseMetadataSchema = z.object({
  citations: z
    .array(
      z.object({
        chunkId: z
          .number()
          .describe("The ID of the chunk this citation comes from"),
        quote: z
          .string()
          .describe(
            "An exact quote from the chunk that supports your answer. " +
              "Keep quotes concise (1-2 sentences max)."
          ),
      })
    )
    .optional()
    .describe(
      "Citations from the source chunks that support your answer. " +
        "Include 1-3 citations for factual claims. " +
        "Omit if the answer is a general statement not tied to specific text."
    ),
  confidence: z
    .enum(["high", "medium", "low"])
    .describe(
      "Your confidence in the answer based on context quality. " +
        "high: context directly answers the question. " +
        "medium: context partially answers or requires inference. " +
        "low: context is tangentially related or insufficient."
    ),
  followUpQuestions: z
    .array(z.string())
    .optional()
    .describe(
      "2-3 natural follow-up questions the user might ask next. " +
        "Questions should be answerable from the PDF content. " +
        "Omit if the topic is fully covered."
    ),
});

// Heading detection schema (for ambiguous cases)
export const HeadingAnalysisSchema = z.object({
  headings: z
    .array(
      z.object({
        text: z
          .string()
          .describe("The exact heading text as it appears in the document"),
        level: z
          .number()
          .min(1)
          .max(6)
          .describe(
            "Heading hierarchy level (1=main title, 2=chapter, 3=section, etc.). " +
              "Infer from context: font size, numbering patterns, document structure."
          ),
        startIndex: z
          .number()
          .describe("Character index where this heading starts in the text"),
      })
    )
    .describe(
      "All detected headings in the document, in order of appearance. " +
        "Include chapter titles, section headers, and subsection headers. " +
        "Exclude: table of contents entries, headers/footers, captions."
    ),
});

// Type exports
export type RerankedResults = z.infer<typeof RerankedResultsSchema>;
export type ChatResponseMetadata = z.infer<typeof ChatResponseMetadataSchema>;
export type HeadingAnalysis = z.infer<typeof HeadingAnalysisSchema>;
```

## Sources

- [AI SDK Google Provider](https://ai-sdk.dev/providers/ai-sdk-providers/google-generative-ai)
- [Gemini Embedding](https://ai.google.dev/gemini-api/docs/embeddings)
- [sqlite-vec](https://github.com/asg017/sqlite-vec)
- [LangChain.js PDFLoader](https://js.langchain.com/docs/integrations/document_loaders/file_loaders/pdf/)
- [electron-shadcn template](https://github.com/LuanRoger/electron-shadcn)
