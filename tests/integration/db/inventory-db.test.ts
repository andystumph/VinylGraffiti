import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const testDbPath = path.resolve('./data/test-vinyl-graffiti.db');

beforeEach(async () => {
  process.env.DATABASE_PATH = testDbPath;
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }

  const { runMigrations } = await import('../../../src/lib/server/migrations');
  runMigrations();
});

afterEach(async () => {
  const { closeDb } = await import('../../../src/lib/server/db');
  closeDb();
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
});

describe('inventory db integration', () => {
  it('adds and finds manual inventory item', async () => {
    const { addManualInventoryItem, searchInventory } = await import('../../../src/lib/server/inventory-service');

    const result = addManualInventoryItem({
      artist: 'Miles Davis',
      title: 'Kind of Blue',
      mediaType: 'vinyl',
      quantity: 1
    });

    expect(result.id).toBeGreaterThan(0);

    const rows = searchInventory({ query: 'miles', mediaType: 'all' });
    expect(rows.length).toBe(1);
    expect(rows[0].albumTitle).toBe('Kind of Blue');
    expect(rows[0].artistName).toBe('Miles Davis');
  });
});
