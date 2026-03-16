function parseIsoMs(value) {
  if (typeof value !== 'string') return NaN;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : NaN;
}

function getBinLastModifiedMs(bin) {
  if (!bin || typeof bin !== 'object') return NaN;
  const modifiedMs = parseIsoMs(bin.lastModifiedAt);
  if (Number.isFinite(modifiedMs)) return modifiedMs;
  return parseIsoMs(bin.createdAt);
}

function isBinLabelOutdated(bin) {
  const lastModifiedMs = getBinLastModifiedMs(bin);
  if (!Number.isFinite(lastModifiedMs)) return false;

  const printedMs = parseIsoMs(bin && bin.labelPrintedAt);
  if (!Number.isFinite(printedMs)) return true;

  return printedMs < lastModifiedMs;
}

export { getBinLastModifiedMs, isBinLabelOutdated };
