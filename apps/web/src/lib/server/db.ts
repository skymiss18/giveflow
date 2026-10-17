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
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  chain_id INTEGER NOT NULL,
  block_number INTEGER NOT NULL,
  log_index INTEGER NOT NULL,
  tx_hash TEXT NOT NULL,
  address TEXT NOT NULL,
  name TEXT NOT NULL,
  args TEXT NOT NULL,
  timestamp INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_name ON events (chain_id, name, block_number, log_index);
CREATE TABLE IF NOT EXISTS sync_state (
  chain_id INTEGER PRIMARY KEY,
  last_block INTEGER NOT NULL,
  fingerprint TEXT NOT NULL
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
