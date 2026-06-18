import type { Database } from 'better-sqlite3';

function hasColumn(db: Database, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === column);
}

export function initSchema(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS queue_items (
      id           TEXT    PRIMARY KEY,
      filename     TEXT    NOT NULL,
      pdf_class    TEXT    NOT NULL,
      score        REAL    NOT NULL,
      grade        TEXT    NOT NULL,
      page_count   INTEGER NOT NULL,
      analysis_result TEXT NOT NULL,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
      duration_ms  INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_queue_items_grade
      ON queue_items (grade);

    CREATE INDEX IF NOT EXISTS idx_queue_items_created_at
      ON queue_items (created_at DESC);

    CREATE TABLE IF NOT EXISTS playbooks (
      id                        TEXT    PRIMARY KEY,
      failure_signature         TEXT    NOT NULL,
      failure_context_signature TEXT    NOT NULL DEFAULT '',
      pdf_class                 TEXT    NOT NULL,
      tool_sequence             TEXT    NOT NULL,
      success_count             INTEGER NOT NULL DEFAULT 0,
      attempt_count             INTEGER NOT NULL DEFAULT 0,
      avg_score_improvement     REAL    NOT NULL DEFAULT 0,
      status                    TEXT    NOT NULL DEFAULT 'candidate',
      created_at                TEXT    NOT NULL,
      last_used_at              TEXT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS playbooks_signature
      ON playbooks (failure_signature);

    CREATE TABLE IF NOT EXISTS tool_outcomes (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      tool_name    TEXT    NOT NULL,
      pdf_class    TEXT    NOT NULL,
      outcome      TEXT    NOT NULL,
      score_before REAL    NOT NULL,
      score_after  REAL    NOT NULL,
      created_at   TEXT    NOT NULL
    );

    CREATE INDEX IF NOT EXISTS tool_outcomes_lookup
      ON tool_outcomes (tool_name, pdf_class);
  `);

  if (!hasColumn(db, 'playbooks', 'failure_context_signature')) {
    db.exec("ALTER TABLE playbooks ADD COLUMN failure_context_signature TEXT NOT NULL DEFAULT ''");
  }

  db.exec('CREATE INDEX IF NOT EXISTS playbooks_signature_context_lookup ON playbooks (failure_signature, failure_context_signature, status)');
  db.exec('CREATE INDEX IF NOT EXISTS playbooks_signature_lookup ON playbooks (failure_signature, status)');
}
