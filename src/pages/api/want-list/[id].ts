import type { APIRoute } from 'astro';
import { ensureBootstrapped } from '../../../lib/server/bootstrap';
import { deleteWantListItem, updateWantListItem } from '../../../lib/server/want-list-service';

function parseId(rawId: string | undefined): number {
  const id = Number(rawId);
  if (!rawId || Number.isNaN(id) || id < 1) {
    throw new Error('Invalid want list id');
  }

  return id;
}

export const PATCH: APIRoute = async ({ params, request }) => {
  try {
    ensureBootstrapped();
    const id = parseId(params.id);
    const payload = await request.json();
    const result = updateWantListItem(id, payload);

    return new Response(JSON.stringify(result), {
      headers: {
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message === 'Invalid want list id' ? 400 : 500;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
};

export const DELETE: APIRoute = ({ params }) => {
  try {
    ensureBootstrapped();
    const id = parseId(params.id);
    const result = deleteWantListItem(id);

    return new Response(JSON.stringify(result), {
      headers: {
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message === 'Invalid want list id' ? 400 : 500;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
};
