import type { APIRoute } from 'astro';
import { resolvePlaybackLink } from '../../../lib/server/playback-client';
import { getInventoryAlbumDetails } from '../../../lib/server/inventory-service';
import { ensureBootstrapped } from '../../../lib/server/bootstrap';

export const GET: APIRoute = async ({ params, url }) => {
  try {
    ensureBootstrapped();

    const itemId = params.id ? Number.parseInt(params.id, 10) : null;
    const releaseGroupMbid = url.searchParams.get('releaseGroupMbid');
    const releaseMbid = url.searchParams.get('releaseMbid');
    const artist = url.searchParams.get('artist');

    // Mode 1: Resolve from inventory item ID
    if (itemId && !Number.isNaN(itemId)) {
      const albumDetails = await getInventoryAlbumDetails(itemId);
      if (!albumDetails) {
        return new Response(
          JSON.stringify({
            error: 'Inventory item not found'
          }),
          {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }

      const resolution = resolvePlaybackLink({
        artistName: albumDetails.artistName,
        releaseGroupMbid: albumDetails.releaseGroupMbid,
        releaseMbid: albumDetails.releaseMbid
      });

      return new Response(JSON.stringify(resolution), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Mode 2: Resolve from direct MBID + artist (want-list fallback)
    if ((releaseGroupMbid || releaseMbid) && artist) {
      const resolution = resolvePlaybackLink({
        artistName: artist,
        releaseGroupMbid,
        releaseMbid
      });

      return new Response(JSON.stringify(resolution), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(
      JSON.stringify({
        error: 'Missing inventory ID or MBID+artist params'
      }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

