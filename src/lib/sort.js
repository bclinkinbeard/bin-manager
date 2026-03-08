function sortItems(items, sortOrder = 'newest') {
  const sorted = [...items];
  switch (sortOrder) {
    case 'oldest':
      sorted.sort((a, b) => (a.addedAt || '').localeCompare(b.addedAt || ''));
      break;
    case 'az':
      sorted.sort((a, b) => (a.description || '').localeCompare(b.description || ''));
      break;
    case 'za':
      sorted.sort((a, b) => (b.description || '').localeCompare(a.description || ''));
      break;
    case 'newest':
    default:
      sorted.sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''));
      break;
  }
  return sorted;
}

export { sortItems };
