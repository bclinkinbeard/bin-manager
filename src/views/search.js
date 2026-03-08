function createSearchView({ db, views, $, esc, refreshStats, syncRouteReplace, onOpenBin, getIsApplyingRoute }) {
  let fuse = null;
  let fuseDataVersion = -1;
  let fuseEntries = null;
  let debounceTimer = null;

  async function buildFuse() {
    const currentVersion = db.getDataVersion();
    if (fuse && fuseDataVersion === currentVersion) {
      return fuseEntries;
    }

    const bins = await db.getAllBins();
    const items = await db.getAllItemsLight();
    const entries = [];
    for (const b of bins) {
      entries.push({
        type: 'bin',
        id: b.id,
        name: b.name || '',
        location: b.location || '',
        description: b.description || '',
        binId: b.id,
        archived: b.archived || false,
      });
    }
    for (const item of items) {
      entries.push({
        type: 'item',
        id: item.id,
        name: item.description || '',
        description: '',
        binId: item.binId,
        tags: (item.tags || []).join(' '),
        archived: false,
      });
    }

    fuse = new Fuse(entries, {
      keys: ['id', 'name', 'location', 'description', 'tags'],
      threshold: 0.35,
    });
    fuseEntries = entries;
    fuseDataVersion = currentVersion;
    return entries;
  }

  function renderSearchResults(results) {
    const list = $('search-results');
    const empty = $('search-empty');

    if (results.length === 0) {
      list.innerHTML = '';
      empty.style.display = 'block';
      return;
    }

    empty.style.display = 'none';
    list.innerHTML = results
      .map(
        (r) => `
      <li class="result-card${r.archived ? ' archived' : ''}" data-bin-id="${esc(r.binId)}" tabindex="0" role="button">
        <div class="bin-id">${esc(r.binId)}${r.archived ? '<span class="archive-badge">Archived</span>' : ''}</div>
        <div class="bin-name">${esc(r.name)}</div>
        <div class="bin-meta">${r.type === 'item' ? 'Item match' : esc(r.location || '')}</div>
      </li>`
      )
      .join('');

    list.querySelectorAll('.result-card').forEach((card) => {
      const handler = () => onOpenBin(card.dataset.binId);
      card.addEventListener('click', handler);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handler();
        }
      });
    });
  }

  async function refreshSearch() {
    const entries = await buildFuse();
    const q = $('search-input').value.trim();
    const showArchived = $('search-show-archived').checked;

    let results;
    if (q) {
      results = fuse.search(q).map((r) => r.item);
    } else {
      results = entries.filter((e) => e.type === 'bin');
    }

    if (!showArchived) {
      results = results.filter((r) => !r.archived);
    }

    renderSearchResults(results);
    await refreshStats();

    if (!getIsApplyingRoute() && views.search.classList.contains('active')) {
      syncRouteReplace();
    }
  }

  function wireSearchEvents() {
    $('search-input').addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => refreshSearch(), 150);
    });
    $('search-show-archived').addEventListener('change', () => refreshSearch());
  }

  wireSearchEvents();

  return {
    refreshSearch,
  };
}

export { createSearchView };
