# AGENTS.md

## What

AI Notebook - Electron desktop app for chatting with PDFs using RAG.

**Stack:** Electron + React 19 + TypeScript + Tailwind v4 + shadcn-ui + SQLite (sqlite-vec + FTS5) + Google Gemini

## Why

Users upload PDFs, the app extracts chapters via AI-powered TOC parsing, generates embeddings for semantic search, and enables contextual Q&A per chapter or whole document.

## How

### Commands

```bash
npm run dev      # Dev server
npm run build    # Production build
npm run make     # Package app (requires build first)
npm run test     # E2E tests (requires build first)
```

### Structure

```
src/main/           # Electron main process
  ipc/              # IPC handlers
  services/         # Core: database, rag, embeddings, pdf-processor, job-queue
src/preload/        # contextBridge API (index.ts)
src/renderer/src/   # React frontend
  components/       # ui/, chat/, pdf/, settings/, layout/
  hooks/            # useChat, usePdfs, useSettings, useCommandExecution
e2e/                # Playwright tests
dist/               # Packaged app output
```

### Data Flow

1. PDF → TOC parsed → chapters created → chunks extracted → embeddings (background job)
2. Query → embed → hybrid search (vector + FTS5) → RRF fusion → re-rank → stream response

### User Data

`~/Library/Application Support/ai-notebook/` contains `ai-notebook.db` and `pdfs/`

## Rules

- Be concise in all output and commits
- Add E2E test for new features
- End plans with unresolved questions (if any)
