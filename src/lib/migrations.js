function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return Object.values(value);
  return null;
}

function migrateImportData(rawData) {
  const data = rawData && typeof rawData === 'object' ? rawData : null;
  if (!data) {
    return { ok: false, errors: ['Import payload must be a JSON object.'] };
  }

  const source = (data.data && typeof data.data === 'object') ? data.data : data;
  const rawBins = ('bins' in source) ? source.bins : undefined;
  const rawItems = ('items' in source) ? source.items : undefined;

  if (rawBins === undefined && rawItems === undefined) {
    return { ok: false, errors: ['Import payload must include bins and/or items arrays.'] };
  }

  const bins = rawBins === undefined ? [] : toArray(rawBins);
  if (bins === null) {
    return { ok: false, errors: ['Import payload bins must be an array.'] };
  }

  const items = rawItems === undefined ? [] : toArray(rawItems);
  if (items === null) {
    return { ok: false, errors: ['Import payload items must be an array.'] };
  }

  const rawVersion = Number.isInteger(data.version) ? data.version : source.version;
  const version = Number.isInteger(rawVersion) ? rawVersion : 1;
  if (version !== 1) {
    return { ok: false, errors: [`Unsupported import version: ${rawVersion}.`] };
  }

  const migrated = {
    version: 1,
    bins,
    items,
    exportedAt: typeof source.exportedAt === 'string'
      ? source.exportedAt
      : (typeof data.exportedAt === 'string' ? data.exportedAt : null),
  };

  const warnings = [];
  if (source !== data) warnings.push('Detected nested data payload; flattened for import.');
  if (rawBins === undefined) warnings.push('Missing bins array; defaulted to empty.');
  if (rawItems === undefined) warnings.push('Missing items array; defaulted to empty.');
  if (rawBins !== undefined && !Array.isArray(rawBins)) warnings.push('Converted bins object map to array.');
  if (rawItems !== undefined && !Array.isArray(rawItems)) warnings.push('Converted items object map to array.');
  if (!Number.isInteger(rawVersion)) warnings.push('Missing version; treated as version 1.');

  return { ok: true, data: migrated, warnings };
}

export { migrateImportData };
