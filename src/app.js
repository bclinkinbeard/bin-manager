import * as db from './db.js';
import * as scanner from './scanner.js';
import { $, esc, escAttr } from './ui/dom.js';
import { createToast } from './ui/toast.js';
import { createConfirmAction } from './ui/modal.js';
import { buildRouteFromState, parseRouteFromHash as parseHashRoute } from './lib/routes.js';
import { parseTags } from './lib/tags.js';
import { sortItems } from './lib/sort.js';
import { prepareImportData } from './lib/import-validation.js';
import { formatBinId } from './lib/ids.js';
import { createSearchView } from './views/search.js';
import { createItemFormView } from './views/item-form.js';
import { createBinsView } from './views/bins.js';
import { createCloudSyncManager } from './lib/cloud-sync.js';
import {
  parseValidIso,
  getSyncMetaIso,
  setSyncMetaIso,
  formatDateTime,
  getLatestLocalSyncMs,
} from './lib/sync-meta.js';

const APP_VERSION = '2026.03.08-v26';
const APP_CACHE_VERSION = 'binmanager-v26';

// ── DOM refs ──

const views = {
  search: $('view-search'),
  scan: $('view-scan'),
  bin: $('view-bin'),
  tag: $('view-tag'),
  binForm: $('view-bin-form'),
  itemForm: $('view-item-form'),
  multiCrop: $('view-multi-crop'),
  bins: $('view-bins'),
  data: $('view-data'),
};

const navBtns = document.querySelectorAll('.nav-btn');
const statBins = $('stat-bins');
const statItems = $('stat-items');

// ── State ──

let currentBinId = null;
let currentPhoto = null;
let currentPhotoId = null;
let currentEditItemId = null;
let editingBin = null; // null = creating, object = editing
let scanHandled = false;
let itemSortOrder = localStorage.getItem('itemSortOrder') || 'newest';
const ITEMS_PER_PAGE = 20;
let itemsPage = 1;
let currentBinItems = [];
let currentTagOriginBinId = null;
let pendingImportData = null;
let pendingImportExportedAt = null;
let pendingImportWarnings = [];

const SYNC_META_KEYS = {
  lastExportAt: 'bmLastExportAt',
  lastImportAt: 'bmLastImportAt',
  lastImportedFileExportedAt: 'bmLastImportedFileExportedAt',
  lastCloudPullAt: 'bmLastCloudPullAt',
  lastCloudPushAt: 'bmLastCloudPushAt',
};
let currentTag = null;
let isApplyingRoute = false;
let ignoreNextHashChange = false;
let refreshSearch = async () => {};
let renderBins = async () => {};
let openAddItemForm = async () => {};
let openEditItemForm = async () => {};
let refreshCloudSync = async () => {};

// ── Custom Confirmation Modal ──
const confirmAction = createConfirmAction($);
const showToast = createToast($);

function renderAppVersion() {
  const label = `${APP_VERSION} (${APP_CACHE_VERSION})`;
  const headerEl = $('app-version');
  const dataEl = $('app-version-data');
  if (headerEl) headerEl.textContent = label;
  if (dataEl) dataEl.textContent = label;
}

// ── Navigation ──

function showView(name, options = {}) {
  const { syncUrl = true, replaceUrl = false } = options;
  Object.values(views).forEach((v) => v.classList.remove('active'));
  views[name].classList.add('active');

  navBtns.forEach((b) => {
    b.classList.toggle('active', b.dataset.view === name);
  });

  // Stop scanner when leaving scan view
  if (name !== 'scan') {
    scanner.stop();
  }

  if (name === 'data') {
    refreshSyncStatus();
    refreshCloudSync();
  }

  // Focus management: move focus to the view's first focusable element
  const view = views[name];
  const focusable = view.querySelector('input:not([type=hidden]):not([style*="display:none"]), button, textarea, [tabindex]');
  if (focusable) {
    requestAnimationFrame(() => focusable.focus());
  }

  if (syncUrl && !isApplyingRoute) {
    syncRouteToUrl({ replace: replaceUrl });
  }
}

function routeForCurrentView() {
  const activeViewName = Object.entries(views).find(([, el]) => el.classList.contains('active'))?.[0] || 'search';
  return buildRouteFromState({
    activeViewName,
    searchQuery: $('search-input').value,
    showArchived: $('search-show-archived').checked,
    currentBinId,
    currentTag,
    currentTagOriginBinId,
    binFormId: $('bin-form-id').value,
    editingBin,
    currentEditItemId,
    itemFormBinId: $('item-form-bin').value,
  });
}

function syncRouteToUrl({ replace = false } = {}) {
  const hash = `#${routeForCurrentView()}`;
  if (window.location.hash === hash) return;

  if (replace) {
    history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`);
    return;
  }

  ignoreNextHashChange = true;
  window.location.hash = hash;
}

function parseRouteFromHash() {
  return parseHashRoute(window.location.hash);
}

async function applyRouteFromHash() {
  const route = parseRouteFromHash();
  isApplyingRoute = true;

  try {
    if (route.view === 'scan') {
      showView('scan', { syncUrl: false });
      await startScanner();
      return;
    }

    if (route.view === 'bins') {
      showView('bins', { syncUrl: false });
      await renderBins();
      return;
    }

    if (route.view === 'data') {
      showView('data', { syncUrl: false });
      return;
    }

    if (route.view === 'bin' && route.binId) {
      await openBin(route.binId, { syncUrl: false });
      return;
    }

    if (route.view === 'tag' && route.tag) {
      await openTagResults(route.tag, route.originBinId, { syncUrl: false });
      return;
    }

    if (route.view === 'binForm' && route.binId) {
      const existingBin = route.edit ? await db.getBin(route.binId) : null;
      openBinForm(route.binId, existingBin, { syncUrl: false });
      return;
    }

    if (route.view === 'itemForm') {
      if (route.itemId) {
        await openEditItemForm(route.itemId, { syncUrl: false });
        return;
      }
      await openAddItemForm(route.binId || null, { syncUrl: false });
      return;
    }

    if (route.view === 'multiCrop') {
      if (route.binId) {
        await openBin(route.binId, { syncUrl: false });
        return;
      }
      showView('search', { syncUrl: false });
      await refreshSearch();
      return;
    }

    $('search-input').value = route.q || '';
    $('search-show-archived').checked = !!route.archived;
    showView('search', { syncUrl: false });
    await refreshSearch();
  } finally {
    isApplyingRoute = false;
  }
}

window.addEventListener('hashchange', () => {
  if (ignoreNextHashChange) {
    ignoreNextHashChange = false;
    return;
  }
  applyRouteFromHash();
});

navBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    const view = btn.dataset.view;
    if (view === 'scan') {
      showView('scan');
      startScanner();
      return;
    }
    if (view === 'bins') {
      showView('bins');
      renderBins();
      return;
    }
    if (view === 'data') {
      showView('data');
      return;
    }
    showView(view);
    if (view === 'search') refreshSearch();
  });
});

// ── Toast ──

function refreshSyncStatus() {
  const exportLabel = formatDateTime(getSyncMetaIso(localStorage, SYNC_META_KEYS.lastExportAt)) || 'Never';
  const importLabel = formatDateTime(getSyncMetaIso(localStorage, SYNC_META_KEYS.lastImportAt)) || 'Never';
  const importedFileLabel = formatDateTime(getSyncMetaIso(localStorage, SYNC_META_KEYS.lastImportedFileExportedAt)) || 'Unknown';
  const cloudPullLabel = formatDateTime(getSyncMetaIso(localStorage, SYNC_META_KEYS.lastCloudPullAt)) || 'Never';
  const cloudPushLabel = formatDateTime(getSyncMetaIso(localStorage, SYNC_META_KEYS.lastCloudPushAt)) || 'Never';
  $('sync-last-export').textContent = exportLabel;
  $('sync-last-import').textContent = importLabel;
  $('sync-last-imported-file-export').textContent = importedFileLabel;
  if ($('sync-last-cloud-pull')) $('sync-last-cloud-pull').textContent = cloudPullLabel;
  if ($('sync-last-cloud-push')) $('sync-last-cloud-push').textContent = cloudPushLabel;
}

function hideImportWarning() {
  $('import-warning').style.display = 'none';
  $('import-warning').textContent = '';
}

function showImportWarning(message) {
  $('import-warning').textContent = message;
  $('import-warning').style.display = 'block';
}

function updateStaleImportWarning(incomingExportedAt) {
  hideImportWarning();
  const safeIncoming = parseValidIso(incomingExportedAt);
  if (!safeIncoming) return;
  const latestLocalMs = getLatestLocalSyncMs(localStorage, SYNC_META_KEYS);
  if (!Number.isFinite(latestLocalMs) || latestLocalMs <= 0) return;
  const incomingMs = Date.parse(safeIncoming);
  if (incomingMs < latestLocalMs) {
    const incomingLabel = formatDateTime(safeIncoming);
    showImportWarning(`This file appears older (${incomingLabel}) than your latest local sync activity on this device. You can still import it if intentional.`);
  }
}

// ── Stats ──

async function refreshStats() {
  const c = await db.getCounts();
  statBins.textContent = c.bins;
  statItems.textContent = c.items;
}

const searchView = createSearchView({
  db,
  views,
  $,
  esc,
  refreshStats,
  syncRouteReplace: () => syncRouteToUrl({ replace: true }),
  onOpenBin: (binId) => openBin(binId),
  getIsApplyingRoute: () => isApplyingRoute,
});
refreshSearch = searchView.refreshSearch;

const itemFormView = createItemFormView({
  db,
  $,
  esc,
  formatBinId,
  parseTags,
  showView,
  openBin: (binId) => openBin(binId),
  refreshSearch: () => refreshSearch(),
  refreshStats,
  showToast,
  compressImage,
  getCurrentBinId: () => currentBinId,
  setCurrentBinId: (value) => {
    currentBinId = value;
  },
  getCurrentPhoto: () => currentPhoto,
  setCurrentPhoto: (value) => {
    currentPhoto = value;
  },
  getCurrentPhotoId: () => currentPhotoId,
  setCurrentPhotoId: (value) => {
    currentPhotoId = value;
  },
  getCurrentEditItemId: () => currentEditItemId,
  setCurrentEditItemId: (value) => {
    currentEditItemId = value;
  },
});
openAddItemForm = itemFormView.openAddItemForm;
openEditItemForm = itemFormView.openEditItemForm;

const binsView = createBinsView({
  db,
  $,
  esc,
  formatBinId,
  openBin: (binId) => openBin(binId),
  openBinForm: (id, existingBin, options) => openBinForm(id, existingBin, options),
});
renderBins = binsView.renderBins;

const cloudSyncManager = createCloudSyncManager({
  db,
  $,
  showToast,
  confirmAction,
  refreshStats: () => refreshStats(),
  refreshSearch: () => refreshSearch(),
  showView: (name, options) => showView(name, options),
  refreshSyncStatus: () => refreshSyncStatus(),
  localStorage,
  syncMetaKeys: SYNC_META_KEYS,
  setSyncMetaIso,
  getSyncMetaIso,
  formatDateTime,
  prepareImportData,
});
refreshCloudSync = cloudSyncManager.refresh;

// ── Scanner ──

async function startScanner() {
  scanHandled = false;
  $('scan-status').textContent = 'Starting camera...';
  try {
    await scanner.start('scan-reader', onQrScanned);
    $('scan-status').textContent = 'Point camera at a QR code';
  } catch (e) {
    $('scan-status').textContent = 'Camera error: ' + e.message;
  }
}

async function onQrScanned(text) {
  if (scanHandled) return;
  scanHandled = true;
  await scanner.stop();
  const id = text.trim();

  // Validate scanned ID: must be non-empty and reasonable length
  if (!id || id.length > 200) {
    showToast('Invalid QR code content', 'error');
    showView('search');
    refreshSearch();
    return;
  }

  const bin = await db.getBin(id);
  if (bin) {
    openBin(id);
  } else {
    openBinForm(id);
  }
}

// ── Bin detail ──

async function openBin(id, options = {}) {
  const { syncUrl = true } = options;
  currentBinId = id;
  const bin = await db.getBin(id);
  if (!bin) {
    openBinForm(id, null, { syncUrl });
    return;
  }

  $('bin-detail-id').textContent = bin.id;
  $('bin-detail-name').textContent = bin.name || '';
  $('bin-detail-loc').textContent = bin.location || '';
  $('bin-detail-desc').textContent = bin.description || '';

  // Archive badge
  $('bin-detail-archive-badge').style.display = bin.archived ? 'inline' : 'none';

  // Archive button text
  $('bin-archive').textContent = bin.archived ? 'Unarchive' : 'Archive';

  const items = await db.getItemsByBin(id);
  currentBinItems = items;
  itemsPage = 1;
  renderBinItems();
  showView('bin', { syncUrl });
}

function renderBinItems() {
  const container = $('bin-items-list');
  const sorted = sortItems(currentBinItems, itemSortOrder);
  const paged = sorted.slice(0, itemsPage * ITEMS_PER_PAGE);
  const hasMore = sorted.length > paged.length;

  if (sorted.length === 0) {
    container.innerHTML = '<div class="empty-state">No items in this bin yet.</div>';
    return;
  }

  container.innerHTML = paged
    .map(
      (item) => `
    <div class="item-card" data-item-id="${esc(item.id)}">
      ${item.photo && item.photo.startsWith('data:image/') ? `<img class="item-photo item-photo-preview" src="${escAttr(item.photo)}" alt="Photo of ${esc(item.description)}" role="button" tabindex="0" title="Tap to enlarge">` : ''}
      <div class="item-info">
        <div class="item-desc">${esc(item.description)}</div>
        ${(item.tags && item.tags.length) ? `<div class="item-tags">${item.tags.map(t => `<button type="button" class="tag-chip tag-chip-btn" data-tag="${escAttr(t)}">${esc(t)}</button>`).join('')}</div>` : ''}
        <div class="item-date">${formatDate(item.addedAt)}</div>
      </div>
      <div class="item-actions">
        <button class="item-edit" data-item-id="${esc(item.id)}" title="Edit" aria-label="Edit ${esc(item.description)}">&#9998;</button>
        <button class="item-delete" data-item-id="${esc(item.id)}" title="Delete" aria-label="Delete ${esc(item.description)}">&times;</button>
      </div>
    </div>`
    )
    .join('') + (hasMore ? `<button class="btn btn-secondary btn-block load-more" style="margin-top:8px;">Load more (${sorted.length - paged.length} remaining)</button>` : '');

  container.querySelectorAll('.item-delete').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const confirmed = await confirmAction({
        title: 'Delete Item',
        message: 'Are you sure you want to delete this item?',
        confirmLabel: 'Delete',
      });
      if (confirmed) {
        await db.deleteItem(btn.dataset.itemId);
        await openBin(currentBinId);
        await refreshStats();
      }
    });
  });

  container.querySelectorAll('.item-edit').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openEditItemForm(btn.dataset.itemId);
    });
  });

  container.querySelectorAll('.item-photo-preview').forEach((img) => {
    const open = () => openImagePreview(img.src, img.alt || 'Item photo');
    img.addEventListener('click', (e) => {
      e.stopPropagation();
      open();
    });
    img.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      e.stopPropagation();
      open();
    });
  });

  container.querySelectorAll('.tag-chip-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openTagResults(btn.dataset.tag, currentBinId);
    });
  });

  const loadMoreBtn = container.querySelector('.load-more');
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', () => {
      itemsPage++;
      renderBinItems();
    });
  }
}

async function openTagResults(tag, originBinId, options = {}) {
  const { syncUrl = true } = options;
  const normalizedTag = String(tag || '').trim().toLowerCase();
  if (!normalizedTag) return;
  currentTag = normalizedTag;
  currentTagOriginBinId = originBinId || null;

  const [items, bins] = await Promise.all([
    db.getItemsByTag(normalizedTag),
    db.getAllBins(),
  ]);
  const binMap = new Map(bins.map((b) => [b.id, b]));
  const sortedItems = sortItems(items, itemSortOrder);

  $('tag-results-title').textContent = `#${normalizedTag}`;
  $('tag-results-subtitle').textContent = `${sortedItems.length} item${sortedItems.length === 1 ? '' : 's'} with this tag`;

  const container = $('tag-items-list');
  if (sortedItems.length === 0) {
    container.innerHTML = '<div class="empty-state">No items found for this tag.</div>';
    showView('tag', { syncUrl });
    return;
  }

  container.innerHTML = sortedItems
    .map((item) => {
      const bin = binMap.get(item.binId);
      return `
      <div class="item-card" data-item-id="${esc(item.id)}">
        ${item.photo && item.photo.startsWith('data:image/') ? `<img class="item-photo" src="${escAttr(item.photo)}" alt="Photo of ${esc(item.description)}">` : ''}
        <div class="item-info">
          <div class="item-desc">${esc(item.description)}</div>
          ${(item.tags && item.tags.length) ? `<div class="item-tags">${item.tags.map(t => `<button type="button" class="tag-chip tag-chip-btn" data-tag="${escAttr(t)}">${esc(t)}</button>`).join('')}</div>` : ''}
          <div class="item-date">${esc(item.binId)}${bin && bin.name ? ` - ${esc(bin.name)}` : ''} | ${formatDate(item.addedAt)}</div>
        </div>
        <div class="item-actions">
          <button class="item-edit" data-open-bin-id="${esc(item.binId)}" title="Open Bin" aria-label="Open bin ${esc(item.binId)}">&#10140;</button>
        </div>
      </div>`;
    })
    .join('');

  container.querySelectorAll('[data-open-bin-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      openBin(btn.dataset.openBinId);
    });
  });

  container.querySelectorAll('.tag-chip-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openTagResults(btn.dataset.tag, currentTagOriginBinId);
    });
  });

  showView('tag', { syncUrl });
}

$('tag-back').addEventListener('click', () => {
  if (currentTagOriginBinId) {
    openBin(currentTagOriginBinId);
    return;
  }
  showView('search');
  refreshSearch();
});

$('bin-back').addEventListener('click', () => {
  showView('search');
  refreshSearch();
});

$('bin-delete').addEventListener('click', async () => {
  const itemCount = currentBinItems.length;
  const confirmed = await confirmAction({
    title: 'Delete Bin',
    message: itemCount > 0
      ? `This bin contains ${itemCount} item${itemCount === 1 ? '' : 's'}. Deleting it will also delete all items.`
      : 'Delete this empty bin?',
    confirmLabel: 'Delete Bin',
  });
  if (confirmed) {
    await db.deleteBin(currentBinId);
    showView('search');
    refreshSearch();
  }
});

$('bin-archive').addEventListener('click', async () => {
  const bin = await db.getBin(currentBinId);
  if (!bin) return;
  bin.archived = !bin.archived;
  await db.putBin(bin);
  await openBin(currentBinId);
});

$('bin-edit').addEventListener('click', async () => {
  const bin = await db.getBin(currentBinId);
  if (bin) openBinForm(bin.id, bin);
});

$('bin-add-item').addEventListener('click', () => {
  openAddItemForm(currentBinId);
});

$('bin-print-contents').addEventListener('click', () => {
  window.print();
});

// Sort controls
$('item-sort').addEventListener('change', (e) => {
  itemSortOrder = e.target.value;
  localStorage.setItem('itemSortOrder', itemSortOrder);
  renderBinItems();
});

// ── Bin form ──

function openBinForm(id, existingBin, options = {}) {
  const { syncUrl = true } = options;
  editingBin = existingBin || null;
  $('bin-form-id').value = id;
  $('bin-form-name').value = existingBin ? existingBin.name || '' : '';
  $('bin-form-location').value = existingBin ? existingBin.location || '' : '';
  $('bin-form-desc').value = existingBin ? existingBin.description || '' : '';
  $('bin-form-title').textContent = existingBin ? 'Edit Bin' : 'New Bin';
  showView('binForm', { syncUrl });
}

$('bin-form-back').addEventListener('click', () => {
  if (editingBin) {
    openBin(currentBinId);
  } else {
    showView('search');
    refreshSearch();
  }
});

$('bin-form-save').addEventListener('click', async () => {
  const id = $('bin-form-id').value.trim();
  if (!id) return;

  let createdAt = new Date().toISOString();
  let archived = false;

  if (editingBin) {
    const existing = await db.getBin(id);
    if (existing) {
      createdAt = existing.createdAt;
      archived = existing.archived || false;
    }
  }

  await db.putBin({
    id,
    name: $('bin-form-name').value.trim(),
    location: $('bin-form-location').value.trim(),
    description: $('bin-form-desc').value.trim(),
    createdAt,
    archived,
  });
  await refreshStats();
  openBin(id);
});

// ── Multi-Item Photo Crop ──

let multiCropImage = null;    // HTMLImageElement of the loaded photo
let multiCropSelections = [];  // [{x, y, w, h}] in image coordinates
let multiCropDrawing = false;
let multiCropStart = null;     // {x, y} canvas coordinates
let multiCropScale = 1;

$('bin-add-multi').addEventListener('click', () => {
  // Create a temporary file input to pick/take photo
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        multiCropImage = img;
        multiCropSelections = [];
        openMultiCropView();
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
  input.click();
});

function openMultiCropView(options = {}) {
  const { syncUrl = true } = options;
  showView('multiCrop', { syncUrl });
  $('multi-crop-hint').textContent = 'Draw rectangles around each item';
  $('multi-crop-shared-tags').value = '';
  renderMultiCropCanvas();
  renderMultiCropItems();
}

function renderMultiCropCanvas() {
  const canvas = $('multi-crop-canvas');
  const wrap = $('multi-crop-canvas-wrap');
  const wrapWidth = wrap.clientWidth || 400;

  // Scale image to fit container
  const img = multiCropImage;
  multiCropScale = Math.min(wrapWidth / img.width, 1);
  const dispW = Math.round(img.width * multiCropScale);
  const dispH = Math.round(img.height * multiCropScale);

  canvas.width = dispW;
  canvas.height = dispH;
  canvas.style.width = dispW + 'px';
  canvas.style.height = dispH + 'px';

  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, dispW, dispH);

  // Draw existing selections
  multiCropSelections.forEach((sel, i) => {
    const sx = sel.x * multiCropScale;
    const sy = sel.y * multiCropScale;
    const sw = sel.w * multiCropScale;
    const sh = sel.h * multiCropScale;

    ctx.strokeStyle = '#ff9800';
    ctx.lineWidth = 2;
    ctx.strokeRect(sx, sy, sw, sh);

    // Semi-transparent fill
    ctx.fillStyle = 'rgba(255, 152, 0, 0.15)';
    ctx.fillRect(sx, sy, sw, sh);

    // Number label
    ctx.fillStyle = '#ff9800';
    ctx.font = 'bold 16px monospace';
    ctx.fillText(String(i + 1), sx + 4, sy + 18);
  });
}

function getCanvasPointer(e) {
  const canvas = $('multi-crop-canvas');
  const rect = canvas.getBoundingClientRect();
  const touch = e.touches ? e.touches[0] : e;
  return {
    x: touch.clientX - rect.left,
    y: touch.clientY - rect.top,
  };
}

// Canvas interaction - mouse events
$('multi-crop-canvas').addEventListener('mousedown', (e) => {
  e.preventDefault();
  multiCropDrawing = true;
  multiCropStart = getCanvasPointer(e);
});

$('multi-crop-canvas').addEventListener('mousemove', (e) => {
  if (!multiCropDrawing || !multiCropStart) return;
  e.preventDefault();
  const pos = getCanvasPointer(e);
  renderMultiCropCanvas();
  // Draw in-progress rectangle
  const ctx = $('multi-crop-canvas').getContext('2d');
  ctx.strokeStyle = '#ff9800';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 3]);
  ctx.strokeRect(multiCropStart.x, multiCropStart.y, pos.x - multiCropStart.x, pos.y - multiCropStart.y);
  ctx.setLineDash([]);
});

$('multi-crop-canvas').addEventListener('mouseup', (e) => {
  if (!multiCropDrawing || !multiCropStart) return;
  e.preventDefault();
  finishSelection(getCanvasPointer(e));
});

// Canvas interaction - touch events
$('multi-crop-canvas').addEventListener('touchstart', (e) => {
  if (e.touches.length !== 1) return;
  e.preventDefault();
  multiCropDrawing = true;
  multiCropStart = getCanvasPointer(e);
}, { passive: false });

$('multi-crop-canvas').addEventListener('touchmove', (e) => {
  if (!multiCropDrawing || !multiCropStart) return;
  e.preventDefault();
  const pos = getCanvasPointer(e);
  renderMultiCropCanvas();
  const ctx = $('multi-crop-canvas').getContext('2d');
  ctx.strokeStyle = '#ff9800';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 3]);
  ctx.strokeRect(multiCropStart.x, multiCropStart.y, pos.x - multiCropStart.x, pos.y - multiCropStart.y);
  ctx.setLineDash([]);
}, { passive: false });

$('multi-crop-canvas').addEventListener('touchend', (e) => {
  if (!multiCropDrawing || !multiCropStart) return;
  e.preventDefault();
  const touch = e.changedTouches[0];
  const canvas = $('multi-crop-canvas');
  const rect = canvas.getBoundingClientRect();
  finishSelection({ x: touch.clientX - rect.left, y: touch.clientY - rect.top });
}, { passive: false });

function finishSelection(endPos) {
  multiCropDrawing = false;
  if (!multiCropStart) return;

  // Convert canvas coords to image coords
  let x = Math.min(multiCropStart.x, endPos.x) / multiCropScale;
  let y = Math.min(multiCropStart.y, endPos.y) / multiCropScale;
  let w = Math.abs(endPos.x - multiCropStart.x) / multiCropScale;
  let h = Math.abs(endPos.y - multiCropStart.y) / multiCropScale;

  // Clamp to image bounds
  x = Math.max(0, x);
  y = Math.max(0, y);
  w = Math.min(w, multiCropImage.width - x);
  h = Math.min(h, multiCropImage.height - y);

  multiCropStart = null;

  // Ignore tiny selections (likely accidental taps)
  if (w < 20 || h < 20) {
    renderMultiCropCanvas();
    return;
  }

  multiCropSelections.push({ x, y, w, h });
  renderMultiCropCanvas();
  renderMultiCropItems();
}

function cropSelectionToDataUrl(sel) {
  const canvas = document.createElement('canvas');
  canvas.width = sel.w;
  canvas.height = sel.h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(multiCropImage, sel.x, sel.y, sel.w, sel.h, 0, 0, sel.w, sel.h);
  return canvas.toDataURL('image/jpeg', 0.7);
}

function renderMultiCropItems() {
  const container = $('multi-crop-items');
  const count = multiCropSelections.length;
  $('multi-crop-count').textContent = count + ' selection' + (count === 1 ? '' : 's');
  $('multi-crop-save').disabled = count === 0;

  if (count === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = multiCropSelections.map((sel, i) => {
    const thumb = cropSelectionToDataUrl(sel);
    return `
    <div class="multi-crop-item" data-index="${i}">
      <img class="multi-crop-thumb" src="${escAttr(thumb)}" alt="Selection ${i + 1}" role="button" tabindex="0" title="Tap to enlarge">
      <div class="multi-crop-item-fields">
        <span class="multi-crop-num">#${i + 1}</span>
        <input type="text" class="multi-crop-desc" placeholder="Description" data-index="${i}">
        <input type="text" class="multi-crop-tags" placeholder="Tags (comma-separated)" data-index="${i}">
      </div>
    </div>`;
  }).join('');

  container.querySelectorAll('.multi-crop-thumb').forEach((img) => {
    const open = () => openImagePreview(img.src, img.alt || 'Cropped item');
    img.addEventListener('click', open);
    img.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      open();
    });
  });
}

$('multi-crop-undo').addEventListener('click', () => {
  if (multiCropSelections.length === 0) return;
  multiCropSelections.pop();
  renderMultiCropCanvas();
  renderMultiCropItems();
});

$('multi-crop-clear').addEventListener('click', () => {
  multiCropSelections = [];
  $('multi-crop-shared-tags').value = '';
  renderMultiCropCanvas();
  renderMultiCropItems();
});

$('multi-crop-back').addEventListener('click', () => {
  multiCropImage = null;
  multiCropSelections = [];
  $('multi-crop-shared-tags').value = '';
  openBin(currentBinId);
});

$('multi-crop-save').addEventListener('click', async () => {
  if (multiCropSelections.length === 0) return;

  const descs = $('multi-crop-items').querySelectorAll('.multi-crop-desc');
  const tagsInputs = $('multi-crop-items').querySelectorAll('.multi-crop-tags');
  const sharedTags = parseTags($('multi-crop-shared-tags').value.trim());
  let savedCount = 0;

  for (let i = 0; i < multiCropSelections.length; i++) {
    const sel = multiCropSelections[i];
    const desc = descs[i].value.trim() || `Item ${i + 1}`;
    const tags = [...new Set([...sharedTags, ...parseTags(tagsInputs[i].value.trim())])];

    const photo = await compressImage(cropSelectionToDataUrl(sel));

    await db.putItem({
      id: crypto.randomUUID(),
      binId: currentBinId,
      description: desc,
      photo,
      tags,
      addedAt: new Date().toISOString(),
    });
    savedCount++;
  }

  showToast(`Saved ${savedCount} item${savedCount === 1 ? '' : 's'}`, 'success');
  multiCropImage = null;
  multiCropSelections = [];
  $('multi-crop-shared-tags').value = '';
  await refreshStats();
  openBin(currentBinId);
});

// ── Photo Compression ──

function compressImage(dataUrl, maxDim = 800, quality = 0.7) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// ── Recovery Helpers ──

const RECOVERY_PRIMARY_DB_NAME = 'binManagerDB';
const RECOVERY_FALLBACK_DB_NAMES = [
  RECOVERY_PRIMARY_DB_NAME,
  'BinManagerDB',
  'binmanagerDB',
  'binmanagerdb',
  'bin-manager-db',
  'bin_manager_db',
  'inventoryDB',
  'inventory-db',
];

function idbReq(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function withTimeout(promise, ms, label) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function openNamedDb(name, version) {
  return new Promise((resolve, reject) => {
    let createdDuringOpen = false;
    const req = typeof version === 'number' ? indexedDB.open(name, version) : indexedDB.open(name);
    req.onupgradeneeded = () => {
      createdDuringOpen = true;
    };
    req.onsuccess = () => resolve({ connection: req.result, createdDuringOpen });
    req.onerror = () => reject(req.error);
  });
}

function deleteNamedDb(name) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

function dbHasStore(connection, storeName) {
  return connection.objectStoreNames.contains(storeName);
}

async function getAllFromStore(connection, storeName) {
  if (!dbHasStore(connection, storeName)) return [];
  const tx = connection.transaction(storeName, 'readonly');
  return idbReq(tx.objectStore(storeName).getAll());
}

async function getCountFromStore(connection, storeName) {
  if (!dbHasStore(connection, storeName)) return 0;
  const tx = connection.transaction(storeName, 'readonly');
  return idbReq(tx.objectStore(storeName).count());
}

async function getRecordFromStore(connection, storeName, key) {
  if (!dbHasStore(connection, storeName)) return null;
  const tx = connection.transaction(storeName, 'readonly');
  return idbReq(tx.objectStore(storeName).get(key));
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function setRecoveryStatus(message, isError = false) {
  const status = $('recovery-status');
  if (!message) {
    status.style.display = 'none';
    status.textContent = '';
    return;
  }
  status.style.display = 'block';
  status.textContent = message;
  status.style.color = isError ? 'var(--danger)' : 'var(--text-dim)';
}

async function listRecoveryDatabases() {
  const fallback = RECOVERY_FALLBACK_DB_NAMES.map((name) => ({ name, version: null, source: 'fallback-probe' }));
  if (typeof indexedDB.databases !== 'function') {
    return fallback;
  }
  let dbs = [];
  try {
    dbs = await withTimeout(indexedDB.databases(), 2500, 'Database listing');
  } catch (_) {
    return fallback;
  }
  const named = dbs.filter((d) => d && d.name).map((d) => ({ name: d.name, version: d.version || null, source: 'native' }));
  if (named.length === 0) {
    return fallback;
  }
  return named;
}

async function inspectRecoveryDatabase(dbInfo) {
  const { connection, createdDuringOpen } = await withTimeout(
    openNamedDb(dbInfo.name, dbInfo.version || undefined),
    2500,
    `Opening ${dbInfo.name}`
  );
  try {
    const hasBins = dbHasStore(connection, 'bins');
    const hasItems = dbHasStore(connection, 'items');
    const hasPhotos = dbHasStore(connection, 'photos');
    const [binCount, itemCount, photoCount] = await withTimeout(
      Promise.all([
        getCountFromStore(connection, 'bins'),
        getCountFromStore(connection, 'items'),
        getCountFromStore(connection, 'photos'),
      ]),
      2500,
      `Inspecting ${dbInfo.name}`
    );
    if (dbInfo.source === 'fallback-probe' && createdDuringOpen && !hasBins && !hasItems && !hasPhotos) {
      return null;
    }
    return {
      ...dbInfo,
      hasBins,
      hasItems,
      hasPhotos,
      binCount,
      itemCount,
      photoCount,
    };
  } finally {
    connection.close();
    if (dbInfo.source === 'fallback-probe' && createdDuringOpen) {
      try {
        await withTimeout(deleteNamedDb(dbInfo.name), 2000, `Cleaning up ${dbInfo.name}`);
      } catch (_) {
        // Ignore cleanup errors from blocked/unsupported delete calls.
      }
    }
  }
}

function renderRecoveryResults(results) {
  const container = $('recovery-results');
  if (!results.length) {
    container.innerHTML = '<div class="empty-state">No local databases found on this origin.</div>';
    return;
  }

  container.innerHTML = results.map((r) => {
    const canRecover = r.hasBins && r.hasItems;
    const hasData = r.binCount > 0 || r.itemCount > 0;
    const disabled = !canRecover || !hasData ? ' disabled' : '';
    const storeLabel = `${r.binCount} bin${r.binCount === 1 ? '' : 's'} • ${r.itemCount} item${r.itemCount === 1 ? '' : 's'}`;
    const photosLabel = r.hasPhotos ? ` • ${r.photoCount} photo${r.photoCount === 1 ? '' : 's'}` : '';
    const note = !canRecover
      ? 'Missing bins/items stores.'
      : (!hasData ? 'No records found.' : '');
    return `
      <div class="recovery-card">
        <div class="recovery-name">${esc(r.name)}</div>
        <div class="recovery-meta">${storeLabel}${photosLabel}${note ? ` • ${esc(note)}` : ''}</div>
        <div class="recovery-actions">
          <button class="btn btn-secondary recovery-export"${disabled} data-recovery-action="export" data-db-name="${escAttr(r.name)}">Export</button>
          <button class="btn btn-danger recovery-restore"${disabled} data-recovery-action="restore" data-db-name="${escAttr(r.name)}">Restore (Replace)</button>
        </div>
      </div>
    `;
  }).join('');
}

function downloadJson(data, filenameBase) {
  const safeBase = String(filenameBase || 'export').replace(/[^a-zA-Z0-9._-]+/g, '-');
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeBase}-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function extractRecoveryPayload(dbName) {
  const { connection } = await openNamedDb(dbName);
  try {
    if (!dbHasStore(connection, 'bins') || !dbHasStore(connection, 'items')) {
      throw new Error('Selected database is missing bins/items stores.');
    }
    const bins = await getAllFromStore(connection, 'bins');
    const items = await getAllFromStore(connection, 'items');
    const hasPhotos = dbHasStore(connection, 'photos');

    const photoCache = new Map();
    const exportItems = [];

    for (const item of items) {
      const out = { ...item };
      if ((!out.photo || typeof out.photo !== 'string') && out.photoId && hasPhotos) {
        let record = photoCache.get(out.photoId);
        if (record === undefined) {
          record = await getRecordFromStore(connection, 'photos', out.photoId);
          photoCache.set(out.photoId, record || null);
        }
        if (record && record.blob) {
          try {
            out.photo = await blobToDataUrl(record.blob);
          } catch (_) {
            // Keep item without inline photo if conversion fails.
          }
        }
      }
      delete out.photoId;
      exportItems.push(out);
    }

    return {
      version: 1,
      bins,
      items: exportItems,
      exportedAt: new Date().toISOString(),
    };
  } finally {
    connection.close();
  }
}

$('recovery-scan-btn').addEventListener('click', async () => {
  const scanBtn = $('recovery-scan-btn');
  scanBtn.disabled = true;
  setRecoveryStatus(`Scanning local databases on ${window.location.origin}...`);
  $('recovery-results').innerHTML = '';

  try {
    const dbs = await listRecoveryDatabases();
    setRecoveryStatus(`Scanning ${dbs.length} database${dbs.length === 1 ? '' : 's'}...`);
    const inspected = [];
    for (let i = 0; i < dbs.length; i++) {
      const dbInfo = dbs[i];
      setRecoveryStatus(`Scanning ${i + 1}/${dbs.length}: ${dbInfo.name}...`);
      try {
        const result = await inspectRecoveryDatabase(dbInfo);
        if (result) inspected.push(result);
      } catch (_) {
        if (dbInfo.source !== 'fallback-probe') {
          inspected.push({
            ...dbInfo,
            hasBins: false,
            hasItems: false,
            hasPhotos: false,
            binCount: 0,
            itemCount: 0,
            photoCount: 0,
          });
        }
      }
    }
    renderRecoveryResults(inspected);
    const candidates = inspected.filter((d) => d.binCount > 0 || d.itemCount > 0).length;
    if (inspected.length === 0) {
      setRecoveryStatus(`Scan complete. No databases were detected on ${window.location.origin}. If your data lived on another domain, open that domain on this phone and export there.`);
      return;
    }
    if (candidates === 0) {
      setRecoveryStatus(`Scan complete. Found ${inspected.length} database${inspected.length === 1 ? '' : 's'} on ${window.location.origin}, but none had bins/items. If you changed domains, recover from the old domain first.`);
      return;
    }
    setRecoveryStatus(`Scan complete. Found ${inspected.length} database${inspected.length === 1 ? '' : 's'} on this origin (${candidates} with data).`);
  } catch (err) {
    setRecoveryStatus(`Recovery scan failed: ${err.message}`, true);
  } finally {
    scanBtn.disabled = false;
  }
});

$('recovery-results').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-recovery-action]');
  if (!btn) return;

  const action = btn.dataset.recoveryAction;
  const dbName = btn.dataset.dbName;
  if (!dbName) return;

  btn.disabled = true;
  try {
    if (action === 'export') {
      setRecoveryStatus(`Building export from ${dbName}...`);
      const payload = await extractRecoveryPayload(dbName);
      downloadJson(payload, `binmanager-recovery-${dbName}`);
      setRecoveryStatus(`Recovery export created from ${dbName}.`);
      return;
    }

    if (action === 'restore') {
      const confirmed = await confirmAction({
        title: 'Restore Recovered Data',
        message: `Replace current data with records recovered from ${dbName}?`,
        confirmLabel: 'Restore',
      });
      if (!confirmed) {
        setRecoveryStatus('Restore canceled.');
        return;
      }

      setRecoveryStatus(`Restoring data from ${dbName}...`);
      const payload = await extractRecoveryPayload(dbName);
      const restoreResult = await db.importAll(payload, 'replace');
      setSyncMetaIso(localStorage, SYNC_META_KEYS.lastImportAt, new Date().toISOString());
      setSyncMetaIso(localStorage, SYNC_META_KEYS.lastImportedFileExportedAt, payload.exportedAt);
      refreshSyncStatus();
      await refreshStats();
      const restoreMsg = `Restored ${payload.bins.length} bins and ${payload.items.length} items`;
      showToast(restoreResult && restoreResult.photosFailed ? `${restoreMsg} (some photos could not be saved)` : restoreMsg, 'success');
      setRecoveryStatus(`Restore complete from ${dbName}.`);
      showView('search');
      await refreshSearch();
    }
  } catch (err) {
    setRecoveryStatus(`Recovery ${action} failed: ${err.message}`, true);
  } finally {
    btn.disabled = false;
  }
});

// ── Data (Export / Import) ──

$('data-export').addEventListener('click', async () => {
  try {
    const data = await db.exportAll();
    downloadJson(data, 'binmanager-export');
    setSyncMetaIso(localStorage, SYNC_META_KEYS.lastExportAt, new Date().toISOString());
    refreshSyncStatus();
    showToast('Data exported successfully', 'success');
  } catch (e) {
    showToast('Export failed: ' + e.message, 'error');
  }
});

$('data-import-btn').addEventListener('click', () => $('data-import-input').click());

$('data-import-input').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  pendingImportData = null;
  pendingImportExportedAt = null;
  pendingImportWarnings = [];
  hideImportWarning();
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      const prepared = prepareImportData(data);
      if (!prepared.ok) {
        pendingImportData = null;
        pendingImportExportedAt = null;
        pendingImportWarnings = [];
        $('import-preview').style.display = 'none';
        confirmAction({
          title: 'Invalid File',
          message: prepared.errors.slice(0, 3).join(' '),
          confirmLabel: 'OK',
          danger: false,
        });
        return;
      }
      pendingImportData = prepared.data;
      pendingImportExportedAt = parseValidIso(prepared.data.exportedAt);
      pendingImportWarnings = prepared.warnings || [];
      const s = prepared.summary;
      const summaryParts = [
        `Version ${s.version}`,
        `${s.bins} bin${s.bins === 1 ? '' : 's'}`,
        `${s.items} item${s.items === 1 ? '' : 's'}`,
      ];
      if (s.archivedBins > 0) summaryParts.push(`${s.archivedBins} archived bin${s.archivedBins === 1 ? '' : 's'}`);
      if (s.taggedItems > 0) summaryParts.push(`${s.taggedItems} tagged item${s.taggedItems === 1 ? '' : 's'}`);
      if (s.hasPhotos) summaryParts.push('includes photos');
      $('import-summary').textContent = summaryParts.join(' • ');
      updateStaleImportWarning(prepared.data.exportedAt);
      if (pendingImportWarnings.length > 0) {
        showImportWarning(`${$('import-warning').textContent ? `${$('import-warning').textContent} ` : ''}Normalization notes: ${pendingImportWarnings.join(' ')}`);
      }
      $('import-preview').style.display = 'block';
    } catch (err) {
      pendingImportData = null;
      pendingImportExportedAt = null;
      pendingImportWarnings = [];
      hideImportWarning();
      $('import-preview').style.display = 'none';
      confirmAction({
        title: 'Invalid File',
        message: 'Could not parse the selected file as JSON.',
        confirmLabel: 'OK',
        danger: false,
      });
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

$('import-confirm').addEventListener('click', async () => {
  if (!pendingImportData) return;
  const mode = $('import-mode').value;

  if (mode === 'replace') {
    const confirmed = await confirmAction({
      title: 'Replace All Data',
      message: 'This will delete all existing bins and items before importing. This cannot be undone.',
      confirmLabel: 'Replace',
    });
    if (!confirmed) return;
  }

  const importSnapshot = pendingImportData;

  try {
    const result = await db.importAll(importSnapshot, mode);
    setSyncMetaIso(localStorage, SYNC_META_KEYS.lastImportAt, new Date().toISOString());
    if (pendingImportExportedAt) {
      setSyncMetaIso(localStorage, SYNC_META_KEYS.lastImportedFileExportedAt, pendingImportExportedAt);
    } else {
      localStorage.removeItem(SYNC_META_KEYS.lastImportedFileExportedAt);
    }
    refreshSyncStatus();

    pendingImportData = null;
    pendingImportExportedAt = null;
    pendingImportWarnings = [];
    $('import-preview').style.display = 'none';
    hideImportWarning();

    // Reset active search filters so imported data is immediately visible.
    $('search-input').value = '';
    const importedBins = importSnapshot.bins || [];
    if (importedBins.length > 0 && importedBins.every((bin) => bin.archived)) {
      $('search-show-archived').checked = true;
    }

    await refreshStats();
    showView('search');
    await refreshSearch();
    const msg = `Imported ${importSnapshot.bins.length} bins and ${importSnapshot.items.length} items`;
    if (result && result.photosFailed) {
      showToast(`${msg} (some photos could not be saved)`, 'success');
    } else {
      showToast(msg, 'success');
    }
  } catch (err) {
    showToast('Import failed: ' + (err?.message || 'Unknown error'), 'error');
  }
});

$('import-cancel').addEventListener('click', () => {
  pendingImportData = null;
  pendingImportExportedAt = null;
  pendingImportWarnings = [];
  $('import-preview').style.display = 'none';
  hideImportWarning();
});

// ── Utilities ──

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function openImagePreview(src, altText) {
  if (!src) return;
  const overlay = $('image-modal-overlay');
  const img = $('image-modal-img');
  img.src = src;
  img.alt = altText || 'Image preview';
  overlay.classList.add('active');
  overlay.setAttribute('aria-hidden', 'false');
}

function closeImagePreview() {
  const overlay = $('image-modal-overlay');
  const img = $('image-modal-img');
  overlay.classList.remove('active');
  overlay.setAttribute('aria-hidden', 'true');
  img.src = '';
}

$('image-modal-close').addEventListener('click', closeImagePreview);
$('image-modal-overlay').addEventListener('click', (e) => {
  if (e.target === $('image-modal-overlay')) closeImagePreview();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeImagePreview();
});

// ── Init ──

async function init() {
  try {
    renderAppVersion();
    await db.open();
    await cloudSyncManager.init();
    // Restore sort preference
    const savedSort = localStorage.getItem('itemSortOrder');
    if (savedSort) {
      itemSortOrder = savedSort;
      $('item-sort').value = savedSort;
    }
    refreshSyncStatus();
    await refreshStats();
    if (window.location.hash) {
      await applyRouteFromHash();
    } else {
      showView('search', { replaceUrl: true });
      await refreshSearch();
    }
  } catch (e) {
    document.body.innerHTML = `<div style="padding:40px;text-align:center;color:#e0e0e0;font-family:monospace;">
      <h2>Failed to initialize</h2>
      <p style="margin-top:12px;color:#888;">${esc(e.message)}</p>
      <p style="margin-top:8px;color:#888;">Try refreshing the page or checking browser storage settings.</p>
    </div>`;
  }
}

init();
