# API Integration

## MusicBrainz

- Base URL: `https://musicbrainz.org/ws/2`
- Endpoints used:
  - release search (`/release?query=...`) — for free-text artist/album queries
  - release lookup by MBID (`/release/{mbid}`) — used both when the user pastes an MBID directly and when fetching full metadata for the album details modal
  - release metadata + recording list (`/release/{mbid}?inc=recordings+media+labels+...`) — for track lists and extended metadata
- Includes meaningful User-Agent header built from env values.
- Requests are rate-limited in-process to about one call each 1.05 seconds.
- 503 responses are retried with bounded backoff.

## Cover Art Archive

- Base URL: `https://coverartarchive.org`
- Endpoint used:
  - release metadata by MBID
- Thumbnail selection preference:
  - `250`
  - `small`
  - `500`
  - `large`
  - full image URL

## Local cache policy

Cache table: `query_cache`

- Search results: ~10 minutes
- Release details (basic): 24 hours
- Release metadata + tracks (album details modal): 14 days
- Cover art metadata/thumb URL: 7 days
