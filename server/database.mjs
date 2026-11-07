import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openDatabase(path) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS accounts (username TEXT PRIMARY KEY, data TEXT NOT NULL DEFAULT '{}', revision INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, username TEXT NOT NULL, credential TEXT NOT NULL, expires INTEGER NOT NULL);`);
  return db;
}
