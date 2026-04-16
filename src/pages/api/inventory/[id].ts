import type { APIRoute } from 'astro';
import { ensureBootstrapped } from '../../../lib/server/bootstrap';
import { deleteInventoryItem, updateInventoryItemMediaType } from '../../../lib/server/inventory-service';

function parseId(rawId: string | undefined): number {
  const id = Number(rawId);
  if (!rawId || Number.isNaN(id) || id < 1) {
    throw new Error('Invalid inventory item id');
  }

  return id;
}

export const DELETE: APIRoute = ({ params }) => {
  try {
    ensureBootstrapped();

    const id = parseId(params.id);

    const result = deleteInventoryItem(id);
    return new Response(JSON.stringify(result), {
      headers: {
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
};

export const PATCH: APIRoute = async ({ params, request }) => {
  try {
    ensureBootstrapped();

    const id = parseId(params.id);
    const payload = (await request.json()) as { mediaType?: 'vinyl' | 'cassette' | 'cd' };

    if (!payload.mediaType || !['vinyl', 'cassette', 'cd'].includes(payload.mediaType)) {
      return new Response(JSON.stringify({ error: 'Invalid media type' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }

    const result = updateInventoryItemMediaType(id, payload.mediaType);
    return new Response(JSON.stringify(result), {
      headers: {
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message === 'Invalid inventory item id' ? 400 : 500;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
};
