import { get, head, put } from '@vercel/blob';

const DEFAULT_BLOB_ACCESS = 'private';
const BLOB_ACCESS = normalizeBlobAccess(
  process.env.BLOB_ACCESS || process.env.VERCEL_BLOB_ACCESS || DEFAULT_BLOB_ACCESS
);

function normalizeBlobAccess(value) {
  return String(value || '').trim().toLowerCase() === 'public' ? 'public' : 'private';
}

function sanitizeUserId(userId) {
  return String(userId || '').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function buildMetaPath(userId) {
  return `sync/${sanitizeUserId(userId)}/latest.json`;
}

function buildSnapshotPath(userId, snapshotId) {
  return `sync/${sanitizeUserId(userId)}/snapshots/${snapshotId}.json`;
}

function buildPhotoPath(userId, hash) {
  return `sync/${sanitizeUserId(userId)}/photos/${hash}`;
}

function buildSnapshotId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isNotFoundError(error) {
  if (!error) return false;
  const status = Number(error.status || error?.cause?.status || 0);
  if (status === 404) return true;
  const code = String(error.code || '').toLowerCase();
  if (code === 'not_found') return true;
  const name = String(error.name || '').toLowerCase();
  if (name.includes('notfound')) return true;
  const message = String(error?.message || '').toLowerCase();
  return (
    message.includes('not found') ||
    message.includes('does not exist') ||
    message.includes('404')
  );
}

async function getJson(pathname) {
  try {
    const result = await withBlobAccessRetry((access) => get(pathname, { access }));
    if (!result) return null;
    if (result.statusCode !== 200 || !result.stream) {
      throw new Error(`Blob fetch failed (${result.statusCode}).`);
    }
    const text = await new Response(result.stream).text();
    return JSON.parse(text);
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
}

async function putJson(pathname, data) {
  const body = JSON.stringify(data);
  const result = await withBlobAccessRetry((access) =>
    put(pathname, body, {
      access,
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json; charset=utf-8',
    })
  );
  return result;
}

async function photoExists(pathname) {
  try {
    await head(pathname);
    return true;
  } catch (error) {
    if (isNotFoundError(error)) return false;
    throw error;
  }
}

function dataUrlToBytes(dataUrl) {
  if (typeof dataUrl !== 'string') throw new Error('Invalid photo payload.');
  const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
  if (!match) throw new Error('Photo must be a base64 data URL.');
  const mimeType = match[1] || 'application/octet-stream';
  const base64Data = match[2] || '';
  const buffer = Buffer.from(base64Data, 'base64');
  return { mimeType, buffer };
}

async function putPhotoFromDataUrl(pathname, dataUrl, explicitMimeType) {
  const { mimeType: parsedMimeType, buffer } = dataUrlToBytes(dataUrl);
  const contentType = explicitMimeType || parsedMimeType || 'application/octet-stream';
  return withBlobAccessRetry((access) =>
    put(pathname, buffer, {
      access,
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType,
    })
  );
}

async function getBinary(pathname) {
  try {
    const result = await withBlobAccessRetry((access) => get(pathname, { access }));
    if (!result) return null;
    if (result.statusCode !== 200 || !result.stream) {
      if (result.statusCode === 304) return null;
      throw new Error(`Blob fetch failed (${result.statusCode}).`);
    }
    return {
      contentType: result.blob.contentType || 'application/octet-stream',
      stream: result.stream,
    };
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
}

function requiredBlobAccessFromError(error) {
  const message = String(error?.message || '');
  const match = message.match(/access must be ["']?(public|private)["']?/i);
  return match ? normalizeBlobAccess(match[1]) : '';
}

async function withBlobAccessRetry(runWithAccess) {
  try {
    return await runWithAccess(BLOB_ACCESS);
  } catch (error) {
    const requiredAccess = requiredBlobAccessFromError(error);
    if (requiredAccess && requiredAccess !== BLOB_ACCESS) {
      return runWithAccess(requiredAccess);
    }
    throw error;
  }
}

function sanitizeSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new Error('Snapshot must be an object.');
  }
  if (!Array.isArray(snapshot.bins) || !Array.isArray(snapshot.items)) {
    throw new Error('Snapshot must include bins and items arrays.');
  }

  const safeVersion = Number.isInteger(snapshot.version) ? snapshot.version : 1;
  if (safeVersion !== 1) {
    throw new Error(`Unsupported snapshot version: ${snapshot.version}`);
  }

  return {
    version: 1,
    bins: snapshot.bins,
    items: snapshot.items,
    exportedAt: typeof snapshot.exportedAt === 'string'
      ? snapshot.exportedAt
      : new Date().toISOString(),
  };
}

export {
  sanitizeUserId,
  buildMetaPath,
  buildSnapshotPath,
  buildPhotoPath,
  buildSnapshotId,
  getJson,
  putJson,
  photoExists,
  putPhotoFromDataUrl,
  getBinary,
  sanitizeSnapshot,
};
