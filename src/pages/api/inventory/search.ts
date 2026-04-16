import type { APIRoute } from 'astro';
import { ensureBootstrapped } from '../../../lib/server/bootstrap';
import { searchInventory } from '../../../lib/server/inventory-service';

export const GET: APIRoute = ({ url }) => {
  try {
    ensureBootstrapped();

    const query = url.searchParams.get('q') ?? '';
    const mediaType = (url.searchParams.get('mediaType') as 'all' | 'vinyl' | 'cassette' | 'cd' | null) ?? 'all';

    const rows = searchInventory({ query, mediaType });
    return new Response(JSON.stringify({ items: rows }), {
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
