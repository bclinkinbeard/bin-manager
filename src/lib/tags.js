function normalizeTagList(tags) {
  if (!Array.isArray(tags)) return [];
  return [...new Set(
    tags
      .map((tag) => String(tag || '').trim().toLowerCase())
      .filter(Boolean)
  )];
}

function parseTags(rawValue) {
  if (!rawValue) return [];
  return normalizeTagList(String(rawValue).split(','));
}

function mergeTags(existingTags, tagsToAdd) {
  return normalizeTagList([
    ...normalizeTagList(existingTags),
    ...normalizeTagList(tagsToAdd),
  ]);
}

function removeTags(existingTags, tagsToRemove) {
  const removed = new Set(normalizeTagList(tagsToRemove));
  return normalizeTagList(existingTags).filter((tag) => !removed.has(tag));
}

export { normalizeTagList, parseTags, mergeTags, removeTags };
