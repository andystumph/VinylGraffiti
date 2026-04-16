# Database

## Location

Default database path is:

- `./data/vinyl-graffiti.db`

Set `DATABASE_PATH` to override.

## Schema overview

- `schema_migrations`: tracks applied SQL migrations
- `artists`: artist records (optionally MBID-linked)
- `releases`: album/release metadata (optionally MBID-linked)
- `inventory_items`: physical inventory entries (vinyl/cassette/cd)
- `query_cache`: cached external API payloads and expiry

## Commands

- `npm run db:migrate`
- `npm run db:seed`
- `ALLOW_DB_RESET=true npm run db:reset -- RESET`

## Command Behavior And When To Use

### `npm run db:migrate`

What it does:
- creates the SQLite file if missing
- applies any new SQL migration files in order
- tracks completed migrations in `schema_migrations`

When to run:
- first setup (required)
- after pulling changes that include new migrations

Do you run this every app start?
- no
- only needed when schema changes are introduced

### `npm run db:seed`

What it does:
- runs migrations first
- inserts sample data for local development/testing

When to run:
- optional on first setup if you want starter records
- optional any time you want additional sample records

Do you run this every app start?
- no

### `ALLOW_DB_RESET=true npm run db:reset -- RESET`

What it does:
- deletes the current DB file
- recreates schema by running migrations
- does not seed automatically

When to run:
- only when you intentionally want to wipe local data and start fresh

Do you run this every app start?
- never for normal usage
- this is a destructive command

## Typical Workflows

- first setup: `npm install` -> `npm run db:migrate` -> `npm run dev`
- after pulling schema changes: `npm run db:migrate` -> `npm run dev`
- normal daily use without schema changes: `npm run dev`

## Reset safety

Reset is denied unless all three are true:

1. `NODE_ENV` is not production
2. `ALLOW_DB_RESET=true`
3. first CLI argument is exactly `RESET`
