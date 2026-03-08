import { jsonResponse } from '../../server/json.js';

export async function GET() {
  const googleClientId = process.env.GOOGLE_CLIENT_ID || '';
  return jsonResponse({
    ok: true,
    googleClientId,
    googleEnabled: Boolean(googleClientId),
  });
}
