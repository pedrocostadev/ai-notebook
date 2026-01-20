import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'

// Row types for database queries
export interface PdfRow {
  id: number
  filename: string
  filepath: string
  status: string
  page_count: number | null
  error_message: string | null
  created_at: string
}

export interface PdfListRow {
  id: number
  filename: string
  status: string
  created_at: string
  title: string | null
}

export interface ChapterRow {
  id: number
  pdf_id: number
  title: string
  chapter_index: number
  start_idx: number
  end_idx: number
  start_page: number | null
  status: string
  error_message: string | null
}

export interface ChapterListRow {
  id: number
  pdf_id: number
  title: string
  chapter_index: number
  start_page: number | null
  is_auxiliary: boolean
  status: string
  error_message: string | null
  summary_status: string | null
  concepts_status: string | null
}

export interface ChunkRow {
  id: number
  chapter_id: number | null
  chunk_index: number
  content: string
  heading: string | null
  page_start: number
  page_end: number
  token_count: number
}

export interface MessageRow {
  id: number
  role: string
  content: string
  metadata: string | null
  created_at: string
}

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized')
  return db
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}

export async function initDatabase(): Promise<void> {
  // Allow override for parallel test workers
  const userDataPath = process.env.AI_NOTEBOOK_TEST_DB_DIR || app.getPath('userData')
  const dbPath = join(userDataPath, 'ai-notebook.db')
  const pdfsPath = join(userDataPath, 'pdfs')

  if (!existsSync(pdfsPath)) {
    mkdirSync(pdfsPath, { recursive: true })
  }

  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')

  // Load sqlite-vec extension
  try {
    const sqliteVec = await import('sqlite-vec')
    sqliteVec.load(db)
  } catch (e) {
    console.warn('sqlite-vec not loaded:', e)
  }

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pdfs (
      id INTEGER PRIMARY KEY,
      filename TEXT NOT NULL,
      filepath TEXT NOT NULL,
      file_hash TEXT UNIQUE,
      file_size INTEGER,
      page_count INTEGER,
      metadata JSON,
      status TEXT CHECK(status IN ('pending', 'processing', 'done', 'error')) DEFAULT 'pending',
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS chapters (
      id INTEGER PRIMARY KEY,
      pdf_id INTEGER REFERENCES pdfs(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      chapter_index INTEGER,
      start_idx INTEGER,
      end_idx INTEGER,
      start_page INTEGER,
      summary TEXT,
      is_auxiliary BOOLEAN DEFAULT FALSE,
      status TEXT CHECK(status IN ('pending', 'processing', 'done', 'error')) DEFAULT 'pending',
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS chunks (
      id INTEGER PRIMARY KEY,
      pdf_id INTEGER REFERENCES pdfs(id) ON DELETE CASCADE,
      chapter_id INTEGER REFERENCES chapters(id) ON DELETE CASCADE,
      chunk_index INTEGER,
      content TEXT,
      heading TEXT,
      page_start INTEGER,
      page_end INTEGER,
      token_count INTEGER
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY,
      pdf_id INTEGER REFERENCES pdfs(id) ON DELETE CASCADE,
      chapter_id INTEGER REFERENCES chapters(id) ON DELETE CASCADE,
      role TEXT CHECK(role IN ('user', 'assistant')),
      content TEXT,
      metadata JSON,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY,
      pdf_id INTEGER REFERENCES pdfs(id) ON DELETE CASCADE,
      chapter_id INTEGER REFERENCES chapters(id) ON DELETE CASCADE,
      type TEXT CHECK(type IN ('embed', 'summary', 'metadata', 'concepts', 'consolidate')),
      status TEXT CHECK(status IN ('pending', 'running', 'done', 'failed')) DEFAULT 'pending',
      attempts INTEGER DEFAULT 0,
      last_error TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS concepts (
      id INTEGER PRIMARY KEY,
      pdf_id INTEGER REFERENCES pdfs(id) ON DELETE CASCADE,
      chapter_id INTEGER REFERENCES chapters(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      definition TEXT NOT NULL,
      importance INTEGER CHECK(importance BETWEEN 1 AND 5),
      quotes JSON,
      is_consolidated BOOLEAN DEFAULT FALSE,
      source_concept_ids JSON,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_concepts_pdf ON concepts(pdf_id);
    CREATE INDEX IF NOT EXISTS idx_concepts_chapter ON concepts(chapter_id);

    -- Performance indexes for common queries
    CREATE INDEX IF NOT EXISTS idx_chunks_chapter ON chunks(chapter_id);
    CREATE INDEX IF NOT EXISTS idx_chapters_pdf ON chapters(pdf_id);
    CREATE INDEX IF NOT EXISTS idx_messages_pdf_chapter ON messages(pdf_id, chapter_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_status_created ON jobs(status, created_at);

    CREATE TABLE IF NOT EXISTS conversation_summaries (
      id INTEGER PRIMARY KEY,
      pdf_id INTEGER REFERENCES pdfs(id) ON DELETE CASCADE,
      chapter_id INTEGER REFERENCES chapters(id) ON DELETE CASCADE,
      summary TEXT NOT NULL,
      last_message_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(pdf_id, chapter_id)
    );
  `)

  // Migrations for existing databases (ALTER TABLE only - CREATE statements are in main schema)
  const migrations = [
    'ALTER TABLE pdfs ADD COLUMN metadata JSON',
    'ALTER TABLE chapters ADD COLUMN summary TEXT',
    'ALTER TABLE chapters ADD COLUMN concepts_status TEXT DEFAULT NULL',
    'ALTER TABLE chapters ADD COLUMN concepts_error TEXT DEFAULT NULL',
    'ALTER TABLE chapters ADD COLUMN is_auxiliary BOOLEAN DEFAULT FALSE',
    'ALTER TABLE chapters ADD COLUMN summary_status TEXT DEFAULT NULL',
    'ALTER TABLE chapters ADD COLUMN summary_error TEXT DEFAULT NULL'
  ]
  for (const migration of migrations) {
    try {
      db.exec(migration)
    } catch {
      // Column already exists, ignore
    }
  }

  // Create FTS5 table
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
      content,
      tokenize='porter unicode61'
    );
  `)

  // Create vec_chunks table for vector search
  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(
        chunk_id INTEGER PRIMARY KEY,
        embedding FLOAT[768]
      );
    `)
  } catch (e) {
    console.warn('vec_chunks table creation skipped:', e)
  }

  // Create triggers for FTS5 sync
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
      INSERT INTO chunks_fts(rowid, content) VALUES (new.id, new.content);
    END;

    CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON chunks BEGIN
      DELETE FROM chunks_fts WHERE rowid = old.id;
      INSERT INTO chunks_fts(rowid, content) VALUES (new.id, new.content);
    END;

    CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
      DELETE FROM chunks_fts WHERE rowid = old.id;
    END;
  `)

  // Trigger for vec_chunks cleanup
  try {
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS chunks_vec_ad AFTER DELETE ON chunks BEGIN
        DELETE FROM vec_chunks WHERE chunk_id = old.id;
      END;
    `)
  } catch (e) {
    console.warn('vec_chunks trigger skipped:', e)
  }
}

// PDF CRUD
export function insertPdf(
  filename: string,
  filepath: string,
  fileHash: string,
  fileSize: number
): number {
  const stmt = getDb().prepare(`
    INSERT INTO pdfs (filename, filepath, file_hash, file_size, status)
    VALUES (?, ?, ?, ?, 'pending')
  `)
  const result = stmt.run(filename, filepath, fileHash, fileSize)
  return result.lastInsertRowid as number
}

export function getPdfByHash(hash: string): { id: number; filename: string } | undefined {
  return getDb()
    .prepare('SELECT id, filename FROM pdfs WHERE file_hash = ?')
    .get(hash) as { id: number; filename: string } | undefined
}

export function getPdf(id: number): PdfRow | undefined {
  return getDb().prepare('SELECT * FROM pdfs WHERE id = ?').get(id) as PdfRow | undefined
}

export function getAllPdfs(): PdfListRow[] {
  const rows = getDb()
    .prepare('SELECT id, filename, status, created_at, metadata FROM pdfs ORDER BY created_at DESC')
    .all() as { id: number; filename: string; status: string; created_at: string; metadata: string | null }[]

  return rows.map(row => {
    let title: string | null = null
    if (row.metadata) {
      try {
        const meta = JSON.parse(row.metadata)
        title = meta.title || null
      } catch { /* ignore parse errors */ }
    }
    return { id: row.id, filename: row.filename, status: row.status, created_at: row.created_at, title }
  })
}

export function updatePdfStatus(
  id: number,
  status: string,
  pageCount?: number,
  errorMessage?: string
): void {
  getDb()
    .prepare(
      `UPDATE pdfs SET status = ?, page_count = COALESCE(?, page_count), error_message = ? WHERE id = ?`
    )
    .run(status, pageCount ?? null, errorMessage ?? null, id)
}

export function deletePdf(id: number): void {
  getDb().prepare('DELETE FROM pdfs WHERE id = ?').run(id)
}

// Chapter CRUD
export function insertChapter(
  pdfId: number,
  title: string,
  chapterIndex: number,
  startIdx: number,
  endIdx: number,
  isAuxiliary: boolean = false,
  startPage: number = 1
): number {
  const stmt = getDb().prepare(`
    INSERT INTO chapters (pdf_id, title, chapter_index, start_idx, end_idx, start_page, is_auxiliary, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
  `)
  const result = stmt.run(pdfId, title, chapterIndex, startIdx, endIdx, startPage, isAuxiliary ? 1 : 0)
  return result.lastInsertRowid as number
}

export function getChaptersByPdfId(pdfId: number, excludeAuxiliary: boolean = false): ChapterListRow[] {
  const query = excludeAuxiliary
    ? 'SELECT id, pdf_id, title, chapter_index, start_page, is_auxiliary, status, error_message, summary_status, concepts_status FROM chapters WHERE pdf_id = ? AND is_auxiliary = 0 ORDER BY chapter_index'
    : 'SELECT id, pdf_id, title, chapter_index, start_page, is_auxiliary, status, error_message, summary_status, concepts_status FROM chapters WHERE pdf_id = ? ORDER BY chapter_index'
  return getDb().prepare(query).all(pdfId) as ChapterListRow[]
}

export function getChapter(id: number): ChapterRow | undefined {
  return getDb().prepare('SELECT * FROM chapters WHERE id = ?').get(id) as ChapterRow | undefined
}

export function updateChapterStatus(id: number, status: string, errorMessage?: string): void {
  getDb()
    .prepare('UPDATE chapters SET status = ?, error_message = ? WHERE id = ?')
    .run(status, errorMessage ?? null, id)
}

export function updateChapterEndIdx(id: number, endIdx: number): void {
  getDb()
    .prepare('UPDATE chapters SET end_idx = ? WHERE id = ?')
    .run(endIdx, id)
}

export function updateChapterStartIdx(id: number, startIdx: number): void {
  getDb()
    .prepare('UPDATE chapters SET start_idx = ? WHERE id = ?')
    .run(startIdx, id)
}

export function updateChapterStartPage(id: number, startPage: number): void {
  getDb()
    .prepare('UPDATE chapters SET start_page = ? WHERE id = ?')
    .run(startPage, id)
}

export function updateChapterSummary(id: number, summary: string): void {
  getDb()
    .prepare('UPDATE chapters SET summary = ?, summary_status = ? WHERE id = ?')
    .run(summary, 'done', id)
}

export function updateChapterSummaryStatus(
  chapterId: number,
  status: 'pending' | 'processing' | 'done' | 'error',
  errorMessage?: string
): void {
  getDb()
    .prepare('UPDATE chapters SET summary_status = ?, summary_error = ? WHERE id = ?')
    .run(status, errorMessage ?? null, chapterId)
}

export function getChapterSummaryStatus(chapterId: number): { status: string | null; error: string | null } {
  const row = getDb()
    .prepare('SELECT summary_status, summary_error FROM chapters WHERE id = ?')
    .get(chapterId) as { summary_status: string | null; summary_error: string | null } | undefined
  return { status: row?.summary_status ?? null, error: row?.summary_error ?? null }
}

export function updateChapterAuxiliary(id: number, isAuxiliary: boolean): void {
  getDb()
    .prepare('UPDATE chapters SET is_auxiliary = ? WHERE id = ?')
    .run(isAuxiliary ? 1 : 0, id)
}

export function getChapterSummary(id: number): string | null {
  const row = getDb()
    .prepare('SELECT summary FROM chapters WHERE id = ?')
    .get(id) as { summary: string | null } | undefined
  return row?.summary ?? null
}

// PDF Metadata CRUD
export function updatePdfMetadata(id: number, metadata: object): void {
  getDb()
    .prepare('UPDATE pdfs SET metadata = ? WHERE id = ?')
    .run(JSON.stringify(metadata), id)
}

export function getPdfMetadata(id: number): object | null {
  const row = getDb()
    .prepare('SELECT metadata FROM pdfs WHERE id = ?')
    .get(id) as { metadata: string | null } | undefined
  if (!row?.metadata) return null
  try {
    return JSON.parse(row.metadata)
  } catch {
    return null
  }
}

// Chunks CRUD
export function insertChunk(
  pdfId: number,
  chapterId: number | null,
  chunkIndex: number,
  content: string,
  heading: string | null,
  pageStart: number,
  pageEnd: number,
  tokenCount: number
): number {
  const stmt = getDb().prepare(`
    INSERT INTO chunks (pdf_id, chapter_id, chunk_index, content, heading, page_start, page_end, token_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const result = stmt.run(pdfId, chapterId, chunkIndex, content, heading, pageStart, pageEnd, tokenCount)
  return result.lastInsertRowid as number
}

export function getChunksByPdfId(pdfId: number): ChunkRow[] {
  return getDb().prepare('SELECT * FROM chunks WHERE pdf_id = ? ORDER BY chunk_index').all(pdfId) as ChunkRow[]
}

export function getChunksByChapterId(chapterId: number): Omit<ChunkRow, 'chapter_id'>[] {
  return getDb().prepare('SELECT * FROM chunks WHERE chapter_id = ? ORDER BY chunk_index').all(chapterId) as Omit<ChunkRow, 'chapter_id'>[]
}

export function getChunksByIds(ids: number[]): Omit<ChunkRow, 'chapter_id' | 'chunk_index'>[] {
  if (ids.length === 0) return []
  const placeholders = ids.map(() => '?').join(',')
  return getDb()
    .prepare(`SELECT id, content, heading, page_start, page_end, token_count FROM chunks WHERE id IN (${placeholders})`)
    .all(...ids) as Omit<ChunkRow, 'chapter_id' | 'chunk_index'>[]
}

// Messages CRUD
export function insertMessage(
  pdfId: number,
  chapterId: number | null,
  role: 'user' | 'assistant',
  content: string,
  metadata?: object
): number {
  const stmt = getDb().prepare(`
    INSERT INTO messages (pdf_id, chapter_id, role, content, metadata)
    VALUES (?, ?, ?, ?, ?)
  `)
  const result = stmt.run(pdfId, chapterId, role, content, metadata ? JSON.stringify(metadata) : null)
  return result.lastInsertRowid as number
}

export function getMessagesByPdfId(pdfId: number, chapterId: number | null = null): MessageRow[] {
  if (chapterId === null) {
    return getDb()
      .prepare('SELECT * FROM messages WHERE pdf_id = ? AND chapter_id IS NULL ORDER BY created_at')
      .all(pdfId) as MessageRow[]
  }
  return getDb()
    .prepare('SELECT * FROM messages WHERE pdf_id = ? AND chapter_id = ? ORDER BY created_at')
    .all(pdfId, chapterId) as MessageRow[]
}

// Jobs CRUD
export type JobType = 'embed' | 'summary' | 'metadata' | 'concepts' | 'consolidate'

export function insertJob(pdfId: number, chapterId: number | null, type: JobType): number {
  const stmt = getDb().prepare(`
    INSERT INTO jobs (pdf_id, chapter_id, type, status)
    VALUES (?, ?, ?, 'pending')
  `)
  const result = stmt.run(pdfId, chapterId, type)
  return result.lastInsertRowid as number
}

export type PendingJob = {
  id: number
  pdf_id: number
  chapter_id: number | null
  type: string
  attempts: number
}

export function getNextPendingJob(): PendingJob | undefined {
  return getDb()
    .prepare(
      `SELECT id, pdf_id, chapter_id, type, attempts FROM jobs
       WHERE status = 'pending'
       ORDER BY created_at
       LIMIT 1`
    )
    .get() as PendingJob | undefined
}

/**
 * Get multiple pending jobs for parallel processing.
 * Prioritizes embed jobs first (to enable chat faster), then other job types.
 * Returns jobs that can run in parallel (different chapters or non-chapter jobs).
 */
export function getPendingJobs(limit: number): PendingJob[] {
  return getDb()
    .prepare(
      `SELECT id, pdf_id, chapter_id, type, attempts FROM jobs
       WHERE status = 'pending'
       ORDER BY
         CASE type
           WHEN 'embed' THEN 1
           WHEN 'summary' THEN 2
           WHEN 'concepts' THEN 2
           WHEN 'metadata' THEN 3
           WHEN 'consolidate' THEN 4
         END,
         created_at
       LIMIT ?`
    )
    .all(limit) as PendingJob[]
}

export function updateJobStatus(id: number, status: string, lastError?: string): void {
  getDb()
    .prepare('UPDATE jobs SET status = ?, last_error = ?, attempts = attempts + 1 WHERE id = ?')
    .run(status, lastError ?? null, id)
}

// Mark all jobs for a PDF as done (test-only helper)
export function markAllJobsDoneForPdf(pdfId: number): void {
  getDb()
    .prepare("UPDATE jobs SET status = 'done' WHERE pdf_id = ? AND status IN ('pending', 'running')")
    .run(pdfId)
}

export function isJobPending(chapterId: number, type: JobType): boolean {
  const row = getDb()
    .prepare("SELECT 1 FROM jobs WHERE chapter_id = ? AND type = ? AND status IN ('pending', 'running')")
    .get(chapterId, type)
  return row !== undefined
}

// Settings CRUD
export function getSetting(key: string): string | undefined {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
    .run(key, value)
}

// Vector search
export function hasEmbedding(chunkId: number): boolean {
  const db = getDb()
  const row = db.prepare('SELECT 1 FROM vec_chunks WHERE chunk_id = ?').get(chunkId)
  return row !== undefined
}

export function insertEmbedding(chunkId: number, embedding: number[]): void {
  if (hasEmbedding(chunkId)) return
  const db = getDb()
  const stmt = db.prepare('INSERT INTO vec_chunks (chunk_id, embedding) VALUES (?, ?)')
  stmt.run(BigInt(chunkId), new Float32Array(embedding))
}

export function vectorSearch(
  embedding: number[],
  limit: number = 20,
  chapterId?: number
): { chunk_id: number; distance: number }[] {
  const db = getDb()
  if (chapterId !== undefined) {
    // Scope to chapter chunks - use subquery for KNN then filter
    const stmt = db.prepare(`
      SELECT v.chunk_id, v.distance
      FROM (
        SELECT chunk_id, distance
        FROM vec_chunks
        WHERE embedding MATCH ? AND k = ?
      ) v
      JOIN chunks c ON c.id = v.chunk_id
      WHERE c.chapter_id = ?
      ORDER BY v.distance
    `)
    // Fetch more results to account for chapter filtering
    return stmt.all(new Float32Array(embedding), limit * 5, chapterId) as { chunk_id: number; distance: number }[]
  }
  const stmt = db.prepare(`
    SELECT chunk_id, distance
    FROM vec_chunks
    WHERE embedding MATCH ? AND k = ?
  `)
  return stmt.all(new Float32Array(embedding), limit) as { chunk_id: number; distance: number }[]
}

// FTS5 search
export function ftsSearch(query: string, limit: number = 20, chapterId?: number): number[] {
  const escaped = escapeFTS5Query(query)
  if (!escaped) return []
  const db = getDb()
  if (chapterId !== undefined) {
    // Scope to chapter chunks
    const rows = db
      .prepare(`
        SELECT f.rowid
        FROM chunks_fts f
        JOIN chunks c ON c.id = f.rowid
        WHERE f.content MATCH ? AND c.chapter_id = ?
        LIMIT ?
      `)
      .all(escaped, chapterId, limit) as { rowid: number }[]
    return rows.map((r) => r.rowid)
  }
  const rows = db
    .prepare(`SELECT rowid FROM chunks_fts WHERE content MATCH ? LIMIT ?`)
    .all(escaped, limit) as { rowid: number }[]
  return rows.map((r) => r.rowid)
}

function escapeFTS5Query(query: string): string {
  return query
    .replace(/"/g, '""')
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .map((t) => `"${t}"`)
    .join(' ')
}

// Concepts CRUD
export interface ConceptQuote {
  text: string
  pageEstimate?: number
  chapterTitle?: string
}

export interface Concept {
  id: number
  pdf_id: number
  chapter_id: number | null
  name: string
  definition: string
  importance: number
  quotes: ConceptQuote[]
  is_consolidated: boolean
  source_concept_ids: number[] | null
  created_at: string
}

export function insertConcept(
  pdfId: number,
  chapterId: number | null,
  name: string,
  definition: string,
  importance: number,
  quotes: ConceptQuote[],
  isConsolidated: boolean = false,
  sourceConceptIds: number[] | null = null
): number {
  const stmt = getDb().prepare(`
    INSERT INTO concepts (pdf_id, chapter_id, name, definition, importance, quotes, is_consolidated, source_concept_ids)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const result = stmt.run(
    pdfId,
    chapterId,
    name,
    definition,
    importance,
    JSON.stringify(quotes),
    isConsolidated ? 1 : 0,
    sourceConceptIds ? JSON.stringify(sourceConceptIds) : null
  )
  return result.lastInsertRowid as number
}

export function insertConcepts(
  pdfId: number,
  chapterId: number | null,
  concepts: { name: string; definition: string; importance: number; quotes: ConceptQuote[] }[],
  isConsolidated: boolean = false
): number[] {
  if (concepts.length === 0) return []

  const db = getDb()
  const ids: number[] = []

  // Use transaction for batch insert - much faster than individual inserts
  const stmt = db.prepare(`
    INSERT INTO concepts (pdf_id, chapter_id, name, definition, importance, quotes, is_consolidated, source_concept_ids)
    VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
  `)

  const insertAll = db.transaction(() => {
    for (const c of concepts) {
      const result = stmt.run(
        pdfId,
        chapterId,
        c.name,
        c.definition,
        c.importance,
        JSON.stringify(c.quotes),
        isConsolidated ? 1 : 0
      )
      ids.push(result.lastInsertRowid as number)
    }
  })

  insertAll()
  return ids
}

export function getConceptsByChapterId(chapterId: number): Concept[] {
  const rows = getDb()
    .prepare('SELECT * FROM concepts WHERE chapter_id = ? AND is_consolidated = 0 ORDER BY importance DESC')
    .all(chapterId) as {
    id: number
    pdf_id: number
    chapter_id: number | null
    name: string
    definition: string
    importance: number
    quotes: string
    is_consolidated: number
    source_concept_ids: string | null
    created_at: string
  }[]
  return rows.map(parseConceptRow)
}

export function getConceptsByPdfId(pdfId: number, consolidatedOnly: boolean = false): Concept[] {
  const query = consolidatedOnly
    ? 'SELECT * FROM concepts WHERE pdf_id = ? AND is_consolidated = 1 ORDER BY importance DESC'
    : 'SELECT * FROM concepts WHERE pdf_id = ? ORDER BY importance DESC'
  const rows = getDb().prepare(query).all(pdfId) as {
    id: number
    pdf_id: number
    chapter_id: number | null
    name: string
    definition: string
    importance: number
    quotes: string
    is_consolidated: number
    source_concept_ids: string | null
    created_at: string
  }[]
  return rows.map(parseConceptRow)
}

function parseConceptRow(row: {
  id: number
  pdf_id: number
  chapter_id: number | null
  name: string
  definition: string
  importance: number
  quotes: string
  is_consolidated: number
  source_concept_ids: string | null
  created_at: string
}): Concept {
  return {
    id: row.id,
    pdf_id: row.pdf_id,
    chapter_id: row.chapter_id,
    name: row.name,
    definition: row.definition,
    importance: row.importance,
    quotes: JSON.parse(row.quotes || '[]'),
    is_consolidated: row.is_consolidated === 1,
    source_concept_ids: row.source_concept_ids ? JSON.parse(row.source_concept_ids) : null,
    created_at: row.created_at
  }
}

export function deleteConceptsByPdfId(pdfId: number, consolidatedOnly: boolean = false): void {
  if (consolidatedOnly) {
    getDb().prepare('DELETE FROM concepts WHERE pdf_id = ? AND is_consolidated = 1').run(pdfId)
  } else {
    getDb().prepare('DELETE FROM concepts WHERE pdf_id = ?').run(pdfId)
  }
}

export function updateChapterConceptsStatus(
  chapterId: number,
  status: 'pending' | 'processing' | 'done' | 'error',
  errorMessage?: string
): void {
  getDb()
    .prepare('UPDATE chapters SET concepts_status = ?, concepts_error = ? WHERE id = ?')
    .run(status, errorMessage ?? null, chapterId)
}

export function getChapterConceptsStatus(chapterId: number): { status: string | null; error: string | null } {
  const row = getDb()
    .prepare('SELECT concepts_status, concepts_error FROM chapters WHERE id = ?')
    .get(chapterId) as { concepts_status: string | null; concepts_error: string | null } | undefined
  return { status: row?.concepts_status ?? null, error: row?.concepts_error ?? null }
}

// Conversation Summaries CRUD
export function getConversationSummary(
  pdfId: number,
  chapterId: number | null
): { summary: string; lastMessageId: number } | null {
  const row = chapterId === null
    ? getDb()
        .prepare('SELECT summary, last_message_id FROM conversation_summaries WHERE pdf_id = ? AND chapter_id IS NULL')
        .get(pdfId) as { summary: string; last_message_id: number } | undefined
    : getDb()
        .prepare('SELECT summary, last_message_id FROM conversation_summaries WHERE pdf_id = ? AND chapter_id = ?')
        .get(pdfId, chapterId) as { summary: string; last_message_id: number } | undefined
  if (!row) return null
  return { summary: row.summary, lastMessageId: row.last_message_id }
}

export function upsertConversationSummary(
  pdfId: number,
  chapterId: number | null,
  summary: string,
  lastMessageId: number
): void {
  getDb()
    .prepare(`
      INSERT INTO conversation_summaries (pdf_id, chapter_id, summary, last_message_id)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(pdf_id, chapter_id) DO UPDATE SET
        summary = excluded.summary,
        last_message_id = excluded.last_message_id,
        created_at = CURRENT_TIMESTAMP
    `)
    .run(pdfId, chapterId, summary, lastMessageId)
}

export function deleteConversationSummary(pdfId: number, chapterId: number | null): void {
  if (chapterId === null) {
    getDb()
      .prepare('DELETE FROM conversation_summaries WHERE pdf_id = ? AND chapter_id IS NULL')
      .run(pdfId)
  } else {
    getDb()
      .prepare('DELETE FROM conversation_summaries WHERE pdf_id = ? AND chapter_id = ?')
      .run(pdfId, chapterId)
  }
}
