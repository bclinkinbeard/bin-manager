import { jsonResponse, serverError } from '../../server/json.js';
import { requireUser } from '../../server/session.js';
import { buildMetaPath, getJson } from '../../server/storage.js';

export async function GET(request) {
  try {
    const { user, response } = requireUser(request);
    if (response) return response;

    const metaPath = buildMetaPath(user.id);
    const meta = await getJson(metaPath);

    return jsonResponse({
      ok: true,
      hasSnapshot: Boolean(meta && meta.snapshotPath),
      meta: meta || null,
    });
  } catch (error) {
    return serverError(error.message || 'Failed to fetch sync metadata.');
  }
}
