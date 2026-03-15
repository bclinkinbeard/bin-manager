import crypto from 'node:crypto';
import { unauthorized } from './json.js';

const HEADER_NAME = 'x-sync-key';
const DEMO_SYNC_KEY = 'demo';

function normalizeSyncKey(value) {
  const key = String(value || '').trim();
  if (!key) return '';
  if (key === DEMO_SYNC_KEY) return key;
  if (key.length < 8) return '';
  if (key.length > 256) return '';
  return key;
}

function deriveNamespaceFromKey(syncKey) {
  const pepper = process.env.SYNC_KEY_PEPPER || '';
  return crypto
    .createHash('sha256')
    .update(`bm-sync-v1:${pepper}:${syncKey}`)
    .digest('hex');
}

function requireSyncNamespace(request) {
  const key = normalizeSyncKey(request.headers.get(HEADER_NAME) || '');
  if (!key) {
    return {
      namespace: null,
      response: unauthorized('Missing or invalid sync key.'),
    };
  }

  return {
    namespace: deriveNamespaceFromKey(key),
    response: null,
  };
}

export { HEADER_NAME, normalizeSyncKey, deriveNamespaceFromKey, requireSyncNamespace };
