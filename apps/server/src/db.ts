import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const dbFile = process.env.DB_FILE ?? resolve(here, '../data/volta.db');
if (dbFile !== ':memory:') mkdirSync(dirname(dbFile), { recursive: true });

export const db = new DatabaseSync(dbFile);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tg_id INTEGER UNIQUE NOT NULL,
  username TEXT, first_name TEXT, last_name TEXT, photo_url TEXT,
  lang TEXT DEFAULT 'ru',
  settings TEXT DEFAULT '{}',
  ref_by INTEGER,
  onboarded INTEGER DEFAULT 0,
  blocked INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_seen INTEGER
);
CREATE TABLE IF NOT EXISTS wallets (
  user_id INTEGER NOT NULL REFERENCES users(id),
  currency TEXT NOT NULL,
  balance INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, currency)
);
CREATE TABLE IF NOT EXISTS ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  currency TEXT NOT NULL,
  type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  bet_id INTEGER,
  note TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ledger_user ON ledger(user_id, currency);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  sport TEXT NOT NULL,
  league_id TEXT NOT NULL,
  home TEXT NOT NULL,
  away TEXT NOT NULL,
  start_at INTEGER NOT NULL,
  status TEXT NOT NULL,
  state TEXT NOT NULL,
  result TEXT,
  top INTEGER DEFAULT 0,
  overrides TEXT DEFAULT '{}',
  suspended INTEGER DEFAULT 0,
  manual INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  finished_at INTEGER
);
CREATE INDEX IF NOT EXISTS events_status ON events(status);
CREATE TABLE IF NOT EXISTS bets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'DEMO',
  type TEXT NOT NULL,
  stake INTEGER NOT NULL,
  odds REAL NOT NULL,
  potential INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  payout INTEGER DEFAULT 0,
  live INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  settled_at INTEGER
);
CREATE INDEX IF NOT EXISTS bets_user ON bets(user_id, status);
CREATE TABLE IF NOT EXISTS bet_selections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bet_id INTEGER NOT NULL REFERENCES bets(id),
  event_id TEXT NOT NULL,
  sport TEXT NOT NULL,
  event_name TEXT NOT NULL,
  market TEXT NOT NULL,
  market_title TEXT NOT NULL,
  outcome TEXT NOT NULL,
  label TEXT NOT NULL,
  odds REAL NOT NULL,
  result TEXT
);
CREATE INDEX IF NOT EXISTS sel_event ON bet_selections(event_id, result);
CREATE INDEX IF NOT EXISTS sel_bet ON bet_selections(bet_id);
CREATE TABLE IF NOT EXISTS daily_bonus (user_id INTEGER PRIMARY KEY, streak INTEGER NOT NULL, last_day TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS refills (user_id INTEGER PRIMARY KEY, last_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS achievements (user_id INTEGER NOT NULL, code TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(user_id, code));
CREATE TABLE IF NOT EXISTS favorites (user_id INTEGER NOT NULL, event_id TEXT NOT NULL, notified INTEGER DEFAULT 0, PRIMARY KEY(user_id, event_id));
CREATE TABLE IF NOT EXISTS pending_refs (tg_id INTEGER PRIMARY KEY, ref_tg INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS admin_log (id INTEGER PRIMARY KEY AUTOINCREMENT, admin_tg INTEGER, action TEXT NOT NULL, payload TEXT, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`);

let depth = 0;
/** Транзакция (вложенные вызовы выполняются внутри внешней). */
export function tx<T>(fn: () => T): T {
  if (depth > 0) return fn();
  db.exec('BEGIN IMMEDIATE');
  depth++;
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  } finally {
    depth--;
  }
}

export const q = {
  get<T = any>(sql: string, ...params: any[]): T | undefined {
    return db.prepare(sql).get(...params) as T | undefined;
  },
  all<T = any>(sql: string, ...params: any[]): T[] {
    return db.prepare(sql).all(...params) as T[];
  },
  run(sql: string, ...params: any[]) {
    return db.prepare(sql).run(...params);
  },
};
