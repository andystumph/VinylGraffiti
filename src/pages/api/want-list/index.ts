import type { APIRoute } from 'astro';
import { ensureBootstrapped } from '../../../lib/server/bootstrap';
import { addWantListItem, listWantListItems } from '../../../lib/server/want-list-service';

export const GET: APIRoute = () => {
  try {
    ensureBootstrapped();
    const items = listWantListItems();

    return new Response(JSON.stringify({ items }), {
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

export const POST: APIRoute = async ({ request }) => {
  try {
    ensureBootstrapped();
    const payload = await request.json();
    const result = addWantListItem(payload);

    return new Response(JSON.stringify(result), {
      headers: {
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
};
