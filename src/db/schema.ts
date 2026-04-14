import type { Database } from 'better-sqlite3';

export function initSchema(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS queue_items (
      id           TEXT    PRIMARY KEY,
      filename     TEXT    NOT NULL,
      pdf_class    TEXT    NOT NULL,
      score        REAL    NOT NULL,
      grade        TEXT    NOT NULL,
      page_count   INTEGER NOT NULL,
      analysis_result TEXT NOT NULL,   -- JSON blob of full AnalysisResult
      created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
      duration_ms  INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_queue_items_grade
      ON queue_items (grade);

    CREATE INDEX IF NOT EXISTS idx_queue_items_created_at
      ON queue_items (created_at DESC);
  `);
}
