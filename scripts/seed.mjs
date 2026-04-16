import { execFileSync } from 'node:child_process';
import Database from 'better-sqlite3';

function seed() {
  const dbPath = process.env.DATABASE_PATH ?? './data/vinyl-graffiti.db';
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const artistInsert = db.prepare('INSERT INTO artists (name) VALUES (?)');
  const releaseInsert = db.prepare('INSERT INTO releases (artist_id, title, release_date) VALUES (?, ?, ?)');
  const itemInsert = db.prepare(
    'INSERT INTO inventory_items (release_id, media_type, condition, location, notes, quantity) VALUES (?, ?, ?, ?, ?, ?)'
  );

  const tx = db.transaction(() => {
    const artistResult = artistInsert.run('Sample Artist');
    const artistId = Number(artistResult.lastInsertRowid);

    const releaseResult = releaseInsert.run(artistId, 'Sample Album', '2000-01-01');
    const releaseId = Number(releaseResult.lastInsertRowid);

    itemInsert.run(releaseId, 'vinyl', 'VG+', 'Shelf A1', 'Seeded starter item', 1);
  });

  tx();
  db.close();
}

execFileSync(process.execPath, ['./scripts/migrate.mjs'], { stdio: 'inherit' });
seed();
console.log('Seed complete.');
