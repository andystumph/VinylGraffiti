import { describe, expect, it } from 'vitest';
import { resolvePlaybackLink } from '../../src/lib/server/playback-client';

describe('playback-client', () => {
  it('builds a ListenBrainz album URL from a release-group MBID', () => {
    expect(
      resolvePlaybackLink({
        artistName: 'Fleetwood Mac',
        releaseGroupMbid: '416bb5e5-c7d1-3977-8fd7-7c9daf6c2be6'
      })
    ).toEqual({
      url: 'https://listenbrainz.org/album/416bb5e5-c7d1-3977-8fd7-7c9daf6c2be6/',
      reason: 'resolved'
    });
  });

  it('falls back to a ListenBrainz release URL when only a release MBID is available', () => {
    expect(
      resolvePlaybackLink({
        artistName: 'Fleetwood Mac',
        releaseMbid: 'b0be9792-f4fe-3b5a-8a54-3f0331785f5a'
      })
    ).toEqual({
      url: 'https://listenbrainz.org/release/b0be9792-f4fe-3b5a-8a54-3f0331785f5a/',
      reason: 'resolved'
    });
  });
});