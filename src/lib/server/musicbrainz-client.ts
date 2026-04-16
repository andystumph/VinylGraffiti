import { musicBrainzUserAgent } from './env';
import type { ImportCandidate } from './types';

const MB_BASE = 'https://musicbrainz.org/ws/2';
let nextAllowedRequestTs = 0;

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function mbFetch(pathname: string, retries = 2): Promise<Response> {
  const waitMs = Math.max(nextAllowedRequestTs - Date.now(), 0);
  if (waitMs > 0) {
    await sleep(waitMs);
  }

  nextAllowedRequestTs = Date.now() + 1050;

  const response = await fetch(`${MB_BASE}${pathname}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': musicBrainzUserAgent()
    }
  });

  if (response.status === 503 && retries > 0) {
    await sleep((3 - retries) * 1000 + 1000);
    return mbFetch(pathname, retries - 1);
  }

  return response;
}

function pickArtistName(artistCredit: unknown): string {
  if (!Array.isArray(artistCredit) || artistCredit.length === 0) {
    return 'Unknown Artist';
  }

  const first = artistCredit[0] as { name?: string };
  return first.name ?? 'Unknown Artist';
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

/** Levenshtein edit distance (caps at maxDist+1 for speed). */
function editDistance(a: string, b: string, maxDist = 2): number {
  if (Math.abs(a.length - b.length) > maxDist) {
    return maxDist + 1;
  }

  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const curr = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      curr[j] =
        a[i - 1] === b[j - 1]
          ? prev[j - 1]
          : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    prev.splice(0, prev.length, ...curr);
  }

  return prev[b.length];
}

/**
 * Returns all reasonable artist/release split indices for a tokenised query.
 * – 3 tokens  → try both splits [1, 2]  (e.g. "fleetwood | mac rumors" AND "fleetwood mac | rumors")
 * – 4 tokens  → try [2, 3]  (mid and right-biased)
 * – 5+ tokens → try [floor(n/2)]  (single mid split)
 */
function getArtistReleaseSplits(tokens: string[]): Array<{ artistHint: string; releaseHint: string }> {
  if (tokens.length < 3) {
    return [];
  }

  let indices: number[];
  if (tokens.length === 3) {
    indices = [2, 1]; // prefer more tokens in artist first
  } else if (tokens.length === 4) {
    indices = [2, 3];
  } else {
    indices = [Math.floor(tokens.length / 2)];
  }

  return indices
    .map((i) => ({
      artistHint: tokens.slice(0, i).join(' '),
      releaseHint: tokens.slice(i).join(' ')
    }))
    .filter((s) => s.artistHint && s.releaseHint);
}

function computeRelevance(
  candidate: ImportCandidate,
  query: string,
  artistHint: string | null,
  releaseHint: string | null
): number {
  const queryTokens = tokenize(query);
  const normalizedQuery = query.trim().toLowerCase();
  const normalizedTitle = candidate.title.trim().toLowerCase();
  const normalizedArtist = candidate.artist.trim().toLowerCase();
  const titleTokens = new Set(tokenize(candidate.title));
  const artistTokens = new Set(tokenize(candidate.artist));

  let titleHits = 0;
  let artistHits = 0;
  for (const token of queryTokens) {
    if (titleTokens.has(token)) {
      titleHits += 1;
    }

    if (artistTokens.has(token)) {
      artistHits += 1;
    }
  }

  // Fuzzy title hits – catch spelling variants like "rumors" ↔ "Rumours" (edit distance ≤ 2)
  let fuzzyTitleHits = 0;
  for (const qToken of queryTokens) {
    if (qToken.length >= 4 && !titleTokens.has(qToken)) {
      for (const tToken of titleTokens) {
        if (Math.abs(qToken.length - tToken.length) <= 3 && editDistance(qToken, tToken) <= 2) {
          fuzzyTitleHits += 1;
          break;
        }
      }
    }
  }

  // Fuzzy release-hint bonus – tokens of releaseHint all have a near-match in title tokens
  const releaseHintTokens = releaseHint ? tokenize(releaseHint) : [];
  const releaseHintFuzzyBonus =
    releaseHintTokens.length > 0 &&
    releaseHintTokens.every(
      (rt) =>
        titleTokens.has(rt) ||
        [...titleTokens].some(
          (tt) => Math.abs(rt.length - tt.length) <= 3 && editDistance(rt, tt) <= 2
        )
    )
      ? 80
      : 0;

  const exactTitlePhraseBonus = normalizedTitle === normalizedQuery ? 90 : 0;
  const titleContainsPhraseBonus =
    normalizedQuery.length > 0 && normalizedTitle.includes(normalizedQuery) ? 60 : 0;
  const artistContainsPhraseBonus =
    normalizedQuery.length > 0 && normalizedArtist.includes(normalizedQuery) ? 35 : 0;
  const releaseHintBonus =
    releaseHint && normalizedTitle.includes(releaseHint.toLowerCase()) ? 95 : 0;
  const artistHintBonus =
    artistHint && normalizedArtist.includes(artistHint.toLowerCase()) ? 65 : 0;
  const effectiveTitleHits = titleHits + fuzzyTitleHits * 0.75;
  const combinedBonus = effectiveTitleHits > 0 && artistHits > 0 ? 40 : 0;

  return (
    candidate.score +
    titleHits * 18 +
    fuzzyTitleHits * 13 +
    artistHits * 12 +
    combinedBonus +
    exactTitlePhraseBonus +
    titleContainsPhraseBonus +
    artistContainsPhraseBonus +
    Math.max(releaseHintBonus, releaseHintFuzzyBonus) +
    artistHintBonus
  );
}

async function searchOneVariant(query: string, limit: number): Promise<ImportCandidate[]> {
  const encodedQuery = encodeURIComponent(query.trim());
  const response = await mbFetch(`/release/?fmt=json&limit=${limit}&query=${encodedQuery}`);

  if (!response.ok) {
    throw new Error(`MusicBrainz search failed with status ${response.status}`);
  }

  const data = (await response.json()) as {
    releases?: Array<{
      id: string;
      score?: number;
      title?: string;
      date?: string;
      'release-group'?: { id?: string };
      'artist-credit'?: unknown;
    }>;
  };

  return (data.releases ?? []).map((release) => ({
    releaseMbid: release.id,
    releaseGroupMbid: release['release-group']?.id ?? null,
    title: release.title ?? 'Unknown Album',
    artist: pickArtistName(release['artist-credit']),
    releaseDate: release.date ?? null,
    score: Number.parseInt(String(release.score ?? 0), 10)
  }));
}

async function lookupReleaseCandidateByMbid(mbid: string): Promise<ImportCandidate | null> {
  const response = await mbFetch(
    `/release/${encodeURIComponent(mbid)}?fmt=json&inc=artist-credits+release-groups`
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`MusicBrainz lookup failed with status ${response.status}`);
  }

  const release = (await response.json()) as {
    id: string;
    title?: string;
    date?: string;
    'release-group'?: { id?: string };
    'artist-credit'?: unknown;
  };

  return {
    releaseMbid: release.id,
    releaseGroupMbid: release['release-group']?.id ?? null,
    title: release.title ?? 'Unknown Album',
    artist: pickArtistName(release['artist-credit']),
    releaseDate: release.date ?? null,
    score: 1000
  };
}

async function lookupReleaseGroupCandidatesByMbid(mbid: string, limit: number): Promise<ImportCandidate[]> {
  const response = await mbFetch(
    `/release?release-group=${encodeURIComponent(mbid)}&fmt=json&limit=${limit}&inc=artist-credits+release-groups`
  );

  if (response.status === 404) {
    return [];
  }

  if (!response.ok) {
    throw new Error(`MusicBrainz release-group browse failed with status ${response.status}`);
  }

  const data = (await response.json()) as {
    releases?: Array<{
      id: string;
      title?: string;
      date?: string;
      'release-group'?: { id?: string };
      'artist-credit'?: unknown;
    }>;
  };

  return (data.releases ?? []).map((release) => ({
    releaseMbid: release.id,
    releaseGroupMbid: release['release-group']?.id ?? mbid,
    title: release.title ?? 'Unknown Album',
    artist: pickArtistName(release['artist-credit']),
    releaseDate: release.date ?? null,
    score: 950
  }));
}

/**
 * Build a fuzzy release query term.
 * Single token: `release:term~`
 * Multi-token: `(release:t1~ AND release:t2~ ...)`
 * The `~` operator in Lucene uses edit-distance 1 for terms ≤5 chars and 2 for longer,
 * which catches common spelling variants such as "rumors" vs "Rumours".
 */
function buildFuzzyReleaseTerms(text: string): string {
  const tokens = tokenize(text);
  if (tokens.length === 0) {
    return `release:"${text}"`;
  }

  if (tokens.length === 1) {
    return `release:${tokens[0]}~`;
  }

  return `(${tokens.map((t) => `release:${t}~`).join(' AND ')})`;
}

export async function searchReleaseCandidates(query: string, limit = 10): Promise<ImportCandidate[]> {
  if (isUuid(query)) {
    const releaseCandidate = await lookupReleaseCandidateByMbid(query.trim());
    if (releaseCandidate) {
      return [releaseCandidate];
    }

    const releaseGroupCandidates = await lookupReleaseGroupCandidatesByMbid(query.trim(), limit);
    if (releaseGroupCandidates.length > 0) {
      return releaseGroupCandidates.slice(0, limit);
    }
  }

  const tokens = tokenize(query);
  const splits = getArtistReleaseSplits(tokens);
  // Use the first (preferred) split for relevance scoring
  const primaryHints = splits[0] ?? { artistHint: null as string | null, releaseHint: null as string | null };
  const merged = new Map<string, ImportCandidate>();

  // Run one search per split variant, each in two forms:
  //  1. Exact quoted phrase: artist:"X" AND release:"Y"   – high precision, correct spelling
  //  2. Fuzzy per-token:     artist:"X" AND release:t1~   – catches spelling variants like rumors→Rumours
  for (const { artistHint, releaseHint } of splits) {
    const exactQuery = `artist:"${artistHint}" AND release:"${releaseHint}"`;
    const fuzzyQuery = `artist:"${artistHint}" AND ${buildFuzzyReleaseTerms(releaseHint)}`;

    for (const q of [exactQuery, fuzzyQuery]) {
      const candidates = await searchOneVariant(q, Math.max(100, limit * 4));
      for (const candidate of candidates) {
        const existing = merged.get(candidate.releaseMbid);
        if (!existing || candidate.score > existing.score) {
          merged.set(candidate.releaseMbid, candidate);
        }
      }
    }
  }

  // Always also run the raw query – lets MusicBrainz's own engine handle spelling variants
  const rawCandidates = await searchOneVariant(query.trim(), Math.max(100, limit * 4));
  for (const candidate of rawCandidates) {
    const existing = merged.get(candidate.releaseMbid);
    if (!existing || candidate.score > existing.score) {
      merged.set(candidate.releaseMbid, candidate);
    }
  }

  const { artistHint, releaseHint } = primaryHints;
  return [...merged.values()]
    .sort((a, b) => computeRelevance(b, query, artistHint, releaseHint) - computeRelevance(a, query, artistHint, releaseHint))
    .slice(0, limit);
}

export interface ReleaseDetails {
  releaseMbid: string;
  releaseGroupMbid: string | null;
  title: string;
  artist: string;
  releaseDate: string | null;
}

export interface ReleaseTrack {
  position: number;
  title: string;
  lengthMs: number | null;
}

export interface ReleaseMetadataDetails {
  releaseMbid: string;
  releaseGroupMbid: string | null;
  title: string;
  artist: string;
  releaseDate: string | null;
  country: string | null;
  status: string | null;
  barcode: string | null;
  label: string | null;
  tracks: ReleaseTrack[];
}

export async function getReleaseDetails(releaseMbid: string): Promise<ReleaseDetails> {
  const response = await mbFetch(
    `/release/${encodeURIComponent(releaseMbid)}?fmt=json&inc=artist-credits+release-groups`
  );

  if (!response.ok) {
    throw new Error(`MusicBrainz lookup failed with status ${response.status}`);
  }

  const data = (await response.json()) as {
    id: string;
    title?: string;
    date?: string;
    'release-group'?: { id?: string };
    'artist-credit'?: unknown;
  };

  return {
    releaseMbid: data.id,
    releaseGroupMbid: data['release-group']?.id ?? null,
    title: data.title ?? 'Unknown Album',
    artist: pickArtistName(data['artist-credit']),
    releaseDate: data.date ?? null
  };
}

export async function getReleaseMetadataDetails(releaseMbid: string): Promise<ReleaseMetadataDetails> {
  const response = await mbFetch(
    `/release/${encodeURIComponent(releaseMbid)}?fmt=json&inc=artist-credits+release-groups+labels+recordings+media`
  );

  if (!response.ok) {
    throw new Error(`MusicBrainz metadata lookup failed with status ${response.status}`);
  }

  const data = (await response.json()) as {
    id: string;
    title?: string;
    date?: string;
    country?: string;
    status?: string;
    barcode?: string;
    'release-group'?: { id?: string };
    'artist-credit'?: unknown;
    'label-info'?: Array<{ label?: { name?: string } }>;
    media?: Array<{
      tracks?: Array<{
        position?: number;
        length?: number;
        title?: string;
        recording?: { title?: string; length?: number };
      }>;
    }>;
  };

  const tracks: ReleaseTrack[] = [];
  for (const medium of data.media ?? []) {
    for (const track of medium.tracks ?? []) {
      const trackTitle = track.title ?? track.recording?.title ?? 'Unknown track';
      const trackLength = track.length ?? track.recording?.length ?? null;
      tracks.push({
        position: Number(track.position ?? tracks.length + 1),
        title: trackTitle,
        lengthMs: typeof trackLength === 'number' ? trackLength : null
      });
    }
  }

  return {
    releaseMbid: data.id,
    releaseGroupMbid: data['release-group']?.id ?? null,
    title: data.title ?? 'Unknown Album',
    artist: pickArtistName(data['artist-credit']),
    releaseDate: data.date ?? null,
    country: data.country ?? null,
    status: data.status ?? null,
    barcode: data.barcode ?? null,
    label: data['label-info']?.[0]?.label?.name ?? null,
    tracks
  };
}
