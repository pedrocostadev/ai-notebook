# CLAUDE.md

This file provides guidance to Claude Code when working with this codebase.

## Project

AI Notebook - Electron desktop app for chatting with PDFs using RAG (Retrieval-Augmented Generation).

## Commands

```bash
npm run dev          # Start dev server
npm run build        # Build for production
npm run make         # Package app (after build)
npm run test         # Run unit tests (Vitest)
npm run test:e2e     # Run E2E tests (Playwright)
```

## Architecture

- **Desktop**: Electron (electron-vite + Electron Forge)
- **Frontend**: React 19 + TypeScript + Tailwind CSS v4 + shadcn-ui
- **AI**: Google Gemini via AI-SDK
- **Vector DB**: SQLite + sqlite-vec + FTS5

### Key Directories

```
src/main/            # Electron main process
  ipc/               # IPC handlers (pdf, chat, settings)
  services/          # Core services (database, rag, embeddings, job-queue, pdf-processor, toc-parser)
  lib/               # Utilities (schemas, token-counter)
src/preload/         # contextBridge API
src/renderer/src/    # React frontend
  components/        # UI components (ui/, layout/, settings/, pdf/, chat/)
  hooks/             # React hooks (useChat, usePdfs, useSettings)
e2e/                 # Playwright E2E tests
```

### Key Files

- `src/main/services/database.ts` - SQLite + sqlite-vec + FTS5
- `src/main/services/rag.ts` - Hybrid search + RRF + re-ranking + streaming
- `src/main/services/pdf-processor.ts` - PDF loading, chunking, chapter extraction
- `src/main/services/job-queue.ts` - Background job processing for embeddings
- `src/main/services/toc-parser.ts` - AI-powered table of contents extraction
- `src/main/services/settings.ts` - API key encryption + model config
- `src/preload/index.ts` - IPC API surface
- `src/renderer/src/App.tsx` - Main React app

### Data Flow

1. PDF uploaded -> TOC parsed -> chapters created -> chunks extracted -> embeddings generated (background job)
2. User query -> embed query -> hybrid search (vector + FTS5) -> RRF fusion -> semantic re-rank -> stream response
