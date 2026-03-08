import { readSessionUserFromRequest } from './auth.js';
import { requireEnv } from './storage.js';
import { unauthorized } from './json.js';

function getSessionSecret() {
  return requireEnv('SESSION_SECRET');
}

function getGoogleClientId() {
  return requireEnv('GOOGLE_CLIENT_ID');
}

function requireUser(request) {
  const secret = getSessionSecret();
  const user = readSessionUserFromRequest(request, secret);
  if (!user) return { user: null, response: unauthorized('Please sign in.') };
  return { user, response: null };
}

export { getSessionSecret, getGoogleClientId, requireUser };
