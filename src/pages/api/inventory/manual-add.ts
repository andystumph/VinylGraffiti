import type { APIRoute } from 'astro';
import { ensureBootstrapped } from '../../../lib/server/bootstrap';
import { addManualInventoryItem } from '../../../lib/server/inventory-service';

export const POST: APIRoute = async ({ request }) => {
  try {
    ensureBootstrapped();
    const payload = await request.json();
    const result = addManualInventoryItem(payload);

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
