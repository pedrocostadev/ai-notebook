# AI Notebook

Desktop app for chatting with PDFs using RAG (Retrieval-Augmented Generation).

## Tech Stack

- **Desktop**: Electron (electron-vite + Electron Forge)
- **Frontend**: React 19 + TypeScript + Tailwind CSS v4 + shadcn-ui
- **AI**: Google Gemini via AI-SDK
- **Vector DB**: SQLite + sqlite-vec + FTS5

## Production Installation

### macOS

The app is not code-signed. After installing, run:

```bash
xattr -cr "/Applications/AI Notebook.app"
```

Then open the app normally.

### Windows

Run the installer. If SmartScreen blocks it, click "More info" → "Run anyway".

### Linux

Install the `.deb` or `.rpm` package, or extract the `.tar.gz` to your preferred location.

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

## User Data

Stored in `~/Library/Application Support/ai-notebook/`:

- `ai-notebook.db` - SQLite database (chats, embeddings, settings)
- `pdfs/` - Copied PDF files

To remove all user data:

```bash
rm -rf ~/Library/Application\ Support/AI\ Notebook
```
