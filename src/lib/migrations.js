function migrateImportData(rawData) {
  const data = rawData && typeof rawData === 'object' ? rawData : null;
  if (!data) {
    return { ok: false, errors: ['Import payload must be a JSON object.'] };
  }

  if (!('bins' in data) && !('items' in data)) {
    return { ok: false, errors: ['Import payload must include bins and/or items arrays.'] };
  }

  if ('bins' in data && !Array.isArray(data.bins)) {
    return { ok: false, errors: ['Import payload bins must be an array.'] };
  }

  if ('items' in data && !Array.isArray(data.items)) {
    return { ok: false, errors: ['Import payload items must be an array.'] };
  }

  const rawVersion = data.version;
  const version = Number.isInteger(rawVersion) ? rawVersion : 1;
  if (version !== 1) {
    return { ok: false, errors: [`Unsupported import version: ${rawVersion}.`] };
  }

  const migrated = {
    version: 1,
    bins: Array.isArray(data.bins) ? data.bins : [],
    items: Array.isArray(data.items) ? data.items : [],
    exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : null,
  };

  const warnings = [];
  if (!('bins' in data)) warnings.push('Missing bins array; defaulted to empty.');
  if (!('items' in data)) warnings.push('Missing items array; defaulted to empty.');
  if (!Number.isInteger(rawVersion)) warnings.push('Missing version; treated as version 1.');

  return { ok: true, data: migrated, warnings };
}

export { migrateImportData };
