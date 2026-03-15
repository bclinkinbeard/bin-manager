const SYNC_KEY_STORAGE = 'bmCloudSyncKey';
const DEMO_SYNC_KEY = 'demo';
const LEGACY_PHOTO_MAX_BYTES = 750 * 1024;

function isPhotoDataUrl(value) {
  return typeof value === 'string' && value.startsWith('data:image/');
}

function parseDataUrlMimeType(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;]+);base64,/i);
  return match ? match[1] : 'application/octet-stream';
}

function estimateDataUrlBytes(dataUrl) {
  const commaIdx = String(dataUrl || '').indexOf(',');
  if (commaIdx < 0) return 0;
  const base64Data = String(dataUrl).slice(commaIdx + 1);
  const sanitized = base64Data.replace(/\s+/g, '');
  const padding = sanitized.endsWith('==') ? 2 : sanitized.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((sanitized.length * 3) / 4) - padding);
}

function normalizeSyncKey(value) {
  const key = String(value || '').trim();
  if (key === DEMO_SYNC_KEY) return key;
  if (key.length < 8 || key.length > 256) return '';
  return key;
}

async function fetchDefaultSyncKey() {
  try {
    const response = await fetch('/api/sync/client-config', {
      method: 'GET',
      credentials: 'same-origin',
    });
    if (!response.ok) return DEMO_SYNC_KEY;
    const data = await response.json();
    return normalizeSyncKey(data && data.clientKeyDefault) || DEMO_SYNC_KEY;
  } catch {
    return DEMO_SYNC_KEY;
  }
}

function syncKeyHint(syncKey) {
  if (!syncKey) return 'Not set';
  return `Length ${syncKey.length}`;
}

async function sha256HexFromDataUrl(dataUrl) {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx < 0) throw new Error('Invalid data URL.');
  const base64Data = dataUrl.slice(commaIdx + 1);
  const raw = atob(base64Data);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    bytes[i] = raw.charCodeAt(i);
  }

  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const digestBytes = new Uint8Array(digest);
  return Array.from(digestBytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Failed to read blob.'));
    reader.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(dataUrl) {
  const response = await fetch(dataUrl);
  return response.blob();
}

function buildHeaders(syncKey, headers = {}) {
  const out = { ...headers };
  if (syncKey) out['x-sync-key'] = syncKey;
  return out;
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function gzipToBase64(text) {
  if (typeof CompressionStream === 'undefined') return '';
  const stream = new CompressionStream('gzip');
  const writer = stream.writable.getWriter();
  await writer.write(new TextEncoder().encode(text));
  await writer.close();
  const compressed = await new Response(stream.readable).arrayBuffer();
  return bytesToBase64(new Uint8Array(compressed));
}

async function apiJson(path, options = {}, syncKey = '') {
  const requestHeaders = buildHeaders(syncKey, options.headers || {});
  const requestOptions = {
    credentials: 'same-origin',
    ...options,
    headers: requestHeaders,
  };
  if (options.body && !requestHeaders['content-type']) {
    requestOptions.headers = {
      ...requestOptions.headers,
      'content-type': 'application/json',
    };
  }

  const response = await fetch(path, requestOptions);

  let data = null;
  try {
    data = await response.json();
  } catch {
    // Ignore JSON parse errors; handled below.
  }

  if (!response.ok || (data && data.ok === false)) {
    const fallback = `Request failed (${response.status})`;
    const message = data && typeof data.error === 'string' ? data.error : fallback;
    throw new Error(message);
  }

  return data || {};
}

function renderCloudMeta($, meta) {
  const updatedLabel = meta && meta.updatedAt
    ? new Date(meta.updatedAt).toLocaleString()
    : 'Never';
  const versionLabel = meta && Number.isInteger(meta.version)
    ? String(meta.version)
    : 'None';

  const snapshotUpdatedEl = $('cloud-snapshot-updated');
  const snapshotVersionEl = $('cloud-snapshot-version');
  if (snapshotUpdatedEl) snapshotUpdatedEl.textContent = updatedLabel;
  if (snapshotVersionEl) snapshotVersionEl.textContent = versionLabel;
}

function getLocalSyncLabel(storage, key, formatDateTime, getSyncMetaIso) {
  const iso = getSyncMetaIso(storage, key);
  return formatDateTime(iso) || 'Never';
}

function setCloudMessage($, message, isError = false) {
  const el = $('cloud-sync-message');
  if (!el) return;
  el.textContent = message || '';
  el.style.color = isError ? 'var(--danger)' : 'var(--text-dim)';
}

function updateLocalCloudLabels($, localStorage, syncMetaKeys, formatDateTime, getSyncMetaIso) {
  const pullEl = $('sync-last-cloud-pull');
  const pushEl = $('sync-last-cloud-push');
  if (pullEl) {
    pullEl.textContent = getLocalSyncLabel(localStorage, syncMetaKeys.lastCloudPullAt, formatDateTime, getSyncMetaIso);
  }
  if (pushEl) {
    pushEl.textContent = getLocalSyncLabel(localStorage, syncMetaKeys.lastCloudPushAt, formatDateTime, getSyncMetaIso);
  }
}

async function buildSnapshotPayload(exportData) {
  const photosByHash = new Map();
  const items = [];

  for (const item of exportData.items || []) {
    const next = { ...item };
    const currentHash = typeof next.photoHash === 'string' ? next.photoHash.trim().toLowerCase() : '';
    const inlinePhotos = [...new Set([
      ...(isPhotoDataUrl(next.photo) ? [next.photo] : []),
      ...(Array.isArray(next.photos) ? next.photos.filter((photo) => isPhotoDataUrl(photo)) : []),
    ])];
    const primaryPhoto = inlinePhotos[0] || null;

    if (isPhotoDataUrl(primaryPhoto)) {
      const hash = await sha256HexFromDataUrl(primaryPhoto);
      photosByHash.set(hash, {
        hash,
        dataUrl: primaryPhoto,
        mimeType: parseDataUrlMimeType(primaryPhoto),
      });
      next.photoHash = hash;
      next.photoMimeType = parseDataUrlMimeType(primaryPhoto);
    } else if (currentHash) {
      next.photoHash = currentHash;
    }

    delete next.photo;
    delete next.photos;
    items.push(next);
  }

  return {
    snapshot: {
      version: 1,
      bins: exportData.bins || [],
      items,
      exportedAt: new Date().toISOString(),
    },
    photos: [...photosByHash.values()],
  };
}

function getItemPhotoDataUrls(item) {
  return [...new Set([
    ...(isPhotoDataUrl(item?.photo) ? [item.photo] : []),
    ...(Array.isArray(item?.photos) ? item.photos.filter((photo) => isPhotoDataUrl(photo)) : []),
  ])];
}

function areStringArraysEqual(left, right) {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

async function normalizeLegacyPhotosForCloud(db, compressPhoto, options = {}) {
  const {
    maxBytes = LEGACY_PHOTO_MAX_BYTES,
    onProgress = () => {},
  } = options;

  if (!db || typeof db.getAllItemsWithPhotos !== 'function' || typeof db.putItem !== 'function') {
    return 0;
  }
  if (typeof compressPhoto !== 'function') return 0;

  const items = await db.getAllItemsWithPhotos();
  let updatedItems = 0;

  for (const item of items) {
    const existingPhotos = getItemPhotoDataUrls(item);
    if (existingPhotos.length === 0) continue;

    let changed = false;
    const nextPhotos = [];
    for (let i = 0; i < existingPhotos.length; i += 1) {
      const photo = existingPhotos[i];
      if (estimateDataUrlBytes(photo) > maxBytes) {
        onProgress(updatedItems + 1, item);
        nextPhotos.push(await compressPhoto(photo));
        changed = true;
      } else {
        nextPhotos.push(photo);
      }
    }

    const dedupedPhotos = [...new Set(nextPhotos.filter((photo) => isPhotoDataUrl(photo)))];
    if (!changed || areStringArraysEqual(existingPhotos, dedupedPhotos)) continue;

    const nextItem = {
      ...item,
      photo: dedupedPhotos[0] || null,
      photos: dedupedPhotos.length > 0 ? dedupedPhotos : undefined,
      photoId: undefined,
      photoIds: undefined,
      photoHash: undefined,
      photoMimeType: undefined,
    };
    await db.putItem(nextItem);
    updatedItems += 1;
  }

  return updatedItems;
}

async function fetchPhotoDataUrlsByHash(hashes, syncKey) {
  const uniqueHashes = [...new Set(hashes.filter(Boolean))];
  const map = new Map();

  for (const hash of uniqueHashes) {
    const response = await fetch(`/api/sync/photo?hash=${encodeURIComponent(hash)}`, {
      credentials: 'same-origin',
      headers: buildHeaders(syncKey),
    });
    if (!response.ok) continue;
    const blob = await response.blob();
    const dataUrl = await blobToDataUrl(blob);
    map.set(hash, dataUrl);
  }

  return map;
}

function createCloudSyncManager(options) {
  const {
    db,
    $, showToast, confirmAction,
    refreshStats, refreshSearch,
    showView,
    refreshSyncStatus,
    localStorage,
    syncMetaKeys,
    setSyncMetaIso,
    getSyncMetaIso,
    formatDateTime,
    prepareImportData,
    compressImage,
  } = options;

  let syncKey = '';
  let cloudMeta = null;
  let busy = false;
  let autoSyncDone = false;

  function updateUiState() {
    const statusEl = $('cloud-auth-status');
    const detailsEl = $('cloud-user-details');
    const inputEl = $('cloud-sync-key');
    const connectBtn = $('cloud-connect-key');
    const clearBtn = $('cloud-clear-key');
    const pushBtn = $('cloud-push');
    const pullBtn = $('cloud-pull');

    const connected = Boolean(syncKey);
    if (statusEl) statusEl.textContent = connected ? 'Connected' : 'Not connected';
    if (detailsEl) detailsEl.textContent = connected
      ? `Sync key loaded (${syncKeyHint(syncKey)}).`
      : 'Enter a sync key (8+ chars) used on all devices.';

    if (inputEl) inputEl.value = connected ? syncKey : '';
    if (connectBtn) connectBtn.disabled = busy;
    if (clearBtn) clearBtn.disabled = busy || !connected;
    if (pushBtn) pushBtn.disabled = busy || !connected;
    if (pullBtn) pullBtn.disabled = busy || !connected;
  }

  async function loadStoredKey() {
    const stored = normalizeSyncKey(localStorage.getItem(SYNC_KEY_STORAGE) || '');
    if (stored) {
      syncKey = stored;
      return;
    }

    localStorage.removeItem(SYNC_KEY_STORAGE);
    const defaultKey = await fetchDefaultSyncKey();
    syncKey = normalizeSyncKey(defaultKey) || DEMO_SYNC_KEY;
    localStorage.setItem(SYNC_KEY_STORAGE, syncKey);
  }

  function saveKey(value) {
    const normalized = normalizeSyncKey(value);
    if (!normalized) return false;
    syncKey = normalized;
    localStorage.setItem(SYNC_KEY_STORAGE, normalized);
    return true;
  }

  function clearKey() {
    syncKey = '';
    localStorage.removeItem(SYNC_KEY_STORAGE);
    cloudMeta = null;
    renderCloudMeta($, cloudMeta);
  }

  async function refreshCloudMeta() {
    if (!syncKey) {
      cloudMeta = null;
      renderCloudMeta($, cloudMeta);
      return;
    }

    const result = await apiJson('/api/sync/meta', { method: 'GET' }, syncKey);
    cloudMeta = result.meta || null;
    renderCloudMeta($, cloudMeta);
  }

  async function connectWithInput() {
    const inputEl = $('cloud-sync-key');
    const raw = inputEl ? inputEl.value : '';
    if (!saveKey(raw)) {
      setCloudMessage($, 'Sync key must be 8-256 characters.', true);
      updateUiState();
      return;
    }

    busy = true;
    updateUiState();
    setCloudMessage($, 'Connecting...');
    try {
      await refreshCloudMeta();
      setCloudMessage($, 'Sync key connected.');
      showToast('Cloud sync key connected', 'success');
    } catch (error) {
      clearKey();
      setCloudMessage($, error.message || 'Failed to connect sync key.', true);
      showToast(`Cloud sync key failed: ${error.message}`, 'error');
    } finally {
      busy = false;
      updateUiState();
    }
  }

  async function pushToCloud() {
    if (!syncKey) {
      showToast('Enter a sync key before pushing', 'error');
      return;
    }

    busy = true;
    updateUiState();
    setCloudMessage($, 'Preparing snapshot...');

    try {
      const normalizedCount = await normalizeLegacyPhotosForCloud(db, compressImage, {
        onProgress: (count) => {
          setCloudMessage($, `Optimizing cached photo ${count} for cloud sync...`);
        },
      });
      if (normalizedCount > 0) {
        await refreshStats();
      }

      const exportData = await db.exportAll();
      const payload = await buildSnapshotPayload(exportData);

      const hashes = payload.photos.map((p) => p.hash);
      if (hashes.length > 0) {
        setCloudMessage($, `Checking ${hashes.length} photo hash(es)...`);
        const missingResult = await apiJson('/api/sync/photos-missing', {
          method: 'POST',
          body: JSON.stringify({ hashes }),
        }, syncKey);

        const missingSet = new Set(missingResult.missing || []);
        const missingPhotos = payload.photos.filter((p) => missingSet.has(p.hash));
        for (let i = 0; i < missingPhotos.length; i += 1) {
          const photo = missingPhotos[i];
          setCloudMessage($, `Uploading photo ${i + 1}/${missingPhotos.length}...`);
          const blob = await dataUrlToBlob(photo.dataUrl);
          await apiJson(`/api/sync/photo-upload?hash=${encodeURIComponent(photo.hash)}`, {
            method: 'POST',
            headers: {
              'content-type': blob.type || photo.mimeType || 'application/octet-stream',
            },
            body: blob,
          }, syncKey);
        }
      }

      const snapshotBytes = JSON.stringify(payload.snapshot).length;
      if (snapshotBytes > 2 * 1024 * 1024) {
        const proceed = await confirmAction({
          title: 'Large Snapshot',
          message: `Snapshot is ${Math.round(snapshotBytes / 1024)} KB before transfer. Continue push?`,
          confirmLabel: 'Push',
          danger: false,
        });
        if (!proceed) {
          setCloudMessage($, 'Push canceled.');
          return;
        }
      }

      setCloudMessage($, 'Uploading snapshot...');
      const snapshotJson = JSON.stringify(payload.snapshot);
      const snapshotGzipBase64 = await gzipToBase64(snapshotJson);
      const result = await apiJson('/api/sync/push', {
        method: 'POST',
        body: JSON.stringify(snapshotGzipBase64
          ? { snapshotGzipBase64 }
          : { snapshot: payload.snapshot }),
      }, syncKey);

      setSyncMetaIso(localStorage, syncMetaKeys.lastCloudPushAt, new Date().toISOString());
      refreshSyncStatus();
      cloudMeta = result.meta || cloudMeta;
      renderCloudMeta($, cloudMeta);
      updateLocalCloudLabels($, localStorage, syncMetaKeys, formatDateTime, getSyncMetaIso);
      setCloudMessage($, 'Push complete.');
      const optimizedLabel = normalizedCount > 0
        ? `; optimized ${normalizedCount} cached item photo${normalizedCount === 1 ? '' : 's'}`
        : '';
      showToast(`Cloud push complete (${payload.snapshot.bins.length} bins, ${payload.snapshot.items.length} items${optimizedLabel})`, 'success');
    } catch (error) {
      setCloudMessage($, error.message || 'Push failed.', true);
      showToast(`Cloud push failed: ${error.message}`, 'error');
    } finally {
      busy = false;
      updateUiState();
    }
  }

  async function pullFromCloud(options = {}) {
    const { skipConfirm = false } = options;
    if (!syncKey) {
      showToast('Enter a sync key before pulling', 'error');
      return;
    }

    if (!skipConfirm) {
      const confirmed = await confirmAction({
        title: 'Pull From Cloud',
        message: 'Replace all local data with your cloud snapshot?',
        confirmLabel: 'Pull',
      });
      if (!confirmed) return;
    }

    busy = true;
    updateUiState();
    setCloudMessage($, 'Downloading snapshot...');

    try {
      const pulled = await apiJson('/api/sync/pull', { method: 'GET' }, syncKey);
      if (!pulled.hasSnapshot || !pulled.snapshot) {
        setCloudMessage($, 'No cloud snapshot found for this sync key.');
        showToast('No cloud snapshot found', 'error');
        return;
      }

      const snapshot = pulled.snapshot;
      const photoHashes = [...new Set(
        (snapshot.items || [])
          .map((item) => (typeof item.photoHash === 'string' ? item.photoHash.trim().toLowerCase() : ''))
          .filter(Boolean)
      )];

      setCloudMessage($, `Downloading ${photoHashes.length} photo(s)...`);
      const photoMap = await fetchPhotoDataUrlsByHash(photoHashes, syncKey);

      const hydratedItems = (snapshot.items || []).map((item) => {
        const next = { ...item };
        if (next.photoHash && photoMap.has(next.photoHash)) {
          next.photo = photoMap.get(next.photoHash);
        }
        return next;
      });

      const importPayload = {
        version: 1,
        bins: snapshot.bins || [],
        items: hydratedItems,
        exportedAt: typeof snapshot.exportedAt === 'string'
          ? snapshot.exportedAt
          : new Date().toISOString(),
      };

      const prepared = prepareImportData(importPayload);
      if (!prepared.ok) {
        throw new Error((prepared.errors || ['Invalid cloud snapshot']).slice(0, 1).join(' '));
      }

      await db.importAll(prepared.data, 'replace');
      const nowIso = new Date().toISOString();
      setSyncMetaIso(localStorage, syncMetaKeys.lastImportAt, nowIso);
      setSyncMetaIso(localStorage, syncMetaKeys.lastImportedFileExportedAt, prepared.data.exportedAt);
      setSyncMetaIso(localStorage, syncMetaKeys.lastCloudPullAt, nowIso);
      refreshSyncStatus();
      updateLocalCloudLabels($, localStorage, syncMetaKeys, formatDateTime, getSyncMetaIso);

      await refreshStats();
      showView('search');
      await refreshSearch();

      cloudMeta = pulled.meta || cloudMeta;
      renderCloudMeta($, cloudMeta);
      setCloudMessage($, 'Pull complete.');
      showToast(`Pulled ${prepared.data.bins.length} bins and ${prepared.data.items.length} items`, 'success');
    } catch (error) {
      setCloudMessage($, error.message || 'Pull failed.', true);
      showToast(`Cloud pull failed: ${error.message}`, 'error');
    } finally {
      busy = false;
      updateUiState();
    }
  }

  async function refresh() {
    await loadStoredKey();
    updateUiState();
    updateLocalCloudLabels($, localStorage, syncMetaKeys, formatDateTime, getSyncMetaIso);

    if (!syncKey) {
      renderCloudMeta($, null);
      return;
    }

    try {
      await refreshCloudMeta();
      if (syncKey === DEMO_SYNC_KEY && !autoSyncDone) {
        autoSyncDone = true;
        await pullFromCloud({ skipConfirm: true });
      }
    } catch (error) {
      setCloudMessage($, error.message || 'Cloud sync unavailable.', true);
    }
  }

  async function init() {
    const connectBtn = $('cloud-connect-key');
    const clearBtn = $('cloud-clear-key');
    const pullBtn = $('cloud-pull');
    const pushBtn = $('cloud-push');

    if (connectBtn) connectBtn.addEventListener('click', () => connectWithInput());
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        clearKey();
        updateUiState();
        setCloudMessage($, 'Sync key cleared.');
      });
    }
    if (pullBtn) pullBtn.addEventListener('click', () => pullFromCloud());
    if (pushBtn) pushBtn.addEventListener('click', () => pushToCloud());

    await refresh();
  }

  return {
    init,
    refresh,
  };
}

export { buildSnapshotPayload, createCloudSyncManager, estimateDataUrlBytes, normalizeLegacyPhotosForCloud };
