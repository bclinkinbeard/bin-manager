function buildRouteFromState(state) {
  const params = new URLSearchParams();
  const activeViewName = state.activeViewName || 'search';

  if (activeViewName === 'search') {
    const q = String(state.searchQuery || '').trim();
    if (q) params.set('q', q);
    if (state.showArchived) params.set('archived', '1');
    const query = params.toString();
    return query ? `search?${query}` : 'search';
  }

  if (activeViewName === 'scan') return 'scan';
  if (activeViewName === 'bins') return 'bins';
  if (activeViewName === 'data') return 'data';

  if (activeViewName === 'bin') {
    return state.currentBinId ? `bin/${encodeURIComponent(state.currentBinId)}` : 'search';
  }

  if (activeViewName === 'tag') {
    if (!state.currentTag) return 'search';
    if (state.currentTagOriginBinId) params.set('origin', state.currentTagOriginBinId);
    const query = params.toString();
    return query
      ? `tag/${encodeURIComponent(state.currentTag)}?${query}`
      : `tag/${encodeURIComponent(state.currentTag)}`;
  }

  if (activeViewName === 'binForm') {
    const id = String(state.binFormId || '').trim();
    if (!id) return 'search';
    if (state.editingBin) params.set('edit', '1');
    const query = params.toString();
    return query
      ? `bin-form/${encodeURIComponent(id)}?${query}`
      : `bin-form/${encodeURIComponent(id)}`;
  }

  if (activeViewName === 'itemForm') {
    if (state.currentEditItemId) return `item-form/edit/${encodeURIComponent(state.currentEditItemId)}`;
    const binId = state.itemFormBinId || state.currentBinId;
    if (binId) params.set('bin', binId);
    const query = params.toString();
    return query ? `item-form?${query}` : 'item-form';
  }

  if (activeViewName === 'multiCrop') {
    if (state.currentBinId) params.set('bin', state.currentBinId);
    const query = params.toString();
    return query ? `multi-crop?${query}` : 'multi-crop';
  }

  return 'search';
}

function parseRouteFromHash(hashValue) {
  const raw = String(hashValue || '').replace(/^#/, '');
  if (!raw) return { view: 'search', q: '', archived: false };

  const [pathPart, queryPart = ''] = raw.split('?');
  const path = pathPart.replace(/^\/+/, '');
  const parts = path.split('/').filter(Boolean).map((part) => decodeURIComponent(part));
  const params = new URLSearchParams(queryPart);

  if (parts.length === 0 || parts[0] === 'search') {
    return {
      view: 'search',
      q: params.get('q') || '',
      archived: params.get('archived') === '1',
    };
  }

  if (parts[0] === 'scan') return { view: 'scan' };
  if (parts[0] === 'bins') return { view: 'bins' };
  if (parts[0] === 'data') return { view: 'data' };
  if (parts[0] === 'bin') return { view: 'bin', binId: parts[1] || '' };
  if (parts[0] === 'tag') return { view: 'tag', tag: parts[1] || '', originBinId: params.get('origin') || null };
  if (parts[0] === 'bin-form') return { view: 'binForm', binId: parts[1] || '', edit: params.get('edit') === '1' };

  if (parts[0] === 'item-form') {
    if (parts[1] === 'edit' && parts[2]) {
      return { view: 'itemForm', itemId: parts[2] };
    }
    return { view: 'itemForm', binId: params.get('bin') || '' };
  }

  if (parts[0] === 'multi-crop') {
    return { view: 'multiCrop', binId: params.get('bin') || '' };
  }

  return { view: 'search', q: '', archived: false };
}

export { buildRouteFromState, parseRouteFromHash };
