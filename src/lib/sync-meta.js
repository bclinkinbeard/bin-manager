function parseValidIso(iso) {
  if (!iso || typeof iso !== 'string') return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

function getSyncMetaIso(storage, key) {
  return parseValidIso(storage.getItem(key));
}

function setSyncMetaIso(storage, key, iso) {
  const safeIso = parseValidIso(iso);
  if (!safeIso) return;
  storage.setItem(key, safeIso);
}

function formatDateTime(iso) {
  const safeIso = parseValidIso(iso);
  if (!safeIso) return null;
  const d = new Date(safeIso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getLatestLocalSyncMs(storage, syncMetaKeys) {
  const lastExport = getSyncMetaIso(storage, syncMetaKeys.lastExportAt);
  const lastImport = getSyncMetaIso(storage, syncMetaKeys.lastImportAt);
  const exportMs = lastExport ? Date.parse(lastExport) : 0;
  const importMs = lastImport ? Date.parse(lastImport) : 0;
  return Math.max(exportMs, importMs);
}

export { parseValidIso, getSyncMetaIso, setSyncMetaIso, formatDateTime, getLatestLocalSyncMs };
