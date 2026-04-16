/**
 * Playback link resolution for ListenBrainz.
 * Constructs deterministic URLs for album browsing via ListenBrainz.
 */

export interface PlaybackLinkRequest {
  artistName?: string | null;
  releaseGroupMbid?: string | null;
  releaseMbid?: string | null;
}

export interface PlaybackLinkResponse {
  url: string | null;
  reason: string;
}

/**
 * Resolve a playable link for an album via ListenBrainz.
 * Requires artist name and release group MBID.
 *
 * @param request Contains artistName and releaseGroupMbid
 * @returns PlaybackLinkResponse with URL or reason for failure
 */
export function resolvePlaybackLink(request: PlaybackLinkRequest): PlaybackLinkResponse {
  const artistName = (request.artistName ?? '').trim();
  const releaseGroupMbid = (request.releaseGroupMbid ?? '').trim();
  const releaseMbid = (request.releaseMbid ?? '').trim();

  if (!artistName) {
    return {
      url: null,
      reason: 'no_artist_name'
    };
  }

  if (!isValidMbid(releaseGroupMbid)) {
    if (!releaseMbid || !isValidMbid(releaseMbid)) {
      return {
        url: null,
        reason: releaseGroupMbid || releaseMbid ? 'invalid_mbid' : 'no_release_group_mbid'
      };
    }

    return {
      url: `https://listenbrainz.org/release/${releaseMbid}/`,
      reason: 'resolved'
    };
  }

  return {
    url: `https://listenbrainz.org/album/${releaseGroupMbid}/`,
    reason: 'resolved'
  };
}

/**
 * Minimal MBID format validation (36-char UUID).
 */
function isValidMbid(mbid: string | null | undefined): boolean {
  if (!mbid || typeof mbid !== 'string') {
    return false;
  }

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(mbid.trim());
}
