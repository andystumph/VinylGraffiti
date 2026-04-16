# VinylGraffiti

<p align="center">
  <img src="public/images/vinyl-haven-in-the-city.png" alt="VinylGraffiti" width="420" />
</p>

> A dark-themed, local-first record collection tracker. Browse your shelves, find music fast, and let MusicBrainz fill in the details.

VinylGraffiti keeps your vinyl, cassette, and CD inventory in a SQLite file that lives right alongside your code — no cloud account, no subscription, no data leaving your machine. Metadata and cover art are pulled on demand from MusicBrainz and Cover Art Archive, then cached locally so repeat lookups are instant.

---

## What it looks like

VinylGraffiti is organized around three screens that feel more like a compact private catalog than a generic inventory tool.

### My Collection

This is the primary view: a dark, cover-forward grid built for browsing first and admin second. You can scan visually, filter by format, search by artist, album, track title, or MusicBrainz MBID, then make quick changes directly from the card without getting kicked into a separate edit page.

### Album Details

Opening an album brings up a dedicated modal rather than expanding the grid in place. That keeps the main collection view tidy while giving the selected release a more focused presentation: cover art, release facts, barcode, label, country, status, and a full track list fetched from MusicBrainz and cached locally.

### Add Inventory

The add flow is designed for speed when you know exactly what you want and tolerance when you do not. You can search naturally with artist and album text, rely on fuzzy matching for common spelling variations, or paste a MusicBrainz release or release-group UUID when you want an exact lookup.

### Want List

The Want List stays intentionally lightweight. It is there to keep future finds visible without turning into another complicated database view: add the record, leave it on the list, and mark it acquired when it finally shows up.

---

## Features

- **My Collection** — card grid with cover art, per-item media type editing, delete, and album detail modal
- **Smart search** — matches artist, album title, track titles (once details have been loaded), and MusicBrainz UUIDs; fuzzy Lucene queries handle spelling variants
- **Assisted add** — MusicBrainz text search with multi-split heuristics and fuzzy release matching; direct MBID lookup as a fallback
- **Cover art** — fetched from Cover Art Archive, thumbnail cached to disk, served locally
- **Want List** — add, mark acquired/wanted, remove
- **Print / PDF export** — generate compact Collection and Want List summaries via `/print/collection` and `/print/want-list`, then use browser Print -> Save as PDF
- **Manual fallback** — add an entry with just artist, title, and media type when no API match exists
- **Fully local** — SQLite database stored in `data/`, everything runs offline after first metadata fetch
- **API caching** — search results (10 min), release details (24 h), MB+track metadata (14 days), cover art (7 days)
- **Reset safety** — database wipe is blocked unless `ALLOW_DB_RESET=true` and a `RESET` token are both present
- **CI** — GitHub Actions runs lint, typecheck, tests, and build on every push

---

## Quick Start

```bash
npm install
copy .env.example .env   # Windows — use cp on Mac/Linux
npm run db:migrate
npm run dev
```

Open **http://localhost:4321**

Use the `Print / Save PDF` buttons in **My Collection** and **Want List** to open compact export views in a new tab.
Then use your browser print dialog and choose **Save as PDF** for a shopping-friendly reference document.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Local dev server with hot reload |
| `npm run build` | Production build |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | ESLint checks |
| `npm run typecheck` | Astro + TypeScript checks |
| `npm run test` | Vitest unit, integration, and component tests |
| `npm run db:migrate` | Apply pending SQL migrations |
| `npm run db:seed` | Seed sample data (optional) |
| `npm run db:reset -- RESET` | Wipe and recreate the database (guarded) |

---

## Database Commands Explained

### `npm run db:migrate`

Creates the SQLite file if it doesn't exist, then applies any new migration files in order. Already-applied migrations are skipped.

**When to run it:** once on first setup, and again after pulling commits that add new migration files. Safe to re-run anytime.

### `npm run db:seed`

Runs migrations first, then inserts sample records. Useful on a fresh install when you want something to look at immediately.

### `npm run db:reset -- RESET`

Wipes the database and recreates the schema. Requires `ALLOW_DB_RESET=true` in the environment and the `RESET` token argument.

```powershell
# Windows PowerShell
$env:ALLOW_DB_RESET='true'; npm run db:reset -- RESET
```

### Typical daily flow

```
First setup:       npm install  →  npm run db:migrate  →  npm run dev
After schema pull: npm run db:migrate  →  npm run dev
Normal use:        npm run dev
```

---

## Environment

Copy `.env.example` to `.env` and fill in:

| Variable | Purpose |
|---|---|
| `DATABASE_PATH` | Path to the SQLite file (default: `data/vinyl-graffiti.db`) |
| `APP_NAME` | Used in the MusicBrainz User-Agent header |
| `APP_VERSION` | Used in the MusicBrainz User-Agent header |
| `APP_CONTACT` | Email or URL in the MusicBrainz User-Agent header |
| `ALLOW_DB_RESET` | Set to `true` to unlock the reset command |
| `PORT` | Dev/preview server port |

---

## API & Rate Limits

MusicBrainz requires a meaningful `User-Agent` and enforces rate limits. VinylGraffiti:

- spaces requests to roughly one per 1.05 seconds
- retries `503` responses with bounded backoff
- caches all responses locally so repeated searches never hit the API

Cover Art Archive responses are cached separately.

---

## Testing

```bash
npm run test
```

Includes:
- unit tests for search and scoring logic
- SQLite migration and query integration tests
- a React component render test for the inventory browser


Run all tests:

`npm run test`

## Documentation

Detailed docs are in `docs/`:

- `docs/ARCHITECTURE.md`
- `docs/DATABASE.md`
- `docs/API.md`
- `docs/TROUBLESHOOTING.md`
