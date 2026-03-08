import { migrateImportData } from './migrations.js';

function isValidString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeIso(value, fallbackIso) {
  if (typeof value !== 'string') return fallbackIso;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? fallbackIso : new Date(ms).toISOString();
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  return [...new Set(
    tags
      .map((tag) => String(tag || '').trim().toLowerCase())
      .filter(Boolean)
  )];
}

function normalizeBin(bin, nowIso) {
  return {
    id: String(bin.id).trim(),
    name: typeof bin.name === 'string' ? bin.name.trim() : '',
    location: typeof bin.location === 'string' ? bin.location.trim() : '',
    description: typeof bin.description === 'string' ? bin.description.trim() : '',
    createdAt: normalizeIso(bin.createdAt, nowIso),
    archived: Boolean(bin.archived),
  };
}

function normalizeItem(item, nowIso) {
  const normalized = {
    id: String(item.id).trim(),
    binId: String(item.binId).trim(),
    description: typeof item.description === 'string' ? item.description.trim() : '',
    tags: normalizeTags(item.tags),
    addedAt: normalizeIso(item.addedAt, nowIso),
  };

  if (typeof item.photo === 'string' && item.photo) {
    normalized.photo = item.photo;
  } else if (item.photo === null) {
    normalized.photo = null;
  }

  if (typeof item.photoId === 'string' && item.photoId.trim()) {
    normalized.photoId = item.photoId.trim();
  }

  return normalized;
}

function prepareImportData(rawData) {
  const migration = migrateImportData(rawData);
  if (!migration.ok) {
    return { ok: false, errors: migration.errors, warnings: [] };
  }

  const nowIso = new Date().toISOString();
  const warnings = [...migration.warnings];
  const errors = [];

  const normalizedBins = [];
  const normalizedItems = [];
  const binIds = new Set();
  const itemIds = new Set();

  for (const rawBin of migration.data.bins) {
    if (!rawBin || typeof rawBin !== 'object' || !isValidString(rawBin.id)) {
      errors.push('Each bin must be an object with a non-empty string id.');
      continue;
    }

    const normalized = normalizeBin(rawBin, nowIso);
    if (binIds.has(normalized.id)) {
      errors.push(`Duplicate bin id detected: ${normalized.id}`);
      continue;
    }
    binIds.add(normalized.id);
    normalizedBins.push(normalized);
  }

  for (const rawItem of migration.data.items) {
    if (!rawItem || typeof rawItem !== 'object') {
      errors.push('Each item must be an object.');
      continue;
    }
    if (!isValidString(rawItem.id)) {
      errors.push('Each item must have a non-empty string id.');
      continue;
    }
    if (!isValidString(rawItem.binId)) {
      errors.push(`Item ${String(rawItem.id || '(missing id)')} is missing a valid binId.`);
      continue;
    }

    const normalized = normalizeItem(rawItem, nowIso);
    if (itemIds.has(normalized.id)) {
      errors.push(`Duplicate item id detected: ${normalized.id}`);
      continue;
    }
    itemIds.add(normalized.id);
    normalizedItems.push(normalized);
  }

  const missingBinIds = [...new Set(
    normalizedItems
      .map((item) => item.binId)
      .filter((binId) => !binIds.has(binId))
  )];
  if (missingBinIds.length > 0) {
    for (const missingBinId of missingBinIds) {
      binIds.add(missingBinId);
      normalizedBins.push({
        id: missingBinId,
        name: `Recovered ${missingBinId}`,
        location: '',
        description: 'Auto-created during import to preserve item references.',
        createdAt: nowIso,
        archived: false,
      });
    }
    warnings.push(`Created ${missingBinIds.length} placeholder bin(s) for orphaned items.`);
  }

  if (errors.length > 0) {
    return { ok: false, errors, warnings };
  }

  const prepared = {
    version: 1,
    bins: normalizedBins,
    items: normalizedItems,
    exportedAt: normalizeIso(migration.data.exportedAt, nowIso),
  };

  return {
    ok: true,
    data: prepared,
    warnings,
    summary: {
      version: 1,
      bins: prepared.bins.length,
      items: prepared.items.length,
      archivedBins: prepared.bins.filter((bin) => bin.archived).length,
      taggedItems: prepared.items.filter((item) => Array.isArray(item.tags) && item.tags.length > 0).length,
      hasPhotos: prepared.items.some((item) => item.photo || item.photoId),
      exportedAt: prepared.exportedAt,
    },
  };
}

function validateImportData(data) {
  return prepareImportData(data).ok;
}

export { validateImportData, prepareImportData };
