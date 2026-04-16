# Troubleshooting

## App starts but pages error on DB

Run migrations first:

- `npm run db:migrate`

## MusicBrainz requests fail

- Verify internet access.
- Confirm User-Agent env values in `.env`.
- Retry after a short pause if upstream returns 503.

## Native dependency install issues (better-sqlite3)

- Use Node 22+.
- Rebuild dependencies: `npm rebuild better-sqlite3`.

## Reset command blocked

Expected unless you intentionally unblock:

- `set ALLOW_DB_RESET=true`
- `npm run db:reset -- RESET`
