import { buildClearedSessionCookie } from '../../server/auth.js';
import { jsonResponse } from '../../server/json.js';

export async function POST(request) {
  const clearedCookie = buildClearedSessionCookie(request.url);
  return jsonResponse(
    { ok: true },
    { headers: { 'set-cookie': clearedCookie } }
  );
}
