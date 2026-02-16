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
let fuse = null;
let fuseEntries = null;
let fuseStale = true;
let editingBin = null; // null = creating, object = editing
let debounceTimer = null;
let scanHandled = false;

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

function markFuseStale() {
  fuseStale = true;
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
    });
  }
  for (const item of items) {
    entries.push({
      type: 'item',
      id: item.id,
      name: item.description || '',
      description: '',
      binId: item.binId,
    });
  }
  fuse = new Fuse(entries, {
    keys: ['id', 'name', 'location', 'description'],
    threshold: 0.35,
  });
  fuseEntries = entries;
  fuseStale = false;
  return entries;
}

async function refreshSearch() {
  let entries = fuseEntries;
  if (fuseStale || !fuse) {
    entries = await buildFuse();
  }
  const q = $('search-input').value.trim();
  const results = q ? fuse.search(q).map((r) => r.item) : entries.filter((e) => e.type === 'bin');
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
    <li class="result-card" data-bin-id="${esc(r.binId)}" tabindex="0" role="button">
      <div class="bin-id">${esc(r.binId)}</div>
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

  const items = await db.getItemsByBin(id);
  renderBinItems(items);
  showView('bin');
}

function renderBinItems(items) {
  const container = $('bin-items-list');
  if (items.length === 0) {
    container.innerHTML = '<div class="empty-state">No items in this bin yet.</div>';
    return;
  }
  container.innerHTML = items
    .map(
      (item) => `
    <div class="item-card" data-item-id="${esc(item.id)}">
      ${item.photo && item.photo.startsWith('data:image/') ? `<img class="item-photo" src="${escAttr(item.photo)}" alt="Photo of ${esc(item.description)}">` : ''}
      <div class="item-info">
        <div class="item-desc">${esc(item.description)}</div>
        <div class="item-date">${formatDate(item.addedAt)}</div>
      </div>
      <button class="item-delete" data-item-id="${esc(item.id)}" aria-label="Delete ${esc(item.description)}">&times;</button>
    </div>`
    )
    .join('');

  container.querySelectorAll('.item-delete').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm('Delete this item?')) {
        await db.deleteItem(btn.dataset.itemId);
        markFuseStale();
        await openBin(currentBinId);
        await refreshStats();
      }
    });
  });
}

$('bin-back').addEventListener('click', () => {
  showView('search');
  refreshSearch();
});

$('bin-delete').addEventListener('click', async () => {
  if (confirm('Delete this bin and all its items?')) {
    await db.deleteBin(currentBinId);
    markFuseStale();
    showView('search');
    refreshSearch();
  }
});

$('bin-edit').addEventListener('click', async () => {
  const bin = await db.getBin(currentBinId);
  if (bin) openBinForm(bin.id, bin);
});

$('bin-add-item').addEventListener('click', () => {
  currentPhoto = null;
  $('item-form-desc').value = '';
  $('item-photo-preview').style.display = 'none';
  showView('itemForm');
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
    openBin(editingBin.id);
  } else {
    showView('search');
    refreshSearch();
  }
});

$('bin-form-save').addEventListener('click', async () => {
  const id = $('bin-form-id').value.trim();
  if (!id) return;
  await db.putBin({
    id,
    name: $('bin-form-name').value.trim(),
    location: $('bin-form-location').value.trim(),
    description: $('bin-form-desc').value.trim(),
    createdAt: editingBin ? editingBin.createdAt : new Date().toISOString(),
  });
  markFuseStale();
  await refreshStats();
  openBin(id);
});

// ── Item form ──

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
    currentPhoto = ev.target.result;
    $('item-photo-preview').src = currentPhoto;
    $('item-photo-preview').style.display = 'block';
  };
  reader.readAsDataURL(file);
});

$('item-form-save').addEventListener('click', async () => {
  const desc = $('item-form-desc').value.trim();
  if (!desc) return;
  await db.putItem({
    id: crypto.randomUUID(),
    binId: currentBinId,
    description: desc,
    photo: currentPhoto,
    addedAt: new Date().toISOString(),
  });
  currentPhoto = null;
  markFuseStale();
  await refreshStats();
  openBin(currentBinId);
});

// ── Labels ──

async function renderLabels() {
  const bins = await db.getAllBins();
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
    });
    next++;
  }
  await db.putBins(bins);
  $('generate-controls').style.display = 'none';
  markFuseStale();
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

$('data-import-input').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (!confirm('This will replace ALL existing data. Continue?')) {
    e.target.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = async (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      if (!Array.isArray(data.bins) || !Array.isArray(data.items)) {
        throw new Error('Invalid format: expected { bins: [...], items: [...] }');
      }
      await db.importAll(data);
      markFuseStale();
      await refreshStats();
      showToast(`Imported ${data.bins.length} bins and ${data.items.length} items`, 'success');
    } catch (err) {
      showToast('Import failed: ' + err.message, 'error');
    }
    e.target.value = '';
  };
  reader.readAsText(file);
});

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
