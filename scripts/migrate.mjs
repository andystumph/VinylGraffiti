import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

function runMigrations(db) {
  const sqlDir = path.resolve('./src/lib/server/sql');
  const files = fs.readdirSync(sqlDir).filter((name) => name.endsWith('.sql')).sort();

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const existing = new Set(db.prepare('SELECT name FROM schema_migrations').all().map((row) => row.name));
  for (const file of files) {
    if (existing.has(file)) {
      continue;
    }

    const sql = fs.readFileSync(path.join(sqlDir, file), 'utf8');
    const tx = db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(file);
    });
    tx();
  }
}

const dbPath = process.env.DATABASE_PATH ?? './data/vinyl-graffiti.db';
fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

try {
  runMigrations(db);
  console.log('Migrations complete.');
} finally {
  db.close();
}
