import { badRequest, serverError } from '../../server/json.js';
import { requireUser } from '../../server/session.js';
import { buildPhotoPath, getBinary } from '../../server/storage.js';

function normalizeHash(value) {
  const hash = String(value || '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hash)) return '';
  return hash;
}

export async function GET(request) {
  try {
    const { user, response } = requireUser(request);
    if (response) return response;

    const url = new URL(request.url);
    const hash = normalizeHash(url.searchParams.get('hash'));
    if (!hash) return badRequest('Invalid photo hash.');

    const binary = await getBinary(buildPhotoPath(user.id, hash));
    if (!binary) {
      return new Response('Not Found', { status: 404 });
    }

    return new Response(binary.stream, {
      status: 200,
      headers: {
        'content-type': binary.contentType,
        'cache-control': 'private, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    return serverError(error.message || 'Failed to fetch photo.');
  }
}
