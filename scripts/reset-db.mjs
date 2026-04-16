import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const confirmToken = process.argv[2];

if (process.env.NODE_ENV === 'production') {
  throw new Error('Database reset is blocked in production.');
}

if (process.env.ALLOW_DB_RESET !== 'true') {
  throw new Error('Reset blocked. Set ALLOW_DB_RESET=true to proceed.');
}

if (confirmToken !== 'RESET') {
  throw new Error('Reset blocked. Pass RESET as the first argument to confirm.');
}

const dbPath = path.resolve(process.env.DATABASE_PATH ?? './data/vinyl-graffiti.db');
console.log(`About to reset database at ${dbPath}`);

if (fs.existsSync(dbPath)) {
  fs.unlinkSync(dbPath);
}

execFileSync(process.execPath, ['./scripts/migrate.mjs'], { stdio: 'inherit' });

console.log('Database reset complete.');
