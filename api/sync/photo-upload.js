import { badRequest, jsonResponse, readJson, serverError } from '../../server/json.js';
import { requireUser } from '../../server/session.js';
import { buildPhotoPath, photoExists, putPhotoFromDataUrl } from '../../server/storage.js';

function normalizeHash(value) {
  const hash = String(value || '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hash)) return '';
  return hash;
}

export async function POST(request) {
  try {
    const { user, response } = requireUser(request);
    if (response) return response;

    const body = await readJson(request);
    const hash = normalizeHash(body.hash);
    const dataUrl = typeof body.dataUrl === 'string' ? body.dataUrl : '';
    const mimeType = typeof body.mimeType === 'string' ? body.mimeType : '';

    if (!hash) return badRequest('Invalid photo hash.');
    if (!dataUrl.startsWith('data:image/')) {
      return badRequest('Photo must be provided as a data:image/... URL.');
    }

    const path = buildPhotoPath(user.id, hash);
    const exists = await photoExists(path);
    if (exists) {
      return jsonResponse({ ok: true, uploaded: false, hash });
    }

    try {
      await putPhotoFromDataUrl(path, dataUrl, mimeType);
    } catch (error) {
      const msg = String(error?.message || '').toLowerCase();
      if (msg.includes('exists') || msg.includes('conflict')) {
        return jsonResponse({ ok: true, uploaded: false, hash });
      }
      throw error;
    }
    return jsonResponse({ ok: true, uploaded: true, hash });
  } catch (error) {
    return serverError(error.message || 'Failed to upload photo.');
  }
}
