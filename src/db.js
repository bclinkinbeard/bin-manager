const DB_NAME = 'binManagerDB';
const DB_VERSION = 1;

let db = null;

function open() {
  return new Promise((resolve, reject) => {
    if (db) return resolve(db);
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('bins')) {
        d.createObjectStore('bins', { keyPath: 'id' });
      }
      if (!d.objectStoreNames.contains('items')) {
        const items = d.createObjectStore('items', { keyPath: 'id' });
        items.createIndex('binId', 'binId', { unique: false });
      }
    };
    req.onsuccess = (e) => { db = e.target.result; resolve(db); };
    req.onerror = (e) => reject(e.target.error);
  });
}

function tx(store, mode) {
  return db.transaction(store, mode).objectStore(store);
}

function req(r) {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

// ── Bins ──

async function getAllBins() {
  await open();
  return req(tx('bins', 'readonly').getAll());
}

async function getBin(id) {
  await open();
  return req(tx('bins', 'readonly').get(id));
}

async function putBin(bin) {
  await open();
  return req(tx('bins', 'readwrite').put(bin));
}

async function deleteBin(id) {
  await open();
  // fetch items first, before opening write transactions
  const items = await getItemsByBin(id);
  await req(tx('bins', 'readwrite').delete(id));
  if (items.length > 0) {
    const store = tx('items', 'readwrite');
    for (const item of items) {
      store.delete(item.id);
    }
  }
}

// ── Items ──

async function getAllItems() {
  await open();
  return req(tx('items', 'readonly').getAll());
}

async function getItemsByBin(binId) {
  await open();
  const store = tx('items', 'readonly');
  const idx = store.index('binId');
  return req(idx.getAll(binId));
}

async function putItem(item) {
  await open();
  return req(tx('items', 'readwrite').put(item));
}

async function deleteItem(id) {
  await open();
  return req(tx('items', 'readwrite').delete(id));
}

// ── Counts ──

async function getCounts() {
  await open();
  const bins = await req(tx('bins', 'readonly').count());
  const items = await req(tx('items', 'readonly').count());
  return { bins, items };
}

// ── Next bin number ──

async function getNextBinNumber() {
  const bins = await getAllBins();
  let max = 0;
  for (const b of bins) {
    const m = b.id.match(/^BIN-(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max + 1;
}

// ── Export ──

async function exportAll() {
  const bins = await getAllBins();
  const items = await getAllItems();
  return { bins, items, exportedAt: new Date().toISOString() };
}

export {
  open, getAllBins, getBin, putBin, deleteBin,
  getAllItems, getItemsByBin, putItem, deleteItem,
  getCounts, getNextBinNumber, exportAll
};
