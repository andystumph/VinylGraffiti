import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const testDbPath = path.resolve('./data/test-want-list-db.db');

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

describe('want list db integration', () => {
  it('requires confirmation before inserting an exact duplicate', async () => {
    const { addWantListItem, listWantListItems } = await import('../../../src/lib/server/want-list-service');

    const first = addWantListItem({
      artist: 'Miles Davis',
      title: 'Kind of Blue',
      mediaType: 'vinyl'
    });

    expect('id' in first).toBe(true);

    const duplicate = addWantListItem({
      artist: ' miles davis ',
      title: 'KIND OF BLUE',
      mediaType: 'vinyl'
    });

    expect(duplicate).toEqual({
      requiresDuplicateConfirmation: true,
      existingId: (first as { id: number }).id,
      existingIsAcquired: false,
      existingMediaType: 'vinyl'
    });
    expect(listWantListItems()).toHaveLength(1);
  });

  it('inserts a duplicate when explicitly allowed', async () => {
    const { addWantListItem, listWantListItems } = await import('../../../src/lib/server/want-list-service');

    addWantListItem({
      artist: 'Miles Davis',
      title: 'Kind of Blue',
      mediaType: 'vinyl'
    });

    const result = addWantListItem({
      artist: 'Miles Davis',
      title: 'Kind of Blue',
      mediaType: 'vinyl',
      allowDuplicate: true
    });

    expect(result).toEqual({ id: 2 });
    expect(listWantListItems()).toHaveLength(2);
  });
});