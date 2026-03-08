import { badRequest, jsonResponse, readJson, serverError } from '../../server/json.js';
import { requireUser } from '../../server/session.js';
import { buildPhotoPath, photoExists } from '../../server/storage.js';

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
    const hashes = Array.isArray(body.hashes) ? body.hashes : null;
    if (!hashes) return badRequest('hashes must be an array.');

    const uniqueHashes = [...new Set(hashes.map(normalizeHash).filter(Boolean))];
    const missing = [];

    for (const hash of uniqueHashes) {
      const exists = await photoExists(buildPhotoPath(user.id, hash));
      if (!exists) missing.push(hash);
    }

    return jsonResponse({ ok: true, missing });
  } catch (error) {
    return serverError(error.message || 'Failed to check missing photos.');
  }
}
