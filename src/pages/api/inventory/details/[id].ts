import type { APIRoute } from 'astro';
import { ensureBootstrapped } from '../../../../lib/server/bootstrap';
import { getInventoryAlbumDetails } from '../../../../lib/server/inventory-service';

export const GET: APIRoute = async ({ params }) => {
  try {
    ensureBootstrapped();

    const rawId = params.id;
    const id = Number(rawId);
    if (!rawId || Number.isNaN(id) || id < 1) {
      return new Response(JSON.stringify({ error: 'Invalid inventory item id' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }

    const details = await getInventoryAlbumDetails(id);
    return new Response(JSON.stringify({ details }), {
      headers: {
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message === 'Inventory item not found' ? 404 : 500;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
};
