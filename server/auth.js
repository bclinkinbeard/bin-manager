import crypto from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';

const COOKIE_NAME = 'bm_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

let oauthClient = null;

function getOAuthClient() {
  if (!oauthClient) oauthClient = new OAuth2Client();
  return oauthClient;
}

function encodeBase64Url(value) {
  return Buffer.from(value).toString('base64url');
}

function decodeBase64Url(value) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function signValue(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

function parseCookies(headerValue) {
  if (!headerValue || typeof headerValue !== 'string') return {};
  const out = {};
  for (const segment of headerValue.split(';')) {
    const idx = segment.indexOf('=');
    if (idx <= 0) continue;
    const key = segment.slice(0, idx).trim();
    const value = segment.slice(idx + 1).trim();
    if (!key) continue;
    out[key] = decodeURIComponent(value);
  }
  return out;
}

function createSessionToken(user, secret, nowMs = Date.now()) {
  const nowSeconds = Math.floor(nowMs / 1000);
  const payload = {
    sub: user.id,
    email: user.email,
    name: user.name || '',
    picture: user.picture || '',
    iat: nowSeconds,
    exp: nowSeconds + SESSION_TTL_SECONDS,
  };
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = signValue(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

function parseSessionToken(token, secret, nowMs = Date.now()) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [encodedPayload, providedSignature] = parts;
  const expectedSignature = signValue(encodedPayload, secret);

  const providedBuffer = Buffer.from(providedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (providedBuffer.length !== expectedBuffer.length) return null;
  if (!crypto.timingSafeEqual(providedBuffer, expectedBuffer)) return null;

  let payload;
  try {
    payload = JSON.parse(decodeBase64Url(encodedPayload));
  } catch {
    return null;
  }

  if (!payload || typeof payload !== 'object') return null;
  if (typeof payload.sub !== 'string' || !payload.sub) return null;
  if (typeof payload.email !== 'string' || !payload.email) return null;
  if (!Number.isFinite(payload.exp)) return null;

  const nowSeconds = Math.floor(nowMs / 1000);
  if (payload.exp <= nowSeconds) return null;

  return {
    id: payload.sub,
    email: payload.email,
    name: typeof payload.name === 'string' ? payload.name : '',
    picture: typeof payload.picture === 'string' ? payload.picture : '',
  };
}

function isLocalhost(requestUrl) {
  try {
    const url = new URL(requestUrl);
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

function buildSessionCookie(token, requestUrl) {
  const attrs = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${SESSION_TTL_SECONDS}`,
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (!isLocalhost(requestUrl)) attrs.push('Secure');
  return attrs.join('; ');
}

function buildClearedSessionCookie(requestUrl) {
  const attrs = [
    `${COOKIE_NAME}=`,
    'Path=/',
    'Max-Age=0',
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (!isLocalhost(requestUrl)) attrs.push('Secure');
  return attrs.join('; ');
}

function readSessionUserFromRequest(request, secret) {
  const cookies = parseCookies(request.headers.get('cookie') || '');
  return parseSessionToken(cookies[COOKIE_NAME], secret);
}

async function verifyGoogleCredential(credential, audience) {
  const ticket = await getOAuthClient().verifyIdToken({
    idToken: credential,
    audience,
  });

  const payload = ticket.getPayload();
  if (!payload || typeof payload !== 'object') {
    throw new Error('Google token payload missing.');
  }
  if (!payload.sub || !payload.email) {
    throw new Error('Google token missing identity fields.');
  }
  if (payload.email_verified === false) {
    throw new Error('Google account email is not verified.');
  }

  return {
    id: payload.sub,
    email: payload.email,
    name: payload.name || '',
    picture: payload.picture || '',
  };
}

export {
  COOKIE_NAME,
  createSessionToken,
  parseSessionToken,
  buildSessionCookie,
  buildClearedSessionCookie,
  readSessionUserFromRequest,
  verifyGoogleCredential,
};
