import type React from 'react';
import { useEffect, useState } from 'react';

type MediaType = 'vinyl' | 'cassette' | 'cd';

interface Candidate {
  releaseMbid: string;
  releaseGroupMbid: string | null;
  title: string;
  artist: string;
  releaseDate: string | null;
  hasCoverArt: boolean | null;
  score: number;
}

interface AddResponse {
  id?: number;
  error?: string;
  requiresDuplicateConfirmation?: boolean;
  existingId?: number;
  existingQuantity?: number;
}

const mediaOptions: MediaType[] = ['vinyl', 'cassette', 'cd'];

function formatMediaType(mediaType: MediaType): string {
  if (mediaType === 'cd') {
    return 'CD';
  }

  return mediaType.slice(0, 1).toUpperCase() + mediaType.slice(1);
}

export function AddInventorySearch(): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [mediaType, setMediaType] = useState<MediaType>('vinyl');
  const [condition, setCondition] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [results, setResults] = useState<Candidate[]>([]);
  const [pendingCandidate, setPendingCandidate] = useState<Candidate | null>(null);
  const [duplicateCandidate, setDuplicateCandidate] = useState<Candidate | null>(null);
  const [duplicateQuantity, setDuplicateQuantity] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [importingMbid, setImportingMbid] = useState<string | null>(null);
  const [manualSaving, setManualSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingCandidate && !duplicateCandidate) {
      return;
    }

    function handleKeydown(event: KeyboardEvent): void {
      if (event.key === 'Enter') {
        event.preventDefault();
        if (duplicateCandidate) {
          void confirmDuplicateImport();
          return;
        }

        if (pendingCandidate) {
          void confirmQueuedImport();
        }
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        if (duplicateCandidate) {
          cancelDuplicateImport();
          return;
        }

        if (pendingCandidate) {
          cancelQueuedImport();
        }
      }
    }

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [pendingCandidate, duplicateCandidate, importingMbid]);

  async function parseJsonSafe(response: Response): Promise<AddResponse> {
    try {
      return (await response.json()) as AddResponse;
    } catch {
      return {};
    }
  }

  async function submitImport(candidate: Candidate, allowDuplicate: boolean): Promise<AddResponse> {
    const response = await fetch('/api/import/add-by-mbid', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        releaseMbid: candidate.releaseMbid,
        releaseGroupMbid: candidate.releaseGroupMbid,
        title: candidate.title,
        artist: candidate.artist,
        releaseDate: candidate.releaseDate,
        mediaType,
        allowDuplicate,
        condition,
        location,
        notes
      })
    });

    const payload = await parseJsonSafe(response);
    if (!response.ok) {
      throw new Error(payload.error ?? 'Import failed');
    }

    return payload;
  }

  async function runSearch(): Promise<void> {
    if (!query.trim()) {
      return;
    }

    try {
      setLoading(true);
      setSavedMessage(null);
      setError(null);

      const url = new URL('/api/import/search-musicbrainz', window.location.origin);
      url.searchParams.set('q', query.trim());

      const response = await fetch(url);
      const payload = (await response.json()) as { results?: Candidate[]; error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? 'Search failed');
      }

      setResults(payload.results ?? []);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Search failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  function queueImport(candidate: Candidate): void {
    if (importingMbid) {
      return;
    }

    setSavedMessage(null);
    setError(null);
    setPendingCandidate(candidate);
  }

  function cancelQueuedImport(): void {
    if (importingMbid) {
      return;
    }

    setPendingCandidate(null);
  }

  function cancelDuplicateImport(): void {
    if (importingMbid) {
      return;
    }

    setDuplicateCandidate(null);
    setDuplicateQuantity(null);
  }

  async function confirmQueuedImport(): Promise<void> {
    if (!pendingCandidate || importingMbid) {
      return;
    }

    try {
      setImportingMbid(pendingCandidate.releaseMbid);
      setSavedMessage(null);
      setError(null);

      const payload = await submitImport(pendingCandidate, false);

      if (payload.requiresDuplicateConfirmation) {
        setPendingCandidate(null);
        setDuplicateCandidate(pendingCandidate);
        setDuplicateQuantity(payload.existingQuantity ?? null);
        return;
      }

      setSavedMessage(`Saved inventory item #${payload.id}`);
      setResults((current) => current.filter((item) => item.releaseMbid !== pendingCandidate.releaseMbid));
      setPendingCandidate(null);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Import failed';
      setError(message);
    } finally {
      setImportingMbid(null);
    }
  }

  async function confirmDuplicateImport(): Promise<void> {
    if (!duplicateCandidate || importingMbid) {
      return;
    }

    try {
      setImportingMbid(duplicateCandidate.releaseMbid);
      setSavedMessage(null);
      setError(null);

      const payload = await submitImport(duplicateCandidate, true);
      setSavedMessage(`Updated duplicate inventory item #${payload.id}`);
      setResults((current) => current.filter((item) => item.releaseMbid !== duplicateCandidate.releaseMbid));
      setDuplicateCandidate(null);
      setDuplicateQuantity(null);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Import failed';
      setError(message);
    } finally {
      setImportingMbid(null);
    }
  }

  async function addManual(): Promise<void> {
    if (manualSaving) {
      return;
    }

    try {
      setManualSaving(true);
      setSavedMessage(null);
      setError(null);
      const response = await fetch('/api/inventory/manual-add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          artist: 'Unknown Artist',
          title: query.trim() || 'Manual Entry',
          mediaType,
          condition,
          location,
          notes
        })
      });

      const payload = await parseJsonSafe(response);
      if (!response.ok) {
        throw new Error(payload.error ?? 'Manual add failed');
      }

      setSavedMessage(`Manual item saved as #${payload.id}`);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Manual add failed';
      setError(message);
    } finally {
      setManualSaving(false);
    }
  }

  return (
    <section className="panel">
      <div className="section-header">
        <h2>Add Inventory</h2>
        <p>Search MusicBrainz, pick the best release, then save your physical format.</p>
      </div>

      <div className="controls">
        <input
          aria-label="Search album"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void runSearch();
            }

            if (event.key === 'Escape') {
              event.preventDefault();
              setQuery('');
              setResults([]);
              setError(null);
              setSavedMessage(null);
            }
          }}
          placeholder="Album, artist, or release"
        />
        <select value={mediaType} onChange={(event) => setMediaType(event.currentTarget.value as MediaType)}>
          {mediaOptions.map((option) => (
            <option key={option} value={option}>{formatMediaType(option)}</option>
          ))}
        </select>
        <button type="button" onClick={() => void runSearch()} disabled={loading || !!importingMbid || manualSaving}>
          Search Metadata
        </button>
      </div>

      <div className="controls">
        <input value={condition} onChange={(event) => setCondition(event.currentTarget.value)} placeholder="Condition" />
        <input value={location} onChange={(event) => setLocation(event.currentTarget.value)} placeholder="Location" />
        <input value={notes} onChange={(event) => setNotes(event.currentTarget.value)} placeholder="Notes" />
      </div>

      {loading && <p>Searching MusicBrainz...</p>}
      {error && <p className="error">{error}</p>}
      {savedMessage && <p className="success">{savedMessage}</p>}
      <div className="results-grid">
        {results.map((item) => (
          <article key={item.releaseMbid} className="card">
            <h3>{item.title}</h3>
            <p>{item.artist}</p>
            <p>{item.releaseDate ?? 'Unknown date'}</p>
            {(() => {
              const statusClass =
                item.hasCoverArt === true
                  ? 'cover-art-status--available'
                  : item.hasCoverArt === false
                    ? 'cover-art-status--missing'
                    : 'cover-art-status--unknown';
              const statusLabel =
                item.hasCoverArt === true
                  ? 'Available'
                  : item.hasCoverArt === false
                    ? 'Not available'
                    : 'Unknown';

              return (
                <p className={`cover-art-status ${statusClass}`}>
                  Cover art: {statusLabel}
                </p>
              );
            })()}
            <p>Match score: {item.score}</p>
            <button
              type="button"
              onClick={() => queueImport(item)}
              disabled={!!importingMbid || loading || manualSaving}
            >
              {importingMbid === item.releaseMbid ? 'Adding...' : 'Add This Release'}
            </button>
          </article>
        ))}
      </div>

      <div className="manual-wrap">
        <p>Can&apos;t find the right record? Save a manual item.</p>
        <button type="button" onClick={() => void addManual()} disabled={manualSaving || !!importingMbid || loading}>
          {manualSaving ? 'Saving...' : 'Add Manual Item'}
        </button>
      </div>

      {pendingCandidate && (
        <div className="confirm-modal-backdrop" role="presentation" onClick={cancelQueuedImport}>
          <div
            className="confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Confirm add release"
            tabIndex={-1}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void confirmQueuedImport();
              }

              if (event.key === 'Escape') {
                event.preventDefault();
                cancelQueuedImport();
              }
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <h3>Confirm Add</h3>
            <p>
              Add <strong>{pendingCandidate.title}</strong> by <strong>{pendingCandidate.artist}</strong> as{' '}
              <strong>{formatMediaType(mediaType)}</strong>?
            </p>
            <div className="confirm-actions">
              <button type="button" onClick={() => void confirmQueuedImport()} disabled={!!importingMbid || loading}>
                {importingMbid === pendingCandidate.releaseMbid ? 'Adding...' : 'Confirm Add'}
              </button>
              <button type="button" className="ghost" onClick={cancelQueuedImport} disabled={!!importingMbid}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {duplicateCandidate && (
        <div className="confirm-modal-backdrop" role="presentation" onClick={cancelDuplicateImport}>
          <div
            className="confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Confirm duplicate add"
            tabIndex={-1}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void confirmDuplicateImport();
              }

              if (event.key === 'Escape') {
                event.preventDefault();
                cancelDuplicateImport();
              }
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <h3>Duplicate Detected</h3>
            <p>
              <strong>{duplicateCandidate.title}</strong> by <strong>{duplicateCandidate.artist}</strong> already
              exists for <strong>{formatMediaType(mediaType)}</strong>.
            </p>
            <p>
              Current quantity: <strong>{duplicateQuantity ?? 'unknown'}</strong>. Add anyway and increase quantity?
            </p>
            <div className="confirm-actions">
              <button type="button" onClick={() => void confirmDuplicateImport()} disabled={!!importingMbid || loading}>
                {importingMbid === duplicateCandidate.releaseMbid ? 'Updating...' : 'Yes, Add Duplicate'}
              </button>
              <button type="button" className="ghost" onClick={cancelDuplicateImport} disabled={!!importingMbid}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
