function createSearchView({ db, views, $, esc, refreshStats, syncRouteReplace, onOpenBin, getIsApplyingRoute }) {
  let fuse = null;
  let fuseDataVersion = -1;
  let searchEntries = null;
  let debounceTimer = null;

  async function buildFuse() {
    const currentVersion = db.getDataVersion();
    if (fuse && fuseDataVersion === currentVersion) {
      return searchEntries;
    }

    const [bins, items] = await Promise.all([
      db.getAllBins(),
      db.getAllItemsWithPhotos(),
    ]);
    const binMap = new Map();
    bins.forEach((b) => {
      binMap.set(b.id, b);
    });
    searchEntries = items.map((item) => {
      const bin = binMap.get(item.binId);
      return {
        id: item.id,
        label: item.description || '',
        photo: item.photo || '',
        binId: item.binId,
        binName: bin && bin.name ? bin.name : '',
        tags: Array.isArray(item.tags) ? item.tags : [],
        archived: bin ? !!bin.archived : false,
      };
    });

    fuse = new Fuse(searchEntries, {
      keys: ['label', 'tags'],
      threshold: 0.35,
      includeMatches: true,
      ignoreLocation: true,
    });
    fuseDataVersion = currentVersion;
    return searchEntries;
  }

  function mergeRanges(ranges) {
    if (!Array.isArray(ranges) || ranges.length === 0) return [];
    const sorted = ranges
      .map((range) => [Number(range[0]), Number(range[1])])
      .filter(([start, end]) => Number.isInteger(start) && Number.isInteger(end) && start <= end)
      .sort((a, b) => a[0] - b[0]);
    if (sorted.length === 0) return [];

    const merged = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
      const [start, end] = sorted[i];
      const prev = merged[merged.length - 1];
      if (start <= prev[1] + 1) {
        prev[1] = Math.max(prev[1], end);
      } else {
        merged.push([start, end]);
      }
    }
    return merged;
  }

  function highlightByRanges(value, ranges) {
    const text = String(value || '');
    const merged = mergeRanges(ranges);
    if (merged.length === 0) return esc(text);

    let cursor = 0;
    let html = '';
    for (const [start, end] of merged) {
      const safeStart = Math.max(0, start);
      const safeEnd = Math.min(text.length - 1, end);
      if (safeStart > cursor) {
        html += esc(text.slice(cursor, safeStart));
      }
      if (safeEnd >= safeStart) {
        html += `<mark class="match-highlight">${esc(text.slice(safeStart, safeEnd + 1))}</mark>`;
      }
      cursor = safeEnd + 1;
    }
    if (cursor < text.length) {
      html += esc(text.slice(cursor));
    }
    return html;
  }

  function getHighlightRanges(matches) {
    const labelRanges = [];
    const tagRangesByIndex = new Map();
    for (const match of matches || []) {
      if (!match || !Array.isArray(match.indices) || match.indices.length === 0) continue;
      if (match.key === 'label') {
        labelRanges.push(...match.indices);
        continue;
      }
      if (match.key === 'tags') {
        const tagIndex = Number(match.refIndex);
        if (!Number.isInteger(tagIndex) || tagIndex < 0) continue;
        const currentRanges = tagRangesByIndex.get(tagIndex) || [];
        currentRanges.push(...match.indices);
        tagRangesByIndex.set(tagIndex, currentRanges);
      }
    }
    return { labelRanges, tagRangesByIndex };
  }

  function renderSearchResults(results, isQueryActive) {
    const list = $('search-results');
    const empty = $('search-empty');

    if (results.length === 0) {
      list.innerHTML = '';
      empty.textContent = isQueryActive ? 'No matching items found.' : 'No items yet. Add an item to start.';
      empty.style.display = 'block';
      return;
    }

    empty.style.display = 'none';
    list.innerHTML = results.map((r) => {
      const { labelRanges, tagRangesByIndex } = getHighlightRanges(r.matches);
      const label = r.label || '(No description)';
      const tags = Array.isArray(r.tags) ? r.tags : [];
      const hasPhoto = typeof r.photo === 'string' && r.photo.startsWith('data:image/');
      const labelHtml = isQueryActive ? highlightByRanges(label, labelRanges) : esc(label);
      return `
      <li class="item-card search-item-card${r.archived ? ' archived' : ''}" data-open-bin-id="${esc(r.binId)}" tabindex="0" role="button">
        ${hasPhoto ? `<img class="item-photo" src="${esc(r.photo)}" alt="Photo of ${esc(label)}">` : ''}
        <div class="item-info">
          <div class="item-desc">${labelHtml}</div>
          ${tags.length ? `<div class="item-tags">${tags.map((tag, index) => `<span class="tag-chip">${isQueryActive ? highlightByRanges(tag, tagRangesByIndex.get(index) || []) : esc(tag)}</span>`).join('')}</div>` : ''}
          <div class="item-date">${esc(r.binId)}${r.binName ? ` - ${esc(r.binName)}` : ''}${r.archived ? ' - Archived' : ''}</div>
        </div>
      </li>`;
    }).join('');

    list.querySelectorAll('[data-open-bin-id]').forEach((card) => {
      const handler = () => onOpenBin(card.dataset.openBinId);
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
      results = fuse.search(q).map((r) => ({
        ...r.item,
        matches: r.matches || [],
      }));
    } else {
      results = entries.map((entry) => ({
        ...entry,
        matches: [],
      }));
    }

    if (!showArchived) {
      results = results.filter((r) => !r.archived);
    }

    renderSearchResults(results, !!q);
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
