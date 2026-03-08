import {
  buildSessionCookie,
  createSessionToken,
  verifyGoogleCredential,
} from '../../server/auth.js';
import { badRequest, jsonResponse, readJson, serverError } from '../../server/json.js';
import { getGoogleClientId, getSessionSecret } from '../../server/session.js';

export async function POST(request) {
  try {
    const body = await readJson(request);
    const credential = typeof body.credential === 'string' ? body.credential : '';
    if (!credential) return badRequest('Missing Google credential token.');

    const googleClientId = getGoogleClientId();
    const sessionSecret = getSessionSecret();
    const user = await verifyGoogleCredential(credential, googleClientId);
    const token = createSessionToken(user, sessionSecret);
    const cookie = buildSessionCookie(token, request.url);

    return jsonResponse(
      { ok: true, user },
      { headers: { 'set-cookie': cookie } }
    );
  } catch (error) {
    return serverError(error.message || 'Google sign-in failed.');
  }
}
