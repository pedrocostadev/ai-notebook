# AI Notebook

Desktop app for chatting with PDFs using RAG (Retrieval-Augmented Generation).

## Tech Stack

- **Desktop**: Electron (electron-vite + Electron Forge)
- **Frontend**: React 19 + TypeScript + Tailwind CSS v4 + shadcn-ui
- **AI**: Google Gemini via AI-SDK
- **Vector DB**: SQLite + sqlite-vec + FTS5

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build      # Build for production
npm run make       # Package app (run after build)
```

## Tests

```bash
npm run test       # Unit tests (Vitest)
npm run test:e2e   # E2E tests (Playwright)
```
