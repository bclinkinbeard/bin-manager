function parseTags(rawValue) {
  if (!rawValue) return [];
  return [...new Set(
    String(rawValue)
      .split(',')
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean)
  )];
}

export { parseTags };
