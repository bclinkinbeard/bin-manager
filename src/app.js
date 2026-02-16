import * as db from './db.js';
import * as scanner from './scanner.js';

// ── DOM refs ──

const $ = (id) => document.getElementById(id);

const views = {
  search: $('view-search'),
  scan: $('view-scan'),
  bin: $('view-bin'),
  binForm: $('view-bin-form'),
  itemForm: $('view-item-form'),
  labels: $('view-labels'),
  data: $('view-data'),
};

const navBtns = document.querySelectorAll('.nav-btn');
const statBins = $('stat-bins');
const statItems = $('stat-items');

// ── State ──

let currentBinId = null;
let currentPhoto = null;
let currentEditItemId = null;
let editingBin = null; // null = creating, object = editing
let fuse = null;
let fuseDataVersion = -1;
let fuseEntries = null;
let debounceTimer = null;
let scanHandled = false;
let itemSortOrder = localStorage.getItem('itemSortOrder') || 'newest';
const ITEMS_PER_PAGE = 20;
let itemsPage = 1;
let currentBinItems = [];

// ── Custom Confirmation Modal ──

function confirmAction({ title, message, confirmLabel, danger }) {
  return new Promise((resolve) => {
    $('modal-title').textContent = title || 'Confirm';
    $('modal-message').textContent = message || 'Are you sure?';
    const confirmBtn = $('modal-confirm');
    confirmBtn.textContent = confirmLabel || 'Confirm';
    confirmBtn.className = danger === false ? 'btn btn-primary' : 'btn btn-danger';
    $('modal-overlay').classList.add('active');

    function cleanup() {
      $('modal-overlay').classList.remove('active');
      confirmBtn.removeEventListener('click', onConfirm);
      $('modal-cancel').removeEventListener('click', onCancel);
    }
    function onConfirm() { cleanup(); resolve(true); }
    function onCancel() { cleanup(); resolve(false); }

    confirmBtn.addEventListener('click', onConfirm);
    $('modal-cancel').addEventListener('click', onCancel);
  });
}

// ── Navigation ──

function showView(name) {
  Object.values(views).forEach((v) => v.classList.remove('active'));
  views[name].classList.add('active');

  navBtns.forEach((b) => {
    b.classList.toggle('active', b.dataset.view === name);
  });

  // Stop scanner when leaving scan view
  if (name !== 'scan') {
    scanner.stop();
  }

  // Focus management: move focus to the view's first focusable element
  const view = views[name];
  const focusable = view.querySelector('input:not([type=hidden]):not([style*="display:none"]), button, textarea, [tabindex]');
  if (focusable) {
    requestAnimationFrame(() => focusable.focus());
  }
}

navBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    const view = btn.dataset.view;
    if (view === 'scan') {
      showView('scan');
      startScanner();
      return;
    }
    if (view === 'labels') {
      showView('labels');
      renderLabels();
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

function showToast(message, type) {
  const toast = $('toast');
  toast.textContent = message;
  toast.className = 'toast visible' + (type ? ' toast-' + type : '');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.className = 'toast'; }, 2500);
}

// ── Stats ──

async function refreshStats() {
  const c = await db.getCounts();
  statBins.textContent = c.bins;
  statItems.textContent = c.items;
}

// ── Search ──

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
    const handler = () => openBin(card.dataset.binId);
    card.addEventListener('click', handler);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(); }
    });
  });
}

$('search-input').addEventListener('input', () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => refreshSearch(), 150);
});
$('search-show-archived').addEventListener('change', () => refreshSearch());

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

async function openBin(id) {
  currentBinId = id;
  const bin = await db.getBin(id);
  if (!bin) {
    openBinForm(id);
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
  showView('bin');
}

function sortItems(items) {
  const sorted = [...items];
  switch (itemSortOrder) {
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

function renderBinItems() {
  const container = $('bin-items-list');
  const sorted = sortItems(currentBinItems);
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
      ${item.photo && item.photo.startsWith('data:image/') ? `<img class="item-photo" src="${escAttr(item.photo)}" alt="Photo of ${esc(item.description)}">` : ''}
      <div class="item-info">
        <div class="item-desc">${esc(item.description)}</div>
        ${(item.tags && item.tags.length) ? `<div class="item-tags">${item.tags.map(t => `<span class="tag-chip">${esc(t)}</span>`).join('')}</div>` : ''}
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

  const loadMoreBtn = container.querySelector('.load-more');
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', () => {
      itemsPage++;
      renderBinItems();
    });
  }
}

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
  currentPhoto = null;
  currentEditItemId = null;
  $('item-form-desc').value = '';
  $('item-form-tags').value = '';
  $('item-photo-preview').style.display = 'none';
  $('item-form-title').textContent = 'Add Item';
  showView('itemForm');
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

function openBinForm(id, existingBin) {
  editingBin = existingBin || null;
  $('bin-form-id').value = id;
  $('bin-form-name').value = existingBin ? existingBin.name || '' : '';
  $('bin-form-location').value = existingBin ? existingBin.location || '' : '';
  $('bin-form-desc').value = existingBin ? existingBin.description || '' : '';
  $('bin-form-title').textContent = existingBin ? 'Edit Bin' : 'New Bin';
  showView('binForm');
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

// ── Item form ──

async function openEditItemForm(itemId) {
  const item = await db.getItem(itemId);
  if (!item) return;
  currentEditItemId = itemId;
  currentPhoto = item.photo || null;
  $('item-form-desc').value = item.description || '';
  $('item-form-tags').value = (item.tags || []).join(', ');
  if (item.photo && item.photo.startsWith('data:image/')) {
    $('item-photo-preview').src = item.photo;
    $('item-photo-preview').style.display = 'block';
  } else {
    $('item-photo-preview').style.display = 'none';
  }
  $('item-form-title').textContent = 'Edit Item';
  showView('itemForm');
}

$('item-form-back').addEventListener('click', () => {
  currentPhoto = null;
  openBin(currentBinId);
});

$('item-photo-btn').addEventListener('click', () => $('item-photo-input').click());

$('item-photo-input').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    compressImage(ev.target.result).then((compressed) => {
      currentPhoto = compressed;
      $('item-photo-preview').src = currentPhoto;
      $('item-photo-preview').style.display = 'block';
    });
  };
  reader.readAsDataURL(file);
});

$('item-form-save').addEventListener('click', async () => {
  const desc = $('item-form-desc').value.trim();
  if (!desc) return;

  const tagsStr = $('item-form-tags').value.trim();
  const tags = tagsStr
    ? [...new Set(tagsStr.split(',').map(t => t.trim().toLowerCase()).filter(Boolean))]
    : [];

  const itemId = currentEditItemId || crypto.randomUUID();
  let addedAt = new Date().toISOString();

  if (currentEditItemId) {
    const existing = await db.getItem(currentEditItemId);
    if (existing) {
      addedAt = existing.addedAt;
    }
  }

  await db.putItem({
    id: itemId,
    binId: currentBinId,
    description: desc,
    photo: currentPhoto,
    tags,
    addedAt,
  });
  currentPhoto = null;
  currentEditItemId = null;
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

// ── Labels ──

async function renderLabels() {
  const bins = (await db.getAllBins()).filter(b => !b.archived);
  const grid = $('labels-grid');

  if (bins.length === 0) {
    grid.innerHTML = '<div class="empty-state">No bins yet. Generate some bins first.</div>';
    return;
  }

  grid.innerHTML = bins
    .map(
      (b) => `
    <div class="label-card">
      <canvas data-qr-id="${esc(b.id)}"></canvas>
      <div class="label-text">${esc(b.id)}</div>
      <div class="label-name">${esc(b.name || '')}</div>
    </div>`
    )
    .join('');

  // Generate QR codes in parallel
  const canvases = grid.querySelectorAll('canvas[data-qr-id]');
  await Promise.all(Array.from(canvases).map((canvas) =>
    QRCode.toCanvas(canvas, canvas.dataset.qrId, {
      width: 120,
      margin: 1,
      color: { dark: '#000000', light: '#ffffff' },
    }).catch((e) => console.error('QR generation failed for', canvas.dataset.qrId, e))
  ));
}

$('labels-print').addEventListener('click', () => window.print());

$('labels-create').addEventListener('click', () => {
  $('generate-controls').style.display = 'flex';
});

$('generate-cancel').addEventListener('click', () => {
  $('generate-controls').style.display = 'none';
});

$('generate-go').addEventListener('click', async () => {
  const count = parseInt($('generate-count').value, 10) || 10;
  let next = await db.getNextBinNumber();
  const bins = [];
  for (let i = 0; i < count; i++) {
    bins.push({
      id: `BIN-${String(next).padStart(3, '0')}`,
      name: '',
      location: '',
      description: '',
      createdAt: new Date().toISOString(),
      archived: false,
    });
    next++;
  }
  await db.putBins(bins);
  $('generate-controls').style.display = 'none';
  await refreshStats();
  await renderLabels();
});

$('labels-back').addEventListener('click', () => {
  showView('search');
  refreshSearch();
});

// ── Data (Export / Import) ──

$('data-export').addEventListener('click', async () => {
  try {
    const data = await db.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `binmanager-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('Data exported successfully', 'success');
  } catch (e) {
    showToast('Export failed: ' + e.message, 'error');
  }
});

$('data-import-btn').addEventListener('click', () => $('data-import-input').click());

let pendingImportData = null;

$('data-import-input').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      if (!validateImportData(data)) {
        confirmAction({
          title: 'Invalid File',
          message: 'This file does not contain valid BinManager data. Expected bins and/or items arrays.',
          confirmLabel: 'OK',
          danger: false,
        });
        return;
      }
      pendingImportData = data;
      const binCount = (data.bins || []).length;
      const itemCount = (data.items || []).length;
      $('import-summary').textContent = `This file contains ${binCount} bin${binCount === 1 ? '' : 's'} and ${itemCount} item${itemCount === 1 ? '' : 's'}.`;
      $('import-preview').style.display = 'block';
    } catch (err) {
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

  await db.importAll(pendingImportData, mode);
  pendingImportData = null;
  $('import-preview').style.display = 'none';
  await refreshStats();
  showView('search');
  await refreshSearch();
});

$('import-cancel').addEventListener('click', () => {
  pendingImportData = null;
  $('import-preview').style.display = 'none';
});

// ── Import Validation ──

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

// ── Utilities ──

const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ESC_MAP[c]);
}

function escAttr(s) {
  return String(s).replace(/[&<>"']/g, (c) => ESC_MAP[c]);
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Init ──

async function init() {
  try {
    await db.open();
    // Restore sort preference
    const savedSort = localStorage.getItem('itemSortOrder');
    if (savedSort) {
      itemSortOrder = savedSort;
      $('item-sort').value = savedSort;
    }
    await refreshStats();
    await refreshSearch();
  } catch (e) {
    document.body.innerHTML = `<div style="padding:40px;text-align:center;color:#e0e0e0;font-family:monospace;">
      <h2>Failed to initialize</h2>
      <p style="margin-top:12px;color:#888;">${esc(e.message)}</p>
      <p style="margin-top:8px;color:#888;">Try refreshing the page or checking browser storage settings.</p>
    </div>`;
  }
}

init();
