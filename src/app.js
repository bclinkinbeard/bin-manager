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
};

const navBtns = document.querySelectorAll('.nav-btn');
const statBins = $('stat-bins');
const statItems = $('stat-items');

// ── State ──

let currentBinId = null;
let currentPhoto = null;
let fuse = null;

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
}

navBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    const view = btn.dataset.view;
    if (view === 'export') {
      doExport();
      return;
    }
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
    showView(view);
    if (view === 'search') refreshSearch();
  });
});

// ── Stats ──

async function refreshStats() {
  const c = await db.getCounts();
  statBins.textContent = c.bins;
  statItems.textContent = c.items;
}

// ── Search ──

async function buildFuse() {
  const bins = await db.getAllBins();
  const items = await db.getAllItems();
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
  return entries;
}

async function refreshSearch() {
  const entries = await buildFuse();
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
    <li class="result-card" data-bin-id="${esc(r.binId)}">
      <div class="bin-id">${esc(r.binId)}</div>
      <div class="bin-name">${esc(r.name)}</div>
      <div class="bin-meta">${r.type === 'item' ? 'Item match' : esc(r.location || '')}</div>
    </li>`
    )
    .join('');

  list.querySelectorAll('.result-card').forEach((card) => {
    card.addEventListener('click', () => openBin(card.dataset.binId));
  });
}

$('search-input').addEventListener('input', () => refreshSearch());

// ── Scanner ──

async function startScanner() {
  $('scan-status').textContent = 'Starting camera...';
  try {
    await scanner.start('scan-reader', onQrScanned);
    $('scan-status').textContent = 'Point camera at a QR code';
  } catch (e) {
    $('scan-status').textContent = 'Camera error: ' + e.message;
  }
}

async function onQrScanned(text) {
  await scanner.stop();
  const id = text.trim();
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
  $('bin-detail-name').textContent = bin.name || '(unnamed)';
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
      ${item.photo && item.photo.startsWith('data:image/') ? `<img class="item-photo" src="${item.photo}" alt="">` : ''}
      <div class="item-info">
        <div class="item-desc">${esc(item.description)}</div>
        <div class="item-date">${formatDate(item.addedAt)}</div>
      </div>
      <button class="item-delete" data-item-id="${esc(item.id)}">&times;</button>
    </div>`
    )
    .join('');

  container.querySelectorAll('.item-delete').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm('Delete this item?')) {
        await db.deleteItem(btn.dataset.itemId);
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
    showView('search');
    refreshSearch();
  }
});

$('bin-add-item').addEventListener('click', () => {
  currentPhoto = null;
  $('item-form-desc').value = '';
  $('item-photo-preview').style.display = 'none';
  showView('itemForm');
});

// ── Bin form ──

function openBinForm(id) {
  $('bin-form-id').value = id;
  $('bin-form-name').value = '';
  $('bin-form-location').value = '';
  $('bin-form-desc').value = '';
  $('bin-form-title').textContent = 'New Bin';
  showView('binForm');
}

$('bin-form-back').addEventListener('click', () => {
  showView('search');
  refreshSearch();
});

$('bin-form-save').addEventListener('click', async () => {
  const id = $('bin-form-id').value.trim();
  if (!id) return;
  await db.putBin({
    id,
    name: $('bin-form-name').value.trim(),
    location: $('bin-form-location').value.trim(),
    description: $('bin-form-desc').value.trim(),
    createdAt: new Date().toISOString(),
  });
  await refreshStats();
  openBin(id);
});

// ── Item form ──

$('item-form-back').addEventListener('click', () => openBin(currentBinId));

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

  // Generate QR codes on each canvas
  const canvases = grid.querySelectorAll('canvas[data-qr-id]');
  for (const canvas of canvases) {
    const binId = canvas.dataset.qrId;
    try {
      await QRCode.toCanvas(canvas, binId, {
        width: 120,
        margin: 1,
        color: { dark: '#000000', light: '#ffffff' },
      });
    } catch (e) {
      console.error('QR generation failed for', binId, e);
    }
  }
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
  for (let i = 0; i < count; i++) {
    const id = `BIN-${String(next).padStart(3, '0')}`;
    await db.putBin({
      id,
      name: '',
      location: '',
      description: '',
      createdAt: new Date().toISOString(),
    });
    next++;
  }
  $('generate-controls').style.display = 'none';
  await refreshStats();
  await renderLabels();
});

$('labels-back').addEventListener('click', () => {
  showView('search');
  refreshSearch();
});

// ── Export ──

async function doExport() {
  const data = await db.exportAll();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `binmanager-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Utilities ──

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Init ──

async function init() {
  await db.open();
  await refreshStats();
  await refreshSearch();
}

init();
