import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { appEnv } from './env';

let database: Database.Database | undefined;

function ensureDataDirectory(dbPath: string): void {
  const resolved = path.resolve(dbPath);
  const dir = path.dirname(resolved);
  fs.mkdirSync(dir, { recursive: true });
}

export function getDb(): Database.Database {
  if (database) {
    return database;
  }

  ensureDataDirectory(appEnv.databasePath);
  database = new Database(appEnv.databasePath);

  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');

  return database;
}

export function closeDb(): void {
  if (database) {
    database.close();
    database = undefined;
  }
}
