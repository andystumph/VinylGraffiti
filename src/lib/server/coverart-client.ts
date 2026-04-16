import fs from 'node:fs';
import path from 'node:path';

const CAA_BASE = 'https://coverartarchive.org';
const COVER_CACHE_DIR = path.resolve('./data/cover-cache');

interface CoverArtResponse {
  images?: Array<{
    front?: boolean;
    thumbnails?: {
      '250'?: string;
      '500'?: string;
      small?: string;
      large?: string;
    };
    image?: string;
  }>;
}

export async function getCoverArtThumbnail(releaseMbid: string): Promise<string | null> {
  let response: Response;

  try {
    response = await fetch(`${CAA_BASE}/release/${encodeURIComponent(releaseMbid)}`,
      {
        headers: {
          Accept: 'application/json'
        }
      }
    );
  } catch {
    return null;
  }

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as CoverArtResponse;
  const front = data.images?.find((image) => image.front) ?? data.images?.[0];

  if (!front) {
    return null;
  }

  return (
    front.thumbnails?.['250'] ??
    front.thumbnails?.small ??
    front.thumbnails?.['500'] ??
    front.thumbnails?.large ??
    front.image ??
    null
  );
}

function inferExtension(contentType: string | null): string {
  if (!contentType) {
    return 'jpg';
  }

  if (contentType.includes('png')) {
    return 'png';
  }

  if (contentType.includes('webp')) {
    return 'webp';
  }

  return 'jpg';
}

function coverFilePath(releaseMbid: string, extension: string): string {
  return path.join(COVER_CACHE_DIR, `${releaseMbid}.${extension}`);
}

function findExistingCoverPath(releaseMbid: string): string | null {
  const extensions = ['jpg', 'png', 'webp'];
  for (const extension of extensions) {
    const filePath = coverFilePath(releaseMbid, extension);
    if (fs.existsSync(filePath)) {
      return filePath;
    }
  }

  return null;
}

export function getCachedCoverUrl(releaseMbid: string): string | null {
  const existing = findExistingCoverPath(releaseMbid);
  if (!existing) {
    return null;
  }

  const extension = path.extname(existing).replace('.', '');
  return `/api/cover/${releaseMbid}.${extension}`;
}

export async function cacheThumbnailForRelease(releaseMbid: string): Promise<string | null> {
  const existingUrl = getCachedCoverUrl(releaseMbid);
  if (existingUrl) {
    return existingUrl;
  }

  const remoteUrl = await getCoverArtThumbnail(releaseMbid);
  if (!remoteUrl) {
    return null;
  }

  let response: Response;

  try {
    response = await fetch(remoteUrl);
  } catch {
    return null;
  }

  if (!response.ok) {
    return null;
  }

  const contentType = response.headers.get('content-type');
  const extension = inferExtension(contentType);
  const filePath = coverFilePath(releaseMbid, extension);

  fs.mkdirSync(COVER_CACHE_DIR, { recursive: true });
  try {
    const bytes = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(filePath, bytes);
  } catch {
    return null;
  }

  return `/api/cover/${releaseMbid}.${extension}`;
}

export function readCachedCoverFile(fileName: string): { bytes: Buffer; contentType: string } | null {
  const safeName = path.basename(fileName);
  const filePath = path.join(COVER_CACHE_DIR, safeName);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  const extension = path.extname(filePath).replace('.', '').toLowerCase();
  const contentType = extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : 'image/jpeg';

  return {
    bytes: fs.readFileSync(filePath),
    contentType
  };
}
