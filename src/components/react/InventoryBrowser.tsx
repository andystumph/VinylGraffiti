import type React from 'react';
import { useEffect, useMemo, useState } from 'react';

type MediaType = 'all' | 'vinyl' | 'cassette' | 'cd';
type InventoryMediaType = Exclude<MediaType, 'all'>;

const inventoryMediaTypeOptions = ['vinyl', 'cassette', 'cd'] as const;

function isInventoryMediaType(value: string): value is InventoryMediaType {
  return (inventoryMediaTypeOptions as readonly string[]).includes(value);
}

function coerceInventoryMediaType(
  value: string | null | undefined,
  fallback: InventoryMediaType = 'vinyl'
): InventoryMediaType {
  if (value && isInventoryMediaType(value)) {
    return value;
  }

  return fallback;
}

interface InventoryItem {
  id: number;
  mediaType: InventoryMediaType;
  condition: string | null;
  location: string | null;
  notes: string | null;
  quantity: number;
  albumTitle: string;
  releaseDate: string | null;
  coverThumbUrl: string | null;
  artistName: string;
}

interface AlbumDetails {
  inventoryId: number;
  albumTitle: string;
  artistName: string;
  releaseDate: string | null;
  mediaType: InventoryMediaType;
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

const mediaTypeOptions: MediaType[] = ['all', 'vinyl', 'cassette', 'cd'];

function formatMediaType(mediaType: MediaType | string | null | undefined): string {
  if (!mediaType) {
    return 'Unknown media';
  }

  if (mediaType === 'all') {
    return 'All media';
  }

  if (mediaType === 'cd') {
    return 'CD';
  }

  return mediaType.slice(0, 1).toUpperCase() + mediaType.slice(1);
}

export function InventoryBrowser(): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [mediaType, setMediaType] = useState<MediaType>('all');
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [draftMediaTypes, setDraftMediaTypes] = useState<Record<number, InventoryMediaType>>({});
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [savingMediaId, setSavingMediaId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [expandedItemId, setExpandedItemId] = useState<number | null>(null);
  const [detailsByItemId, setDetailsByItemId] = useState<Record<number, AlbumDetails>>({});
  const [detailsLoadingId, setDetailsLoadingId] = useState<number | null>(null);
  const [detailsErrorByItemId, setDetailsErrorByItemId] = useState<Record<number, string>>({});
  const [playbackLinkId, setPlaybackLinkId] = useState<number | null>(null);
  const [playbackLinks, setPlaybackLinks] = useState<Record<number, { url: string | null; reason: string }>>({});

  async function parseJsonSafe<T>(response: Response): Promise<Partial<T>> {
    try {
      return (await response.json()) as Partial<T>;
    } catch {
      return {};
    }
  }

  function formatDuration(lengthMs: number | null): string {
    if (!lengthMs || lengthMs <= 0) {
      return '-';
    }

    const totalSeconds = Math.floor(lengthMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  async function loadAlbumDetails(itemId: number): Promise<void> {
    if (detailsByItemId[itemId] || detailsLoadingId === itemId) {
      return;
    }

    try {
      setDetailsLoadingId(itemId);
      setDetailsErrorByItemId((current) => {
        const next = { ...current };
        delete next[itemId];
        return next;
      });

      const response = await fetch(`/api/inventory/details/${itemId}`);
      const payload = await parseJsonSafe<{ details?: AlbumDetails; error?: string }>(response);
      if (!response.ok || !payload.details) {
        throw new Error(payload.error ?? 'Failed to load album details');
      }

      setDetailsByItemId((current) => ({
        ...current,
        [itemId]: payload.details as AlbumDetails
      }));
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Failed to load album details';
      setDetailsErrorByItemId((current) => ({
        ...current,
        [itemId]: message
      }));
    } finally {
      setDetailsLoadingId((current) => (current === itemId ? null : current));
    }
  }

  async function toggleAlbumDetails(itemId: number): Promise<void> {
    if (expandedItemId === itemId) {
      setExpandedItemId(null);
      return;
    }

    setExpandedItemId(itemId);
    await loadAlbumDetails(itemId);
  }

  async function loadData(queryOverride?: string, mediaTypeOverride?: MediaType): Promise<void> {
    try {
      setLoading(true);
      setError(null);

      const effectiveQuery = queryOverride !== undefined ? queryOverride : query;
      const effectiveMediaType = mediaTypeOverride ?? mediaType;
      const url = new URL('/api/inventory/search', window.location.origin);
      if (effectiveQuery.trim()) {
        url.searchParams.set('q', effectiveQuery.trim());
      }
      url.searchParams.set('mediaType', effectiveMediaType);

      const response = await fetch(url);
      const payload = await parseJsonSafe<{ items?: InventoryItem[]; error?: string }>(response);
      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to load inventory');
      }

      const nextItems = payload.items ?? [];
      setItems(nextItems);
      setExpandedItemId((current) => {
        if (current === null) {
          return null;
        }

        return nextItems.some((entry) => entry.id === current) ? current : null;
      });
      setDraftMediaTypes(
        Object.fromEntries(
          nextItems.map((item) => [item.id, coerceInventoryMediaType(item.mediaType, 'vinyl')])
        ) as Record<number, InventoryMediaType>
      );
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Failed to load inventory';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function deleteItem(item: InventoryItem): Promise<void> {
    if (deletingId || savingMediaId) {
      return;
    }

    const confirmed = window.confirm(
      `Delete "${item.albumTitle}" by ${item.artistName} (${item.mediaType}) from inventory?`
    );

    if (!confirmed) {
      return;
    }

    try {
      setDeletingId(item.id);
      setError(null);
      setSuccessMessage(null);

      const response = await fetch(`/api/inventory/${item.id}`, {
        method: 'DELETE'
      });
      const payload = (await response.json()) as { deleted?: boolean; error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Delete failed');
      }

      setItems((current) => current.filter((entry) => entry.id !== item.id));
      setDetailsByItemId((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
      setDetailsErrorByItemId((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
      setExpandedItemId((current) => (current === item.id ? null : current));
      setSuccessMessage(`Deleted inventory item #${item.id}`);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Delete failed';
      setError(message);
    } finally {
      setDeletingId(null);
    }
  }

  async function saveMediaType(item: InventoryItem): Promise<void> {
    const nextMediaType = coerceInventoryMediaType(draftMediaTypes[item.id] ?? item.mediaType, item.mediaType);
    if (nextMediaType === item.mediaType || savingMediaId || deletingId) {
      return;
    }

    try {
      setSavingMediaId(item.id);
      setError(null);
      setSuccessMessage(null);

      const response = await fetch(`/api/inventory/${item.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ mediaType: nextMediaType })
      });
      const payload = await parseJsonSafe<{ mergedIntoId?: number; error?: string }>(response);

      if (!response.ok) {
        throw new Error(payload.error ?? 'Update failed');
      }

      const filterWillHideUpdatedItem = mediaType !== 'all' && mediaType !== nextMediaType;
      if (filterWillHideUpdatedItem) {
        setMediaType('all');
      } else {
        await loadData();
      }

      setSuccessMessage(
        payload.mergedIntoId
          ? `Merged entry into existing ${formatMediaType(nextMediaType)} item #${payload.mergedIntoId}`
          : `Updated media type to ${formatMediaType(nextMediaType)}`
      );
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Update failed';
      setError(message);
    } finally {
      setSavingMediaId(null);
    }
  }

  async function resolvePlaybackLink(itemId: number): Promise<void> {
    if (playbackLinkId !== null || playbackLinks[itemId]) {
      const link = playbackLinks[itemId];
      if (link?.url) {
        window.open(link.url, '_blank');
      } else {
        setError(`Playback unavailable: ${link?.reason ?? 'unknown'}`);
      }
      return;
    }

    try {
      setPlaybackLinkId(itemId);
      setError(null);

      const response = await fetch(`/api/playback/${itemId}`);
      const payload = (await response.json()) as { url?: string; reason?: string; error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to resolve playback link');
      }

      const link = { url: payload.url ?? null, reason: payload.reason ?? 'unknown' };
      setPlaybackLinks((current) => ({
        ...current,
        [itemId]: link
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

  useEffect(() => {
    void loadData();
  }, [mediaType]);

  useEffect(() => {
    if (expandedItemId === null) {
      return;
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setExpandedItemId(null);
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [expandedItemId]);

  const heading = useMemo(() => {
    return formatMediaType(mediaType);
  }, [mediaType]);

  const printHref = useMemo(() => {
    const params = new URLSearchParams();
    if (query.trim()) {
      params.set('q', query.trim());
    }
    params.set('mediaType', mediaType);
    return `/print/collection?${params.toString()}`;
  }, [query, mediaType]);

  const activeItem = useMemo(() => {
    if (expandedItemId === null) {
      return null;
    }

    return items.find((item) => item.id === expandedItemId) ?? null;
  }, [items, expandedItemId]);

  const activeDetails = useMemo(() => {
    if (expandedItemId === null) {
      return null;
    }

    return detailsByItemId[expandedItemId] ?? null;
  }, [expandedItemId, detailsByItemId]);

  const activeTracks = useMemo(() => {
    if (!activeDetails || !Array.isArray(activeDetails.tracks)) {
      return [] as AlbumDetails['tracks'];
    }

    return activeDetails.tracks;
  }, [activeDetails]);

  return (
    <section className="panel">
      <div className="section-header">
        <div>
          <h2>My Collection</h2>
          <p>Search by artist or album, then narrow by media type.</p>
        </div>
        <div className="section-header-actions">
          <a href={printHref} className="secondary-button" target="_blank" rel="noreferrer">
            Print / Save PDF
          </a>
        </div>
      </div>
      <div className="controls">
        <input
          aria-label="Search inventory"
          value={query}
          onChange={(event) => {
            const value = event.currentTarget.value;
            setQuery(value);
            if (value === '') {
              void loadData('');
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              void loadData();
            } else if (event.key === 'Escape') {
              setQuery('');
              void loadData('');
            }
          }}
          placeholder="Search artist or album"
        />
        <select value={mediaType} onChange={(event) => setMediaType(event.currentTarget.value as MediaType)}>
          {mediaTypeOptions.map((option) => (
            <option key={option} value={option}>
              {formatMediaType(option)}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => void loadData()}>
          Search
        </button>
      </div>

      {loading && <p>Loading inventory...</p>}
      {error && <p className="error">{error}</p>}
      {successMessage && <p className="success">{successMessage}</p>}

      {!loading && !error && (
        <>
          <p className="meta">{heading} results: {items.length}</p>
          <div className="results-grid">
            {items.map((item) => (
              <article key={item.id} className="card">
                <div className="thumb-wrap">
                  {item.coverThumbUrl ? (
                    <button
                      type="button"
                      className="thumb-button"
                      onClick={() => void toggleAlbumDetails(item.id)}
                      aria-expanded={expandedItemId === item.id}
                    >
                      <img src={item.coverThumbUrl} alt={`${item.albumTitle} cover`} loading="lazy" />
                    </button>
                  ) : (
                    <div className="thumb-placeholder">No art</div>
                  )}
                </div>
                <div>
                  <button
                    type="button"
                    className="album-title-button"
                    onClick={() => void toggleAlbumDetails(item.id)}
                    aria-expanded={expandedItemId === item.id}
                  >
                    {item.albumTitle}
                  </button>
                  <p>{item.artistName}</p>
                  <button
                    type="button"
                    className="details-toggle-button"
                    onClick={() => void toggleAlbumDetails(item.id)}
                    aria-expanded={expandedItemId === item.id}
                  >
                    {expandedItemId === item.id ? 'Hide album details' : 'Show album details'}
                  </button>
                  <p>
                    <strong>Media:</strong>
                  </p>
                  <div className="inline-edit-row">
                    <select
                      value={coerceInventoryMediaType(draftMediaTypes[item.id] ?? item.mediaType, item.mediaType)}
                      onChange={(event) => {
                        const selected = coerceInventoryMediaType(event.currentTarget.value, item.mediaType);
                        setDraftMediaTypes((current) => ({
                          ...current,
                          [item.id]: selected
                        }));
                      }}
                      disabled={savingMediaId === item.id || deletingId === item.id}
                    >
                      <option value="vinyl">Vinyl</option>
                      <option value="cassette">Cassette</option>
                      <option value="cd">CD</option>
                    </select>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => void saveMediaType(item)}
                      disabled={
                        savingMediaId === item.id ||
                        deletingId === item.id ||
                        (draftMediaTypes[item.id] ?? item.mediaType) === item.mediaType
                      }
                    >
                      {savingMediaId === item.id ? 'Saving...' : 'Save Type'}
                    </button>
                  </div>
                  <p>
                    <strong>Qty:</strong> {item.quantity}
                  </p>
                  {item.location && <p><strong>Location:</strong> {item.location}</p>}
                  {item.condition && <p><strong>Condition:</strong> {item.condition}</p>}

                  <div className="card-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => void resolvePlaybackLink(item.id)}
                      disabled={playbackLinkId === item.id}
                    >
                      {playbackLinkId === item.id ? 'Opening...' : 'Play'}
                    </button>
                    <button
                      type="button"
                      className="danger-button"
                      onClick={() => void deleteItem(item)}
                      disabled={deletingId === item.id}
                    >
                      {deletingId === item.id ? 'Deleting...' : 'Delete Entry'}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>

          {expandedItemId !== null && (
            <div className="album-modal-backdrop" onClick={() => setExpandedItemId(null)}>
              <section className="album-modal" onClick={(event) => event.stopPropagation()}>

                <button type="button" className="album-modal-close" onClick={() => setExpandedItemId(null)} aria-label="Close">
                  ✕
                </button>

                {detailsLoadingId === expandedItemId && (
                  <p className="album-modal-loading">Loading album details…</p>
                )}

                {detailsErrorByItemId[expandedItemId] && (
                  <div className="album-modal-error">
                    <p className="error">{detailsErrorByItemId[expandedItemId]}</p>
                    <button type="button" className="secondary-button" onClick={() => void loadAlbumDetails(expandedItemId)}>
                      Retry
                    </button>
                  </div>
                )}

                {detailsLoadingId !== expandedItemId && !detailsErrorByItemId[expandedItemId] && activeDetails && (
                  <>
                    <div className="album-modal-hero">
                      {activeItem?.coverThumbUrl && (
                        <img
                          src={activeItem.coverThumbUrl}
                          alt={`${activeDetails.albumTitle} cover`}
                          className="album-modal-cover"
                        />
                      )}
                      <div className="album-modal-hero-info">
                        <h3 className="album-modal-title">{activeDetails.albumTitle}</h3>
                        <p className="album-modal-artist">{activeDetails.artistName}</p>
                        <div className="album-modal-pills">
                          {activeDetails.releaseDate && (
                            <span className="pill">{activeDetails.releaseDate}</span>
                          )}
                          {activeDetails.country && (
                            <span className="pill">{activeDetails.country}</span>
                          )}
                          {activeDetails.status && (
                            <span className="pill pill-accent">{activeDetails.status}</span>
                          )}
                          <span className="pill">{formatMediaType(activeDetails.mediaType)}</span>
                        </div>
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => void resolvePlaybackLink(expandedItemId ?? 0)}
                          disabled={playbackLinkId === expandedItemId}
                          style={{ marginBottom: '1rem' }}
                        >
                          {playbackLinkId === expandedItemId ? 'Opening...' : 'Play Album'}
                        </button>
                        <dl className="album-modal-meta">
                          {activeDetails.label && (
                            <><dt>Label</dt><dd>{activeDetails.label}</dd></>
                          )}
                          {activeDetails.barcode && (
                            <><dt>Barcode</dt><dd>{activeDetails.barcode}</dd></>
                          )}
                          {activeDetails.releaseMbid && (
                            <><dt>MusicBrainz</dt><dd className="album-modal-mbid">{activeDetails.releaseMbid}</dd></>
                          )}
                        </dl>
                      </div>
                    </div>

                          {activeTracks.length > 0 && (
                      <div className="album-modal-tracks">
                        <h4 className="album-modal-tracks-heading">Track list</h4>
                        <ol className="track-list">
                                {activeTracks.map((track) => (
                            <li key={`${track.position}-${track.title}`} className="track-row">
                              <span className="track-num">{track.position}</span>
                              <span className="track-title">{track.title}</span>
                              <span className="track-dur">{formatDuration(track.lengthMs)}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}

                          {activeTracks.length === 0 && (
                      <p className="meta" style={{ marginTop: '1rem' }}>No track list available for this release.</p>
                    )}
                  </>
                )}

                {detailsLoadingId !== expandedItemId && !detailsErrorByItemId[expandedItemId] && !activeDetails && (
                  <p className="meta">No additional metadata available.</p>
                )}
              </section>
            </div>
          )}
        </>
      )}
    </section>
  );
}
