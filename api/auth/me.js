import { jsonResponse, serverError } from '../../server/json.js';
import { readSessionUserFromRequest } from '../../server/auth.js';

export async function GET(request) {
  try {
    const secret = process.env.SESSION_SECRET || '';
    if (!secret) {
      return jsonResponse({ ok: true, user: null, authEnabled: false });
    }
    const user = readSessionUserFromRequest(request, secret);
    return jsonResponse({ ok: true, user: user || null, authEnabled: true });
  } catch (error) {
    return serverError(error.message || 'Failed to read session.');
  }
}
