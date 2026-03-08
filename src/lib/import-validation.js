function validateImportData(data) {
  if (!data || typeof data !== 'object') return false;
  if (!data.bins && !data.items) return false;
  if (data.bins && !Array.isArray(data.bins)) return false;
  if (data.items && !Array.isArray(data.items)) return false;

  if (data.bins) {
    for (const bin of data.bins) {
      if (!bin.id || typeof bin.id !== 'string') return false;
    }
  }

  if (data.items) {
    for (const item of data.items) {
      if (!item.id || typeof item.id !== 'string') return false;
      if (!item.binId || typeof item.binId !== 'string') return false;
    }
  }

  return true;
}

export { validateImportData };
