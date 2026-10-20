import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";

export const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), ".data");

const g = globalThis as unknown as { __shanliuDb?: DatabaseSync };

const SCHEMA = `
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS metadata (
  hash TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS evidence_files (
  content_hash TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  uploader TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
`;

export function getDb(): DatabaseSync {
  if (g.__shanliuDb) return g.__shanliuDb;
  mkdirSync(DATA_DIR, { recursive: true });
  // Loaded at runtime so the bundler never tries to resolve the built-in.
  const { DatabaseSync: Sqlite } = process.getBuiltinModule("node:sqlite");
  const db = new Sqlite(join(DATA_DIR, "app.db"));
  db.exec(SCHEMA);
  g.__shanliuDb = db;
  return db;
}

export function inTransaction(db: DatabaseSync, fn: () => void) {
  db.exec("BEGIN");
  try {
    fn();
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
