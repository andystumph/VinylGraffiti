import type React from 'react';
import { useEffect, useMemo, useState } from 'react';

type MediaType = 'vinyl' | 'cassette' | 'cd';

interface WantItem {
  id: number;
  artist: string;
  title: string;
  mediaType: MediaType | null;
  notes: string | null;
  isAcquired: boolean;
  createdAt: string;
}

interface SearchCandidate {
  releaseMbid: string;
  releaseGroupMbid: string | null;
  title: string;
  artist: string;
  releaseDate: string | null;
  score: number;
}

interface PendingWantAdd {
  artist: string;
  title: string;
  mediaType: MediaType | null;
  notes: string | null;
  source: 'search' | 'manual';
  releaseMbid: string | null;
}

interface AddWantResponse {
  id?: number;
  error?: string;
  requiresDuplicateConfirmation?: boolean;
  existingId?: number;
  existingIsAcquired?: boolean;
  existingMediaType?: MediaType | null;
}

function formatMediaType(value: MediaType | null): string {
  if (!value) {
    return 'Any format';
  }

  if (value === 'cd') {
    return 'CD';
  }

  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

export function WantList(): React.JSX.Element {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMediaType, setSearchMediaType] = useState<MediaType | ''>('');
  const [artist, setArtist] = useState('');
  const [title, setTitle] = useState('');
  const [manualMediaType, setManualMediaType] = useState<MediaType | ''>('');
  const [notes, setNotes] = useState('');

  const [items, setItems] = useState<WantItem[]>([]);
  const [searchResults, setSearchResults] = useState<SearchCandidate[]>([]);
  const [pendingAdd, setPendingAdd] = useState<PendingWantAdd | null>(null);
  const [duplicateAdd, setDuplicateAdd] = useState<PendingWantAdd | null>(null);
  const [duplicateExistingId, setDuplicateExistingId] = useState<number | null>(null);
  const [duplicateExistingIsAcquired, setDuplicateExistingIsAcquired] = useState<boolean | null>(null);
  const [duplicateExistingMediaType, setDuplicateExistingMediaType] = useState<MediaType | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addingFromSearchMbid, setAddingFromSearchMbid] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<number | null>(null);
  const [playbackLinkId, setPlaybackLinkId] = useState<number | null>(null);
  const [playbackLinks, setPlaybackLinks] = useState<Record<number, { url: string | null; reason: string }>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingAdd && !duplicateAdd) {
      return;
    }

    function handleKeydown(event: KeyboardEvent): void {
      if (event.key === 'Enter') {
        event.preventDefault();
        if (duplicateAdd) {
          void confirmDuplicateAdd();
          return;
        }

        if (pendingAdd) {
          void confirmQueuedAdd();
        }
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        if (duplicateAdd) {
          cancelDuplicateAdd();
          return;
        }

        if (pendingAdd) {
          cancelQueuedAdd();
        }
      }
    }

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [pendingAdd, duplicateAdd, saving, addingFromSearchMbid]);

  async function parseJsonSafe<T>(response: Response): Promise<Partial<T>> {
    try {
      return (await response.json()) as Partial<T>;
    } catch {
      return {};
    }
  }

  async function loadWantList(): Promise<void> {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/want-list');
      const payload = await parseJsonSafe<{ items?: WantItem[]; error?: string }>(response);

      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to load want list');
      }

      setItems(payload.items ?? []);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Failed to load want list';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadWantList();
  }, []);

  async function runSearch(): Promise<void> {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    try {
      setSearchLoading(true);
      setError(null);
      setSuccess(null);

      const url = new URL('/api/import/search-musicbrainz', window.location.origin);
      url.searchParams.set('q', searchQuery.trim());

      const response = await fetch(url);
      const payload = await parseJsonSafe<{ results?: SearchCandidate[]; error?: string }>(response);
      if (!response.ok) {
        throw new Error(payload.error ?? 'Search failed');
      }

      setSearchResults(payload.results ?? []);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Search failed';
      setError(message);
    } finally {
      setSearchLoading(false);
    }
  }

  async function submitWantAdd(candidate: PendingWantAdd, allowDuplicate: boolean): Promise<AddWantResponse> {
    const response = await fetch('/api/want-list', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        artist: candidate.artist,
        title: candidate.title,
        mediaType: candidate.mediaType,
        notes: candidate.notes,
        allowDuplicate
      })
    });

    const payload = await parseJsonSafe<AddWantResponse>(response);
    if (!response.ok) {
      throw new Error(payload.error ?? 'Failed to add item');
    }

    return payload;
  }

  function queueAddFromSearch(candidate: SearchCandidate): void {
    if (addingFromSearchMbid || saving) {
      return;
    }

    setError(null);
    setSuccess(null);
    setPendingAdd({
      artist: candidate.artist.trim() || 'Unknown Artist',
      title: candidate.title.trim() || 'Unknown Album',
      mediaType: searchMediaType || null,
      notes: null,
      source: 'search',
      releaseMbid: candidate.releaseMbid
    });
  }

  function queueManualAdd(): void {
    if (saving || !artist.trim() || !title.trim()) {
      return;
    }

    setError(null);
    setSuccess(null);
    setPendingAdd({
      artist: artist.trim(),
      title: title.trim(),
      mediaType: manualMediaType || null,
      notes: notes.trim() || null,
      source: 'manual',
      releaseMbid: null
    });
  }

  function cancelQueuedAdd(): void {
    if (saving || addingFromSearchMbid) {
      return;
    }

    setPendingAdd(null);
  }

  function cancelDuplicateAdd(): void {
    if (saving || addingFromSearchMbid) {
      return;
    }

    setDuplicateAdd(null);
    setDuplicateExistingId(null);
    setDuplicateExistingIsAcquired(null);
    setDuplicateExistingMediaType(null);
  }

  async function completeWantAdd(candidate: PendingWantAdd, payload: AddWantResponse, wasDuplicate: boolean): Promise<void> {
    if (candidate.source === 'search' && candidate.releaseMbid) {
      setSearchResults((current) => current.filter((entry) => entry.releaseMbid !== candidate.releaseMbid));
    }

    if (candidate.source === 'manual') {
      setArtist('');
      setTitle('');
      setManualMediaType('');
      setNotes('');
    }

    await loadWantList();
    if (wasDuplicate) {
      setSuccess(`Added duplicate want list item #${payload.id}`);
      return;
    }

    setSuccess(
      candidate.source === 'search'
        ? `Added want list item #${payload.id} from search`
        : `Added want list item #${payload.id}`
    );
  }

  async function confirmQueuedAdd(): Promise<void> {
    if (!pendingAdd || saving || addingFromSearchMbid) {
      return;
    }

    const candidate = pendingAdd;

    try {
      if (candidate.source === 'search' && candidate.releaseMbid) {
        setAddingFromSearchMbid(candidate.releaseMbid);
      } else {
        setSaving(true);
      }

      setError(null);
      setSuccess(null);

      const payload = await submitWantAdd(candidate, false);
      if (payload.requiresDuplicateConfirmation) {
        setPendingAdd(null);
        setDuplicateAdd(candidate);
        setDuplicateExistingId(payload.existingId ?? null);
        setDuplicateExistingIsAcquired(payload.existingIsAcquired ?? null);
        setDuplicateExistingMediaType(payload.existingMediaType ?? null);
        return;
      }

      setPendingAdd(null);
      await completeWantAdd(candidate, payload, false);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Failed to add item';
      setError(message);
    } finally {
      setSaving(false);
      setAddingFromSearchMbid(null);
    }
  }

  async function confirmDuplicateAdd(): Promise<void> {
    if (!duplicateAdd || saving || addingFromSearchMbid) {
      return;
    }

    const candidate = duplicateAdd;

    try {
      if (candidate.source === 'search' && candidate.releaseMbid) {
        setAddingFromSearchMbid(candidate.releaseMbid);
      } else {
        setSaving(true);
      }

      setError(null);
      setSuccess(null);

      const payload = await submitWantAdd(candidate, true);
      setDuplicateAdd(null);
      setDuplicateExistingId(null);
      setDuplicateExistingIsAcquired(null);
      setDuplicateExistingMediaType(null);
      await completeWantAdd(candidate, payload, true);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Failed to add duplicate item';
      setError(message);
    } finally {
      setSaving(false);
      setAddingFromSearchMbid(null);
    }
  }

  async function setAcquired(item: WantItem, isAcquired: boolean): Promise<void> {
    if (workingId) {
      return;
    }

    try {
      setWorkingId(item.id);
      setError(null);
      setSuccess(null);

      const response = await fetch(`/api/want-list/${item.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ isAcquired })
      });

      const payload = await parseJsonSafe<{ error?: string }>(response);
      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to update item');
      }

      setItems((current) =>
        current.map((entry) => (entry.id === item.id ? { ...entry, isAcquired } : entry))
      );
      setSuccess(isAcquired ? 'Marked as acquired' : 'Marked as wanted');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Failed to update item';
      setError(message);
    } finally {
      setWorkingId(null);
    }
  }

  async function deleteItem(item: WantItem): Promise<void> {
    if (workingId) {
      return;
    }

    const confirmed = window.confirm(`Remove "${item.title}" by ${item.artist} from Want List?`);
    if (!confirmed) {
      return;
    }

    try {
      setWorkingId(item.id);
      setError(null);
      setSuccess(null);

      const response = await fetch(`/api/want-list/${item.id}`, {
        method: 'DELETE'
      });
      const payload = await parseJsonSafe<{ error?: string }>(response);

      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to delete item');
      }

      setItems((current) => current.filter((entry) => entry.id !== item.id));
      setSuccess('Removed want list item');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Failed to delete item';
      setError(message);
    } finally {
      setWorkingId(null);
    }
  }

  async function resolvePlaybackLinkForWant(item: WantItem): Promise<void> {
    if (playbackLinkId !== null || playbackLinks[item.id]) {
      const link = playbackLinks[item.id];
      if (link?.url) {
        window.open(link.url, '_blank');
      } else {
        setError(`Playback unavailable: ${link?.reason ?? 'unknown'}`);
      }
      return;
    }

    try {
      setPlaybackLinkId(item.id);
      setError(null);

      const url = new URL('/api/import/search-musicbrainz', window.location.origin);
      url.searchParams.set('q', `${item.artist} ${item.title}`);
      const searchResponse = await fetch(url);
      const searchPayload = (await searchResponse.json()) as {
        results?: Array<{
          releaseMbid: string;
          releaseGroupMbid: string | null;
          artist: string;
          title: string;
        }>;
        error?: string;
      };

      if (!searchResponse.ok || !searchPayload.results || searchPayload.results.length === 0) {
        throw new Error('Could not find MusicBrainz data for this item');
      }

      const candidate = searchPayload.results[0];
      const playResponse = await fetch(
        `/api/playback?artist=${encodeURIComponent(candidate.artist)}${candidate.releaseGroupMbid ? `&releaseGroupMbid=${encodeURIComponent(candidate.releaseGroupMbid)}` : ''}${candidate.releaseMbid ? `&releaseMbid=${encodeURIComponent(candidate.releaseMbid)}` : ''}`
      );
      const playPayload = (await playResponse.json()) as { url?: string; reason?: string; error?: string };

      if (!playResponse.ok) {
        throw new Error(playPayload.error ?? 'Failed to resolve playback link');
      }

      const link = { url: playPayload.url ?? null, reason: playPayload.reason ?? 'unknown' };
      setPlaybackLinks((current) => ({
        ...current,
        [item.id]: link
      }));

      if (link.url) {
        window.open(link.url, '_blank');
      } else {
        setError(`Playback unavailable: ${link.reason}`);
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Failed to resolve playback link';
      setError(message);
    } finally {
      setPlaybackLinkId(null);
    }
  }

  const wantedCount = useMemo(() => items.filter((item) => !item.isAcquired).length, [items]);

  return (
    <section className="panel">
      <div className="section-header">
        <div>
          <h2>Want List</h2>
          <p>Track releases you want to add to your collection next.</p>
        </div>
        <div className="section-header-actions">
          <a href="/print/want-list?acquired=exclude" className="secondary-button" target="_blank" rel="noreferrer">
            Print / Save PDF
          </a>
        </div>
      </div>

      <div className="controls">
        <input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void runSearch();
            }

            if (event.key === 'Escape') {
              event.preventDefault();
              setSearchQuery('');
              setSearchResults([]);
              setError(null);
            }
          }}
          placeholder="Search MusicBrainz (artist, album, or MBID)"
          aria-label="Want list search"
        />
        <select
          value={searchMediaType}
          onChange={(event) => setSearchMediaType(event.currentTarget.value as MediaType | '')}
          aria-label="Search preferred media type"
        >
          <option value="">Any format</option>
          <option value="vinyl">Vinyl</option>
          <option value="cassette">Cassette</option>
          <option value="cd">CD</option>
        </select>
        <button type="button" onClick={() => void runSearch()} disabled={searchLoading || !!addingFromSearchMbid}>
          {searchLoading ? 'Searching...' : 'Search Metadata'}
        </button>
      </div>

      {searchResults.length > 0 && (
        <div className="results-grid">
          {searchResults.map((candidate) => (
            <article key={candidate.releaseMbid} className="card">
              <h3>{candidate.title}</h3>
              <p>{candidate.artist}</p>
              <p>{candidate.releaseDate ?? 'Unknown date'}</p>
              <p>Match score: {candidate.score}</p>
              <button
                type="button"
                onClick={() => queueAddFromSearch(candidate)}
                disabled={!!addingFromSearchMbid || saving || searchLoading || !!pendingAdd || !!duplicateAdd}
              >
                {addingFromSearchMbid === candidate.releaseMbid ? 'Adding...' : 'Add To Want List'}
              </button>
            </article>
          ))}
        </div>
      )}

      <div className="controls">
        <input
          value={artist}
          onChange={(event) => setArtist(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              queueManualAdd();
            }

            if (event.key === 'Escape') {
              event.preventDefault();
              setArtist('');
              setTitle('');
              setManualMediaType('');
              setNotes('');
            }
          }}
          placeholder="Artist"
          aria-label="Want list artist"
        />
        <input
          value={title}
          onChange={(event) => setTitle(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              queueManualAdd();
            }

            if (event.key === 'Escape') {
              event.preventDefault();
              setArtist('');
              setTitle('');
              setManualMediaType('');
              setNotes('');
            }
          }}
          placeholder="Album title"
          aria-label="Want list album title"
        />
        <select
          value={manualMediaType}
          onChange={(event) => setManualMediaType(event.currentTarget.value as MediaType | '')}
          aria-label="Manual preferred media type"
        >
          <option value="">Any format</option>
          <option value="vinyl">Vinyl</option>
          <option value="cassette">Cassette</option>
          <option value="cd">CD</option>
        </select>
      </div>

      <div className="controls single-action-row">
        <input
          value={notes}
          onChange={(event) => setNotes(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              queueManualAdd();
            }

            if (event.key === 'Escape') {
              event.preventDefault();
              setArtist('');
              setTitle('');
              setManualMediaType('');
              setNotes('');
            }
          }}
          placeholder="Notes (optional)"
          aria-label="Want list notes"
        />
        <button type="button" onClick={queueManualAdd} disabled={saving || !!pendingAdd || !!duplicateAdd}>
          {saving ? 'Adding...' : 'Add To Want List'}
        </button>
      </div>

      {loading && <p>Loading want list...</p>}
      {error && <p className="error">{error}</p>}
      {success && <p className="success">{success}</p>}

      {!loading && (
        <>
          <p className="meta">Wanted items: {wantedCount} | Total: {items.length}</p>
          <div className="results-grid">
            {items.map((item) => (
              <article key={item.id} className="card">
                <h3>{item.title}</h3>
                <p>{item.artist}</p>
                <p>
                  <strong>Format:</strong> {formatMediaType(item.mediaType)}
                </p>
                {item.notes && (
                  <p>
                    <strong>Notes:</strong> {item.notes}
                  </p>
                )}
                <p>
                  <strong>Status:</strong> {item.isAcquired ? 'Acquired' : 'Wanted'}
                </p>
                <div className="card-actions two-action-row">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => void resolvePlaybackLinkForWant(item)}
                    disabled={playbackLinkId === item.id}
                  >
                    {playbackLinkId === item.id ? 'Opening...' : 'Play'}
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => void setAcquired(item, !item.isAcquired)}
                    disabled={workingId === item.id}
                  >
                    {workingId === item.id
                      ? 'Saving...'
                      : item.isAcquired
                        ? 'Mark Wanted'
                        : 'Mark Acquired'}
                  </button>
                  <button
                    type="button"
                    className="danger-button"
                    onClick={() => void deleteItem(item)}
                    disabled={workingId === item.id}
                  >
                    {workingId === item.id ? 'Working...' : 'Remove'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {pendingAdd && (
        <div className="confirm-modal-backdrop" role="presentation" onClick={cancelQueuedAdd}>
          <div
            className="confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Confirm want list add"
            tabIndex={-1}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void confirmQueuedAdd();
              }

              if (event.key === 'Escape') {
                event.preventDefault();
                cancelQueuedAdd();
              }
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <h3>Confirm Add</h3>
            <p>
              Add <strong>{pendingAdd.title}</strong> by <strong>{pendingAdd.artist}</strong> to Want List?
            </p>
            <p>
              Preferred format: <strong>{formatMediaType(pendingAdd.mediaType)}</strong>
            </p>
            <div className="confirm-actions">
              <button type="button" onClick={() => void confirmQueuedAdd()} disabled={saving || !!addingFromSearchMbid}>
                {saving || !!addingFromSearchMbid ? 'Adding...' : 'Confirm Add'}
              </button>
              <button type="button" className="ghost" onClick={cancelQueuedAdd} disabled={saving || !!addingFromSearchMbid}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {duplicateAdd && (
        <div className="confirm-modal-backdrop" role="presentation" onClick={cancelDuplicateAdd}>
          <div
            className="confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Confirm duplicate want list add"
            tabIndex={-1}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void confirmDuplicateAdd();
              }

              if (event.key === 'Escape') {
                event.preventDefault();
                cancelDuplicateAdd();
              }
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <h3>Duplicate Detected</h3>
            <p>
              <strong>{duplicateAdd.title}</strong> by <strong>{duplicateAdd.artist}</strong> already exists in Want List.
            </p>
            <p>
              Existing item #{duplicateExistingId ?? 'unknown'} is currently{' '}
              <strong>{duplicateExistingIsAcquired ? 'Acquired' : 'Wanted'}</strong> for{' '}
              <strong>{formatMediaType(duplicateExistingMediaType)}</strong>.
            </p>
            <div className="confirm-actions">
              <button type="button" onClick={() => void confirmDuplicateAdd()} disabled={saving || !!addingFromSearchMbid}>
                {saving || !!addingFromSearchMbid ? 'Adding...' : 'Yes, Add Duplicate'}
              </button>
              <button
                type="button"
                className="ghost"
                onClick={cancelDuplicateAdd}
                disabled={saving || !!addingFromSearchMbid}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
