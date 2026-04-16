import fs from 'node:fs';
import path from 'node:path';
import { getDb } from './db';

export function runMigrations(): void {
  const db = getDb();
  const sqlDir = path.resolve('./src/lib/server/sql');

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const migrationFiles = fs
    .readdirSync(sqlDir)
    .filter((name: string) => name.endsWith('.sql'))
    .sort();

  const existingRows = db.prepare('SELECT name FROM schema_migrations').all() as Array<{ name: string }>;
  const alreadyApplied = new Set<string>(existingRows.map((row) => row.name));

  for (const fileName of migrationFiles) {
    if (alreadyApplied.has(fileName)) {
      continue;
    }

    const sql = fs.readFileSync(path.join(sqlDir, fileName), 'utf8');
    const tx = db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(fileName);
    });
    tx();
  }
}
