# Architecture

VinylGraffiti is a local-first Astro + React application with a SQLite backend file stored in the repository workspace.

## Core decisions

- Frontend: Astro pages with React interactive islands.
- Backend: Astro API routes in `src/pages/api`.
- Data: SQLite via `better-sqlite3` and raw SQL migrations.
- External metadata: MusicBrainz search and release lookup, plus Cover Art Archive thumbnails.
- API limits: MusicBrainz requests are serialized to about one request per second.
- Caching: API responses are persisted in `query_cache` with TTL to reduce repeated remote calls.

## Main flows

1. Browse flow:
   - React component calls `GET /api/inventory/search`.
   - Query can be free text (artist/album) or a MusicBrainz Release/Release-Group MBID (UUID format).
   - When a UUID is detected the server matches against `releases.mbid` and `releases.release_group_mbid` directly instead of a LIKE search.
   - Server queries local SQLite and returns joined inventory data.

2. Add flow (assisted):
   - React calls `GET /api/import/search-musicbrainz?q=...`.
   - `q` can be free text (artist and/or album title) or a bare MusicBrainz Release MBID.
   - When a UUID is detected the server skips text search and performs a direct release lookup.
   - User selects result, then client calls `POST /api/import/add-by-mbid`.
   - Server fetches/caches metadata, fetches cover thumbnail, upserts local records.

3. Add flow (manual fallback):
   - React calls `POST /api/inventory/manual-add` with basic artist/title/media type fields.

4. Print/export flow:
   - User opens `Print / Save PDF` from My Collection or Want List.
   - App routes to dedicated server-rendered pages (`/print/collection`, `/print/want-list`) with compact summary tables.
   - Browser-native Print dialog is used to print or save the summary as a PDF.

## Safety posture

- DB reset is blocked unless all safeguards are met:
  - not production
  - `ALLOW_DB_RESET=true`
  - explicit `RESET` token arg
