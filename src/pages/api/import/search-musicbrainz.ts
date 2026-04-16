import type { APIRoute } from 'astro';
import { ensureBootstrapped } from '../../../lib/server/bootstrap';
import { getImportCandidates } from '../../../lib/server/inventory-service';

export const GET: APIRoute = async ({ url }) => {
  try {
    ensureBootstrapped();
    const query = url.searchParams.get('q') ?? '';
    const results = await getImportCandidates(query);

    return new Response(JSON.stringify({ results }), {
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
