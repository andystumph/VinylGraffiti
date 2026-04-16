import { z } from 'zod';
import { getDb } from './db';
import type { MediaType } from './types';

export interface WantListItem {
  id: number;
  artist: string;
  title: string;
  mediaType: MediaType | null;
  notes: string | null;
  isAcquired: boolean;
  createdAt: string;
  updatedAt: string;
}

const createWantListItemSchema = z.object({
  artist: z.string().trim().min(1).max(250),
  title: z.string().trim().min(1).max(250),
  mediaType: z.enum(['vinyl', 'cassette', 'cd']).optional().nullable(),
  notes: z.string().trim().max(2000).optional()
});

const updateWantListItemSchema = z.object({
  isAcquired: z.boolean()
});

function cleanOptional(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function listWantListItems(): WantListItem[] {
  const db = getDb();
  const rows = db
    .prepare(
      `
      SELECT
        id,
        artist,
        title,
        media_type AS mediaType,
        notes,
        is_acquired AS isAcquired,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM want_list_items
      ORDER BY is_acquired ASC, created_at DESC
      `
    )
    .all() as Array<
    Omit<WantListItem, 'isAcquired'> & {
      isAcquired: number;
    }
  >;

  return rows.map((row) => ({
    ...row,
    isAcquired: row.isAcquired === 1
  }));
}

export function addWantListItem(input: unknown): { id: number } {
  const parsed = createWantListItemSchema.parse(input);
  const db = getDb();

  const inserted = db
    .prepare(
      `
      INSERT INTO want_list_items (artist, title, media_type, notes)
      VALUES (?, ?, ?, ?)
      `
    )
    .run(parsed.artist.trim(), parsed.title.trim(), parsed.mediaType ?? null, cleanOptional(parsed.notes));

  return { id: Number(inserted.lastInsertRowid) };
}

export function updateWantListItem(id: number, input: unknown): { updated: true; id: number } {
  const parsed = updateWantListItemSchema.parse(input);
  const db = getDb();

  const result = db
    .prepare(
      `
      UPDATE want_list_items
      SET is_acquired = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `
    )
    .run(parsed.isAcquired ? 1 : 0, id);

  if (result.changes === 0) {
    throw new Error('Want list item not found');
  }

  return { updated: true, id };
}

export function deleteWantListItem(id: number): { deleted: true; id: number } {
  const db = getDb();
  const result = db.prepare('DELETE FROM want_list_items WHERE id = ?').run(id);

  if (result.changes === 0) {
    throw new Error('Want list item not found');
  }

  return { deleted: true, id };
}
