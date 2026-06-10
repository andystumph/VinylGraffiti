import { z } from 'zod';
import { getDb } from './db';
import { getCache, setCache } from './cache';
import { getCachedCoverUrl, getCoverArtThumbnail } from './coverart-client';
import { getReleaseDetails, getReleaseMetadataDetails, searchReleaseCandidates } from './musicbrainz-client';
import { hasQuery, normalizeQuery, wildcard } from './search-utils';
import type { ImportCandidate, InventoryItemRow, MediaType } from './types';

const mediaTypeSchema = z.enum(['vinyl', 'cassette', 'cd']);

const addFromMusicBrainzSchema = z.object({
  releaseMbid: z.uuid(),
  releaseGroupMbid: z.uuid().nullable().optional(),
  title: z.string().trim().min(1).max(250).optional(),
  artist: z.string().trim().min(1).max(250).optional(),
  releaseDate: z.string().trim().max(50).nullable().optional(),
  mediaType: mediaTypeSchema,
  allowDuplicate: z.boolean().optional(),
  condition: z.string().trim().max(80).optional(),
  location: z.string().trim().max(160).optional(),
  notes: z.string().trim().max(2000).optional(),
  quantity: z.number().int().min(1).max(99).optional()
});

const manualAddSchema = z.object({
  artist: z.string().trim().min(1).max(250),
  title: z.string().trim().min(1).max(250),
  releaseDate: z.string().trim().max(50).optional(),
  mediaType: mediaTypeSchema,
  condition: z.string().trim().max(80).optional(),
  location: z.string().trim().max(160).optional(),
  notes: z.string().trim().max(2000).optional(),
  quantity: z.number().int().min(1).max(99).optional()
});

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

function cleanOptional(value?: string): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function upsertArtist(name: string, mbid: string | null): number {
  const db = getDb();

  if (mbid) {
    db.prepare(
      `
      INSERT INTO artists (mbid, name)
      VALUES (?, ?)
      ON CONFLICT(mbid) DO UPDATE SET
        name = excluded.name,
        updated_at = CURRENT_TIMESTAMP
      `
    ).run(mbid, name);

    const row = db.prepare('SELECT id FROM artists WHERE mbid = ?').get(mbid) as { id: number };
    return row.id;
  }

  const existing = db.prepare('SELECT id FROM artists WHERE name = ?').get(name) as { id: number } | undefined;
  if (existing) {
    return existing.id;
  }

  const inserted = db.prepare('INSERT INTO artists (name) VALUES (?)').run(name);
  return Number(inserted.lastInsertRowid);
}

function upsertRelease(payload: {
  mbid: string | null;
  releaseGroupMbid: string | null;
  artistId: number;
  title: string;
  releaseDate: string | null;
  coverThumbUrl: string | null;
}): number {
  const db = getDb();

  if (payload.mbid) {
    db.prepare(
      `
      INSERT INTO releases (mbid, release_group_mbid, artist_id, title, release_date, cover_thumb_url)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(mbid) DO UPDATE SET
        release_group_mbid = excluded.release_group_mbid,
        artist_id = excluded.artist_id,
        title = excluded.title,
        release_date = excluded.release_date,
        cover_thumb_url = COALESCE(excluded.cover_thumb_url, releases.cover_thumb_url),
        updated_at = CURRENT_TIMESTAMP
      `
    ).run(
      payload.mbid,
      payload.releaseGroupMbid,
      payload.artistId,
      payload.title,
      payload.releaseDate,
      payload.coverThumbUrl
    );

    const row = db.prepare('SELECT id FROM releases WHERE mbid = ?').get(payload.mbid) as { id: number };
    return row.id;
  }

  const existing = db
    .prepare('SELECT id FROM releases WHERE artist_id = ? AND title = ?')
    .get(payload.artistId, payload.title) as { id: number } | undefined;

  if (existing) {
    return existing.id;
  }

  const inserted = db
    .prepare(
      'INSERT INTO releases (mbid, release_group_mbid, artist_id, title, release_date, cover_thumb_url) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(
      payload.mbid,
      payload.releaseGroupMbid,
      payload.artistId,
      payload.title,
      payload.releaseDate,
      payload.coverThumbUrl
    );

  return Number(inserted.lastInsertRowid);
}

export async function getImportCandidates(query: string) {
  const normalized = normalizeQuery(query);
  if (!normalized) {
    return [];
  }

  const key = `mb-search:v7:${normalized}`;
  const cached = getCache<Awaited<ReturnType<typeof searchReleaseCandidates>>>(key);
  if (cached) {
    return cached;
  }

  const results = await searchReleaseCandidates(normalized, 25);
  const enriched = await enrichCoverAvailability(results);
  setCache(key, enriched, 600);
  return enriched;
}

async function enrichCoverAvailability(candidates: ImportCandidate[]): Promise<ImportCandidate[]> {
  // MusicBrainz search responses usually omit cover-art metadata; enrich top rows with cached CAA checks.
  const checkedCount = Math.min(candidates.length, 10);
  if (checkedCount === 0) {
    return candidates;
  }

  const enriched = [...candidates];
  await Promise.all(
    enriched.slice(0, checkedCount).map(async (candidate, index) => {
      const cacheKey = `cover-available:v1:${candidate.releaseMbid}`;
      const cached = getCache<boolean>(cacheKey);
      if (cached !== null) {
        enriched[index] = { ...candidate, hasCoverArt: cached };
        return;
      }

      const hasCover = Boolean(getCachedCoverUrl(candidate.releaseMbid) ?? (await getCoverArtThumbnail(candidate.releaseMbid)));
      setCache(cacheKey, hasCover, 7 * 24 * 3600);
      enriched[index] = { ...candidate, hasCoverArt: hasCover };
    })
  );

  return enriched;
}

export async function addInventoryFromMusicBrainz(input: unknown): Promise<
  | { id: number }
  | {
      requiresDuplicateConfirmation: true;
      existingId: number;
      existingQuantity: number;
    }
> {
  const parsed = addFromMusicBrainzSchema.parse(input);
  const detailsKey = `mb-release:${parsed.releaseMbid}`;
  const coverKey = `cover-release:${parsed.releaseMbid}`;

  const hasInlineDetails = Boolean(parsed.title && parsed.artist);
  const details =
    (hasInlineDetails
      ? {
          releaseMbid: parsed.releaseMbid,
          releaseGroupMbid: parsed.releaseGroupMbid ?? null,
          title: parsed.title!,
          artist: parsed.artist!,
          releaseDate: parsed.releaseDate ?? null
        }
      : null) ??
    getCache<Awaited<ReturnType<typeof getReleaseDetails>>>(detailsKey) ??
    (await getReleaseDetails(parsed.releaseMbid));
  setCache(detailsKey, details, 24 * 3600);

  const coverThumbUrl =
    getCache<string | null>(coverKey) ??
    getCachedCoverUrl(parsed.releaseMbid) ??
    (await getCoverArtThumbnail(parsed.releaseMbid));
  setCache(coverKey, coverThumbUrl, 7 * 24 * 3600);

  const artistId = upsertArtist(details.artist, null);
  const releaseId = upsertRelease({
    mbid: details.releaseMbid,
    releaseGroupMbid: details.releaseGroupMbid,
    artistId,
    title: details.title,
    releaseDate: details.releaseDate,
    coverThumbUrl
  });

  const db = getDb();
  const existing = db
    .prepare('SELECT id, quantity FROM inventory_items WHERE release_id = ? AND media_type = ?')
    .get(releaseId, parsed.mediaType) as { id: number; quantity: number } | undefined;

  const quantity = parsed.quantity ?? 1;

  if (existing) {
    if (!parsed.allowDuplicate) {
      return {
        requiresDuplicateConfirmation: true,
        existingId: existing.id,
        existingQuantity: existing.quantity
      };
    }

    db.prepare(
      `
      UPDATE inventory_items
      SET quantity = ?,
          condition = ?,
          location = ?,
          notes = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `
    ).run(
      existing.quantity + quantity,
      cleanOptional(parsed.condition),
      cleanOptional(parsed.location),
      cleanOptional(parsed.notes),
      existing.id
    );

    return { id: existing.id };
  }

  const inserted = db
    .prepare(
      `
      INSERT INTO inventory_items (release_id, media_type, condition, location, notes, quantity)
      VALUES (?, ?, ?, ?, ?, ?)
      `
    )
    .run(
      releaseId,
      parsed.mediaType,
      cleanOptional(parsed.condition),
      cleanOptional(parsed.location),
      cleanOptional(parsed.notes),
      quantity
    );

  return { id: Number(inserted.lastInsertRowid) };
}

export function addManualInventoryItem(input: unknown): { id: number } {
  const parsed = manualAddSchema.parse(input);
  const artistId = upsertArtist(parsed.artist, null);
  const releaseId = upsertRelease({
    mbid: null,
    releaseGroupMbid: null,
    artistId,
    title: parsed.title,
    releaseDate: cleanOptional(parsed.releaseDate),
    coverThumbUrl: null
  });

  const db = getDb();
  const inserted = db
    .prepare(
      `
      INSERT INTO inventory_items (release_id, media_type, condition, location, notes, quantity)
      VALUES (?, ?, ?, ?, ?, ?)
      `
    )
    .run(
      releaseId,
      parsed.mediaType,
      cleanOptional(parsed.condition),
      cleanOptional(parsed.location),
      cleanOptional(parsed.notes),
      parsed.quantity ?? 1
    );

  return { id: Number(inserted.lastInsertRowid) };
}

export function deleteInventoryItem(id: number): { deleted: true; id: number } {
  const db = getDb();
  const target = db
    .prepare(
      `
      SELECT i.id AS inventoryId, r.id AS releaseId, a.id AS artistId
      FROM inventory_items i
      JOIN releases r ON i.release_id = r.id
      JOIN artists a ON r.artist_id = a.id
      WHERE i.id = ?
      `
    )
    .get(id) as { inventoryId: number; releaseId: number; artistId: number } | undefined;

  if (!target) {
    throw new Error('Inventory item not found');
  }

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM inventory_items WHERE id = ?').run(id);

    const releaseStillUsed = db
      .prepare('SELECT 1 FROM inventory_items WHERE release_id = ? LIMIT 1')
      .get(target.releaseId) as { 1: number } | undefined;

    if (!releaseStillUsed) {
      db.prepare('DELETE FROM releases WHERE id = ?').run(target.releaseId);

      const artistStillUsed = db
        .prepare('SELECT 1 FROM releases WHERE artist_id = ? LIMIT 1')
        .get(target.artistId) as { 1: number } | undefined;

      if (!artistStillUsed) {
        db.prepare('DELETE FROM artists WHERE id = ?').run(target.artistId);
      }
    }
  });

  tx();

  return { deleted: true, id };
}

export function updateInventoryItemMediaType(
  id: number,
  mediaType: MediaType
): { updated: true; id: number; mediaType: MediaType; mergedIntoId?: number } {
  const db = getDb();
  const target = db
    .prepare(
      `
      SELECT id, release_id AS releaseId, media_type AS mediaType, quantity, condition, location, notes
      FROM inventory_items
      WHERE id = ?
      `
    )
    .get(id) as
    | {
        id: number;
        releaseId: number;
        mediaType: MediaType;
        quantity: number;
        condition: string | null;
        location: string | null;
        notes: string | null;
      }
    | undefined;

  if (!target) {
    throw new Error('Inventory item not found');
  }

  if (target.mediaType === mediaType) {
    return { updated: true, id, mediaType };
  }

  const tx = db.transaction(() => {
    const conflicting = db
      .prepare(
        `
        SELECT id, quantity, condition, location, notes
        FROM inventory_items
        WHERE release_id = ? AND media_type = ? AND id != ?
        LIMIT 1
        `
      )
      .get(target.releaseId, mediaType, id) as
      | {
          id: number;
          quantity: number;
          condition: string | null;
          location: string | null;
          notes: string | null;
        }
      | undefined;

    if (conflicting) {
      db.prepare(
        `
        UPDATE inventory_items
        SET quantity = ?,
            condition = COALESCE(condition, ?),
            location = COALESCE(location, ?),
            notes = COALESCE(notes, ?),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        `
      ).run(
        conflicting.quantity + target.quantity,
        target.condition,
        target.location,
        target.notes,
        conflicting.id
      );

      db.prepare('DELETE FROM inventory_items WHERE id = ?').run(id);
      return { updated: true as const, id, mediaType, mergedIntoId: conflicting.id };
    }

    db.prepare(
      `
      UPDATE inventory_items
      SET media_type = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `
    ).run(mediaType, id);

    return { updated: true as const, id, mediaType };
  });

  return tx();
}

export interface InventoryAlbumDetails {
  inventoryId: number;
  albumTitle: string;
  artistName: string;
  releaseDate: string | null;
  mediaType: MediaType;
  releaseMbid: string | null;
  releaseGroupMbid: string | null;
  country: string | null;
  status: string | null;
  barcode: string | null;
  label: string | null;
  tracks: Array<{
    position: number;
    title: string;
    lengthMs: number | null;
  }>;
}

export async function getInventoryAlbumDetails(id: number): Promise<InventoryAlbumDetails> {
  const db = getDb();
  const base = db
    .prepare(
      `
      SELECT
        i.id AS inventoryId,
        i.media_type AS mediaType,
        r.title AS albumTitle,
        r.mbid AS releaseMbid,
        r.release_group_mbid AS releaseGroupMbid,
        r.release_date AS releaseDate,
        a.name AS artistName
      FROM inventory_items i
      JOIN releases r ON i.release_id = r.id
      JOIN artists a ON r.artist_id = a.id
      WHERE i.id = ?
      `
    )
    .get(id) as
    | {
        inventoryId: number;
        mediaType: MediaType;
        albumTitle: string;
        releaseMbid: string | null;
        releaseGroupMbid: string | null;
        releaseDate: string | null;
        artistName: string;
      }
    | undefined;

  if (!base) {
    throw new Error('Inventory item not found');
  }

  if (!base.releaseMbid) {
    return {
      ...base,
      country: null,
      status: null,
      barcode: null,
      label: null,
      tracks: []
    };
  }

  const cacheKey = `mb-release-details:v1:${base.releaseMbid}`;
  const cached = getCache<Awaited<ReturnType<typeof getReleaseMetadataDetails>>>(cacheKey);
  const metadata = cached ?? (await getReleaseMetadataDetails(base.releaseMbid));

  if (!cached) {
    setCache(cacheKey, metadata, 14 * 24 * 3600);
  }

  // Persist tracks locally so they are searchable in My Collection
  persistReleaseTracks(base.releaseMbid, metadata.tracks);

  return {
    inventoryId: base.inventoryId,
    albumTitle: metadata.title || base.albumTitle,
    artistName: metadata.artist || base.artistName,
    releaseDate: metadata.releaseDate ?? base.releaseDate,
    mediaType: base.mediaType,
    releaseMbid: base.releaseMbid,
    releaseGroupMbid: base.releaseGroupMbid,
    country: metadata.country,
    status: metadata.status,
    barcode: metadata.barcode,
    label: metadata.label,
    tracks: metadata.tracks
  };
}

/**
 * Upsert tracks for a release (identified by MBID) into the local release_tracks table.
 * Skips if tracks are already stored for that release to avoid repeated writes.
 */
function persistReleaseTracks(
  releaseMbid: string,
  tracks: Array<{ position: number; title: string; lengthMs: number | null }>
): void {
  if (tracks.length === 0) {
    return;
  }

  const db = getDb();
  const release = db.prepare('SELECT id FROM releases WHERE mbid = ?').get(releaseMbid) as
    | { id: number }
    | undefined;

  if (!release) {
    return;
  }

  const existing = db
    .prepare('SELECT 1 FROM release_tracks WHERE release_id = ? LIMIT 1')
    .get(release.id) as { 1: number } | undefined;

  if (existing) {
    return;
  }

  const insert = db.prepare(
    'INSERT INTO release_tracks (release_id, position, title, length_ms) VALUES (?, ?, ?, ?)'
  );

  const insertAll = db.transaction(() => {
    for (const track of tracks) {
      insert.run(release.id, track.position, track.title, track.lengthMs ?? null);
    }
  });

  insertAll();
}

export function searchInventory(filters: {
  query?: string;
  mediaType?: MediaType | 'all';
}): InventoryItemRow[] {
  const results = runInventoryQuery(filters.query, filters.mediaType);

  // Soft fallback: if a multi-token free-text search returned nothing, retry dropping
  // the last token so a misspelled album title (e.g. "rumors" vs "Rumours") still
  // surfaces by matching on the remaining artist / other tokens.
  if (
    results.length === 0 &&
    hasQuery(filters.query) &&
    !isUuid(filters.query) &&
    (filters.query ?? '').trim().split(/\s+/).filter(Boolean).length > 1
  ) {
    const trimmedTokens = (filters.query ?? '').trim().split(/\s+/).filter(Boolean);
    const shorterQuery = trimmedTokens.slice(0, -1).join(' ');
    return runInventoryQuery(shorterQuery, filters.mediaType);
  }

  return results;
}

function runInventoryQuery(
  query: string | undefined,
  mediaType: MediaType | 'all' | undefined
): InventoryItemRow[] {
  const db = getDb();
  const clauses: string[] = [];
  const params: Array<string> = [];

  if (mediaType && mediaType !== 'all') {
    clauses.push('i.media_type = ?');
    params.push(mediaType);
  }

  if (hasQuery(query)) {
    if (isUuid(query)) {
      clauses.push('(LOWER(r.mbid) = ? OR LOWER(r.release_group_mbid) = ?)');
      const normalizedUuid = query.trim().toLowerCase();
      params.push(normalizedUuid, normalizedUuid);
    } else {
      const tokens = normalizeQuery(query)
        .split(/\s+/)
        .filter((token) => token.length > 0);

      if (tokens.length > 0) {
        // Each token must match artist name, release title, OR a track title in the release
        const tokenClauses = tokens
          .map(
            () =>
              '(LOWER(r.title) LIKE ? OR LOWER(a.name) LIKE ? OR EXISTS (SELECT 1 FROM release_tracks rt WHERE rt.release_id = r.id AND LOWER(rt.title) LIKE ?))'
          )
          .join(' AND ');
        clauses.push(`(${tokenClauses})`);

        for (const token of tokens) {
          const pattern = wildcard(token);
          params.push(pattern, pattern, pattern);
        }
      }
    }
  }

  const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

  const sql = `
    SELECT
      i.id as id,
      i.media_type as mediaType,
      i.condition as condition,
      i.location as location,
      i.notes as notes,
      i.quantity as quantity,
      i.created_at as createdAt,
      i.updated_at as updatedAt,
      r.id as releaseId,
      r.mbid as releaseMbid,
      r.release_group_mbid as releaseGroupMbid,
      r.title as albumTitle,
      r.release_date as releaseDate,
      r.cover_thumb_url as coverThumbUrl,
      a.name as artistName
    FROM inventory_items i
    JOIN releases r ON i.release_id = r.id
    JOIN artists a ON r.artist_id = a.id
    ${whereClause}
    ORDER BY a.name COLLATE NOCASE ASC, r.title COLLATE NOCASE ASC
  `;

  return db.prepare(sql).all(...params) as InventoryItemRow[];
}
