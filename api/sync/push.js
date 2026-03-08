import { badRequest, jsonResponse, readJson, serverError } from '../../server/json.js';
import { requireUser } from '../../server/session.js';
import {
  buildMetaPath,
  buildSnapshotId,
  buildSnapshotPath,
  getJson,
  putJson,
  sanitizeSnapshot,
} from '../../server/storage.js';

const MAX_SNAPSHOT_BYTES = 3 * 1024 * 1024;

function hasInlinePhotoData(snapshot) {
  return (snapshot.items || []).some(
    (item) => typeof item?.photo === 'string' && item.photo.startsWith('data:image/')
  );
}

export async function POST(request) {
  try {
    const { user, response } = requireUser(request);
    if (response) return response;

    const body = await readJson(request);
    if (!body || typeof body !== 'object') return badRequest('Request body must be an object.');
    if (!body.snapshot || typeof body.snapshot !== 'object') {
      return badRequest('Request body must include a snapshot object.');
    }

    const snapshot = sanitizeSnapshot(body.snapshot);
    if (hasInlinePhotoData(snapshot)) {
      return badRequest('Snapshot items must not include inline photo data. Upload photos separately.');
    }

    const serialized = JSON.stringify(snapshot);
    if (serialized.length > MAX_SNAPSHOT_BYTES) {
      return badRequest(`Snapshot too large (${serialized.length} bytes).`);
    }

    const metaPath = buildMetaPath(user.id);
    const previousMeta = await getJson(metaPath);

    const snapshotId = buildSnapshotId();
    const snapshotPath = buildSnapshotPath(user.id, snapshotId);
    await putJson(snapshotPath, snapshot);

    const nextVersion = Number.isInteger(previousMeta?.version) ? previousMeta.version + 1 : 1;
    const nextMeta = {
      version: nextVersion,
      snapshotPath,
      snapshotId,
      updatedAt: new Date().toISOString(),
      snapshotBytes: serialized.length,
      bins: snapshot.bins.length,
      items: snapshot.items.length,
    };

    await putJson(metaPath, nextMeta);

    return jsonResponse({ ok: true, meta: nextMeta });
  } catch (error) {
    return serverError(error.message || 'Failed to push cloud snapshot.');
  }
}
