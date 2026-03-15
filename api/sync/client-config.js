import { jsonResponse } from '../../server/json.js';
import { normalizeSyncKey } from '../../server/sync-key.js';

export async function GET() {
  const clientKeyDefault = normalizeSyncKey(process.env.CLIENT_KEY_DEFAULT || '') || 'demo';
  return jsonResponse({ ok: true, clientKeyDefault });
}
