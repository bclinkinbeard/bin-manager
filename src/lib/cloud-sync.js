function isPhotoDataUrl(value) {
  return typeof value === 'string' && value.startsWith('data:image/');
}

function parseDataUrlMimeType(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;]+);base64,/i);
  return match ? match[1] : 'application/octet-stream';
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

async function apiJson(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });

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

function setButtonsDisabled($, disabled) {
  const ids = ['cloud-pull', 'cloud-push', 'cloud-signout'];
  for (const id of ids) {
    const el = $(id);
    if (el) el.disabled = disabled;
  }
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

    if (isPhotoDataUrl(next.photo)) {
      const hash = await sha256HexFromDataUrl(next.photo);
      photosByHash.set(hash, {
        hash,
        dataUrl: next.photo,
        mimeType: parseDataUrlMimeType(next.photo),
      });
      next.photoHash = hash;
      next.photoMimeType = parseDataUrlMimeType(next.photo);
    } else if (currentHash) {
      next.photoHash = currentHash;
    }

    delete next.photo;
    items.push(next);
  }

  const snapshot = {
    version: 1,
    bins: exportData.bins || [],
    items,
    exportedAt: new Date().toISOString(),
  };

  return {
    snapshot,
    photos: [...photosByHash.values()],
  };
}

async function fetchPhotoDataUrlsByHash(hashes) {
  const uniqueHashes = [...new Set(hashes.filter(Boolean))];
  const map = new Map();

  for (const hash of uniqueHashes) {
    const response = await fetch(`/api/sync/photo?hash=${encodeURIComponent(hash)}`, {
      credentials: 'same-origin',
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
  } = options;

  let user = null;
  let googleClientId = '';
  let cloudMeta = null;
  let googleInitAttempted = false;

  async function refreshSession() {
    const me = await apiJson('/api/auth/me', { method: 'GET' });
    user = me.user || null;
    const statusEl = $('cloud-auth-status');
    const detailsEl = $('cloud-user-details');
    const googleBtnWrap = $('cloud-google-button');
    const signOutBtn = $('cloud-signout');

    if (statusEl) statusEl.textContent = user ? 'Signed in' : 'Signed out';
    if (detailsEl) {
      detailsEl.textContent = user ? `${user.email}${user.name ? ` (${user.name})` : ''}` : 'Use Google to sign in.';
    }
    if (googleBtnWrap) googleBtnWrap.style.display = user ? 'none' : 'block';
    if (signOutBtn) signOutBtn.style.display = user ? 'inline-block' : 'none';

    const pushBtn = $('cloud-push');
    const pullBtn = $('cloud-pull');
    if (pushBtn) pushBtn.disabled = !user;
    if (pullBtn) pullBtn.disabled = !user;
  }

  async function refreshCloudMeta() {
    if (!user) {
      cloudMeta = null;
      renderCloudMeta($, cloudMeta);
      return;
    }

    const result = await apiJson('/api/sync/meta', { method: 'GET' });
    cloudMeta = result.meta || null;
    renderCloudMeta($, cloudMeta);
  }

  async function handleGoogleCredential(credentialResponse) {
    try {
      setCloudMessage($, 'Signing in...');
      await apiJson('/api/auth/google', {
        method: 'POST',
        body: JSON.stringify({ credential: credentialResponse.credential }),
      });
      await refreshSession();
      await refreshCloudMeta();
      setCloudMessage($, 'Signed in.');
      showToast('Signed in to cloud sync', 'success');
    } catch (error) {
      setCloudMessage($, error.message || 'Sign-in failed.', true);
      showToast(`Cloud sign-in failed: ${error.message}`, 'error');
    }
  }

  async function initGoogleButton() {
    if (googleInitAttempted) return;
    googleInitAttempted = true;
    try {
      const cfg = await apiJson('/api/auth/config', { method: 'GET' });
      googleClientId = cfg.googleClientId || '';
      if (!googleClientId) {
        setCloudMessage($, 'Google sign-in is not configured on the server.');
        return;
      }

      if (!window.google || !window.google.accounts || !window.google.accounts.id) {
        setCloudMessage($, 'Google sign-in library failed to load.', true);
        return;
      }

      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: handleGoogleCredential,
      });

      const buttonEl = $('cloud-google-button');
      if (!buttonEl) return;
      buttonEl.innerHTML = '';
      window.google.accounts.id.renderButton(buttonEl, {
        theme: 'outline',
        size: 'large',
        text: 'signin_with',
        shape: 'rectangular',
        width: 240,
      });
    } catch (error) {
      setCloudMessage($, error.message || 'Cloud auth config unavailable.', true);
    }
  }

  async function signOut() {
    await apiJson('/api/auth/logout', { method: 'POST', body: '{}' });
    await refreshSession();
    await refreshCloudMeta();
    setCloudMessage($, 'Signed out.');
    showToast('Signed out of cloud sync', 'success');
  }

  async function pushToCloud() {
    if (!user) {
      showToast('Sign in before pushing to cloud', 'error');
      return;
    }

    setButtonsDisabled($, true);
    setCloudMessage($, 'Preparing snapshot...');

    try {
      const exportData = await db.exportAll();
      const payload = await buildSnapshotPayload(exportData);

      const hashes = payload.photos.map((p) => p.hash);
      if (hashes.length > 0) {
        setCloudMessage($, `Checking ${hashes.length} photo hash(es)...`);
        const missingResult = await apiJson('/api/sync/photos-missing', {
          method: 'POST',
          body: JSON.stringify({ hashes }),
        });

        const missingSet = new Set(missingResult.missing || []);
        const missingPhotos = payload.photos.filter((p) => missingSet.has(p.hash));
        for (let i = 0; i < missingPhotos.length; i += 1) {
          const photo = missingPhotos[i];
          setCloudMessage($, `Uploading photo ${i + 1}/${missingPhotos.length}...`);
          await apiJson('/api/sync/photo-upload', {
            method: 'POST',
            body: JSON.stringify(photo),
          });
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
      const result = await apiJson('/api/sync/push', {
        method: 'POST',
        body: JSON.stringify({ snapshot: payload.snapshot }),
      });

      setSyncMetaIso(localStorage, syncMetaKeys.lastCloudPushAt, new Date().toISOString());
      refreshSyncStatus();
      cloudMeta = result.meta || cloudMeta;
      renderCloudMeta($, cloudMeta);
      updateLocalCloudLabels($, localStorage, syncMetaKeys, formatDateTime, getSyncMetaIso);
      setCloudMessage($, 'Push complete.');
      showToast(`Cloud push complete (${payload.snapshot.bins.length} bins, ${payload.snapshot.items.length} items)`, 'success');
    } catch (error) {
      setCloudMessage($, error.message || 'Push failed.', true);
      showToast(`Cloud push failed: ${error.message}`, 'error');
    } finally {
      setButtonsDisabled($, false);
      const signOutBtn = $('cloud-signout');
      if (signOutBtn) signOutBtn.disabled = false;
    }
  }

  async function pullFromCloud() {
    if (!user) {
      showToast('Sign in before pulling from cloud', 'error');
      return;
    }

    const confirmed = await confirmAction({
      title: 'Pull From Cloud',
      message: 'Replace all local data with your cloud snapshot?',
      confirmLabel: 'Pull',
    });
    if (!confirmed) return;

    setButtonsDisabled($, true);
    setCloudMessage($, 'Downloading snapshot...');

    try {
      const pulled = await apiJson('/api/sync/pull', { method: 'GET' });
      if (!pulled.hasSnapshot || !pulled.snapshot) {
        setCloudMessage($, 'No cloud snapshot found for this account.');
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
      const photoMap = await fetchPhotoDataUrlsByHash(photoHashes);

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
      setButtonsDisabled($, false);
      const signOutBtn = $('cloud-signout');
      if (signOutBtn) signOutBtn.disabled = false;
    }
  }

  async function refresh() {
    try {
      await refreshSession();
      await refreshCloudMeta();
      updateLocalCloudLabels($, localStorage, syncMetaKeys, formatDateTime, getSyncMetaIso);
    } catch (error) {
      setCloudMessage($, error.message || 'Cloud sync unavailable.', true);
    }
  }

  async function init() {
    const signOutBtn = $('cloud-signout');
    const pullBtn = $('cloud-pull');
    const pushBtn = $('cloud-push');

    if (signOutBtn) {
      signOutBtn.addEventListener('click', async () => {
        try {
          await signOut();
        } catch (error) {
          setCloudMessage($, error.message || 'Sign-out failed.', true);
          showToast(`Sign-out failed: ${error.message}`, 'error');
        }
      });
    }

    if (pullBtn) {
      pullBtn.addEventListener('click', () => pullFromCloud());
    }

    if (pushBtn) {
      pushBtn.addEventListener('click', () => pushToCloud());
    }

    await refresh();
    await initGoogleButton();
  }

  return {
    init,
    refresh,
  };
}

export { createCloudSyncManager };
