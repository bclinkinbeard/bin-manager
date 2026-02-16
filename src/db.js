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

function txComplete(t) {
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
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

async function putBins(bins) {
  await open();
  const t = db.transaction('bins', 'readwrite');
  const store = t.objectStore('bins');
  for (const bin of bins) store.put(bin);
  return txComplete(t);
}

async function deleteBin(id) {
  await open();
  const items = await getItemsByBin(id);
  const t = db.transaction(['bins', 'items'], 'readwrite');
  t.objectStore('bins').delete(id);
  if (items.length > 0) {
    const itemStore = t.objectStore('items');
    for (const item of items) itemStore.delete(item.id);
  }
  return txComplete(t);
}

// ── Items ──

async function getAllItems() {
  await open();
  return req(tx('items', 'readonly').getAll());
}

async function getAllItemsLight() {
  await open();
  return new Promise((resolve, reject) => {
    const results = [];
    const store = tx('items', 'readonly');
    const cursor = store.openCursor();
    cursor.onsuccess = (e) => {
      const c = e.target.result;
      if (c) {
        const { id, binId, description, addedAt } = c.value;
        results.push({ id, binId, description, addedAt });
        c.continue();
      } else {
        resolve(results);
      }
    };
    cursor.onerror = () => reject(cursor.error);
  });
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

// ── Export / Import ──

async function exportAll() {
  const bins = await getAllBins();
  const items = await getAllItems();
  return { bins, items, exportedAt: new Date().toISOString() };
}

async function importAll(data) {
  await open();
  const t = db.transaction(['bins', 'items'], 'readwrite');
  const binStore = t.objectStore('bins');
  const itemStore = t.objectStore('items');
  binStore.clear();
  itemStore.clear();
  for (const bin of data.bins) binStore.put(bin);
  for (const item of data.items) itemStore.put(item);
  return txComplete(t);
}

export {
  open, getAllBins, getBin, putBin, putBins, deleteBin,
  getAllItems, getAllItemsLight, getItemsByBin, putItem, deleteItem,
  getCounts, getNextBinNumber, exportAll, importAll
};
