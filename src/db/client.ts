import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DB_PATH } from '../config.js';
import { initSchema } from './schema.js';

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  mkdirSync(dirname(DB_PATH), { recursive: true });
  _db = new Database(DB_PATH);

  // WAL mode: concurrent reads don't block writes
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  _db.pragma('busy_timeout = 5000');

  initSchema(_db);
  return _db;
}
