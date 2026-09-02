// ============================================================
// Database Singleton — SQLite via sql.js (pure JS asm.js build)
// ============================================================

/* eslint-disable @typescript-eslint/no-require-imports */

import path from 'path';
import fs from 'fs';

const initSqlJs = require('sql.js/dist/sql-asm.js');

const DB_PATH = path.resolve(process.cwd(), 'data', 'chargeback.db');

// sql.js asm types
export interface SqlJsDatabase {
  run(sql: string, params?: (string | number | null)[]): SqlJsDatabase;
  exec(sql: string): { columns: string[]; values: unknown[][] }[];
  prepare(sql: string): SqlJsStatement;
  export(): Uint8Array;
  close(): void;
}

interface SqlJsStatement {
  bind(params?: (string | number | null)[]): boolean;
  step(): boolean;
  getAsObject(): Record<string, unknown>;
  free(): void;
}

interface SqlJsStatic {
  Database: new (data?: ArrayLike<number>) => SqlJsDatabase;
}

let db: SqlJsDatabase | null = null;
let initPromise: Promise<SqlJsDatabase> | null = null;

export async function getDb(): Promise<SqlJsDatabase> {
  if (db) return db;
  if (initPromise) return initPromise;
  initPromise = initializeDb();
  db = await initPromise;
  return db;
}

async function initializeDb(): Promise<SqlJsDatabase> {
  const SQL: SqlJsStatic = await initSqlJs();
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  let database: SqlJsDatabase;
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    database = new SQL.Database(buffer);
  } else {
    database = new SQL.Database();
  }

  // Run schema — uses CREATE IF NOT EXISTS, safe to re-run
  const schemaPath = path.resolve(process.cwd(), 'src', 'lib', 'db', 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  // sql.js run() only executes the first statement; use exec() for multi-statement
  const statements = schema.split(';').map(s => s.trim()).filter(s => s.length > 0);
  for (const stmt of statements) {
    database.run(stmt);
  }

  saveDb(database);
  return database;
}

export function saveDb(database?: SqlJsDatabase): void {
  const d = database ?? db;
  if (!d) return;
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const data = d.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

/**
 * Insert an audit log entry.
 * HARD BOUNDARY: append-only — no UPDATE or DELETE on audit_log.
 */
export function insertAuditLog(
  database: SqlJsDatabase,
  entry: {
    dispute_id: string | null;
    action: string;
    actor: string;
    payload_json: string;
    timestamp: number;
  }
): void {
  database.run(
    `INSERT INTO audit_log (dispute_id, action, actor, payload_json, timestamp)
     VALUES (?, ?, ?, ?, ?)`,
    [entry.dispute_id, entry.action, entry.actor, entry.payload_json, entry.timestamp]
  );
}

export function queryAll(
  database: SqlJsDatabase,
  sql: string,
  params: (string | number | null)[] = []
): Record<string, unknown>[] {
  const stmt = database.prepare(sql);
  stmt.bind(params);
  const results: Record<string, unknown>[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject() as Record<string, unknown>);
  }
  stmt.free();
  return results;
}

export function queryOne(
  database: SqlJsDatabase,
  sql: string,
  params: (string | number | null)[] = []
): Record<string, unknown> | null {
  const rows = queryAll(database, sql, params);
  return rows.length > 0 ? rows[0] : null;
}

export function closeDb(): void {
  if (db) {
    saveDb(db);
    db.close();
    db = null;
    initPromise = null;
  }
}
