import { badRequest, jsonResponse, readJson, serverError } from '../../server/json.js';
import { requireSyncNamespace } from '../../server/sync-key.js';
import { buildPhotoPath, photoExists, putPhoto } from '../../server/storage.js';

function normalizeHash(value) {
  const hash = String(value || '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hash)) return '';
  return hash;
}

function normalizeMimeType(value) {
  const mimeType = String(value || '').split(';', 1)[0].trim().toLowerCase();
  return mimeType.startsWith('image/') ? mimeType : '';
}

function dataUrlToPhotoPayload(dataUrl, explicitMimeType = '') {
  const match = String(dataUrl || '').match(/^data:([^;]+);base64,(.*)$/);
  if (!match) {
    throw new Error('Photo must be provided as a data:image/... URL.');
  }

  const mimeType = normalizeMimeType(explicitMimeType) || normalizeMimeType(match[1]);
  if (!mimeType) {
    throw new Error('Photo content type must be an image/* mime type.');
  }

  return {
    buffer: Buffer.from(match[2] || '', 'base64'),
    mimeType,
  };
}

async function parsePhotoUploadRequest(request) {
  const url = new URL(request.url);
  const headerHash = request.headers.get('x-photo-hash');
  const queryHash = url.searchParams.get('hash');
  const contentType = String(request.headers.get('content-type') || '').toLowerCase();

  if (contentType.includes('application/json')) {
    const body = await readJson(request);
    const hash = normalizeHash(body.hash || headerHash || queryHash);
    const dataUrl = typeof body.dataUrl === 'string' ? body.dataUrl : '';
    const mimeType = typeof body.mimeType === 'string' ? body.mimeType : '';

    if (!hash) throw new Error('Invalid photo hash.');
    return {
      hash,
      ...dataUrlToPhotoPayload(dataUrl, mimeType),
    };
  }

  const hash = normalizeHash(headerHash || queryHash);
  const mimeType = normalizeMimeType(contentType);
  if (!hash) throw new Error('Invalid photo hash.');
  if (!mimeType) throw new Error('Photo content type must be an image/* mime type.');

  const buffer = Buffer.from(await request.arrayBuffer());
  if (buffer.length === 0) {
    throw new Error('Photo upload body is empty.');
  }

  return { hash, buffer, mimeType };
}

export async function POST(request) {
  try {
    const { namespace, response } = requireSyncNamespace(request);
    if (response) return response;

    let photo;
    try {
      photo = await parsePhotoUploadRequest(request);
    } catch (error) {
      return badRequest(error.message || 'Invalid photo upload.');
    }

    const path = buildPhotoPath(namespace, photo.hash);
    const exists = await photoExists(path);
    if (exists) {
      return jsonResponse({ ok: true, uploaded: false, hash: photo.hash });
    }

    try {
      await putPhoto(path, photo.buffer, photo.mimeType);
    } catch (error) {
      const msg = String(error?.message || '').toLowerCase();
      if (msg.includes('exists') || msg.includes('conflict')) {
        return jsonResponse({ ok: true, uploaded: false, hash: photo.hash });
      }
      throw error;
    }
    return jsonResponse({ ok: true, uploaded: true, hash: photo.hash });
  } catch (error) {
    return serverError(error.message || 'Failed to upload photo.');
  }
}

export { parsePhotoUploadRequest };
