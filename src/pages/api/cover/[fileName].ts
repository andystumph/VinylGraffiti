import type { APIRoute } from 'astro';
import { readCachedCoverFile } from '../../../lib/server/coverart-client';

export const GET: APIRoute = ({ params }) => {
  const fileName = params.fileName;
  if (!fileName) {
    return new Response('Missing file name', { status: 400 });
  }

  const cover = readCachedCoverFile(fileName);
  if (!cover) {
    return new Response('Not found', { status: 404 });
  }

  return new Response(new Uint8Array(cover.bytes), {
    headers: {
      'Content-Type': cover.contentType,
      'Cache-Control': 'public, max-age=604800, immutable'
    }
  });
};
