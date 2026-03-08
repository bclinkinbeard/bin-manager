const DB_NAME = 'binManagerDB';
const DB_VERSION = 3;

let db = null;
let dataVersion = 0;

function open() {
  return new Promise((resolve, reject) => {
    if (db) return resolve(db);
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('bins')) {
        d.createObjectStore('bins', { keyPath: 'id' });
      }
      if (!d.objectStoreNames.contains('items')) {
        const items = d.createObjectStore('items', { keyPath: 'id' });
        items.createIndex('binId', 'binId', { unique: false });
        items.createIndex('tags', 'tags', { unique: false, multiEntry: true });
      } else {
        const items = req.transaction.objectStore('items');
        if (!items.indexNames.contains('binId')) {
          items.createIndex('binId', 'binId', { unique: false });
        }
        if (!items.indexNames.contains('tags')) {
          items.createIndex('tags', 'tags', { unique: false, multiEntry: true });
        }
      }
      if (!d.objectStoreNames.contains('photos')) {
        d.createObjectStore('photos', { keyPath: 'id' });
      }
    };
    req.onsuccess = (e) => {
      db = e.target.result;
      resolve(db);
    };
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

function hasPhotosStore() {
  return db.objectStoreNames.contains('photos');
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  return [
    ...new Set(
      tags
        .map((tag) => String(tag || '').trim().toLowerCase())
        .filter(Boolean)
    ),
  ];
}

function normalizeItemForStorage(item) {
  return {
    ...item,
    tags: normalizeTags(item.tags),
  };
}

function isDataUrlPhoto(value) {
  return typeof value === 'string' && value.startsWith('data:image/');
}

async function dataUrlToBlob(dataUrl) {
  const response = await fetch(dataUrl);
  return response.blob();
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function putPhotoBlob(blob, mimeType) {
  await open();
  if (!hasPhotosStore()) return null;
  const id = crypto.randomUUID();
  const record = {
    id,
    blob,
    mimeType: mimeType || blob.type || 'application/octet-stream',
    createdAt: new Date().toISOString(),
  };
  await req(tx('photos', 'readwrite').put(record));
  return id;
}

async function getPhotoRecord(photoId) {
  await open();
  if (!hasPhotosStore() || !photoId) return null;
  return req(tx('photos', 'readonly').get(photoId));
}

async function countItemsByPhotoId(photoId) {
  await open();
  if (!photoId) return 0;
  const items = await getAllItems();
  return items.filter((item) => item.photoId === photoId).length;
}

async function deletePhotoIfUnused(photoId) {
  await open();
  if (!hasPhotosStore() || !photoId) return;
  const refs = await countItemsByPhotoId(photoId);
  if (refs === 0) {
    await req(tx('photos', 'readwrite').delete(photoId));
  }
}

async function hydrateItemPhoto(item) {
  if (!item) return item;
  if (isDataUrlPhoto(item.photo)) return item;
  if (!item.photoId) return item;
  const photoRecord = await getPhotoRecord(item.photoId);
  if (!photoRecord || !photoRecord.blob) return item;
  try {
    const dataUrl = await blobToDataUrl(photoRecord.blob);
    return { ...item, photo: dataUrl };
  } catch {
    return item;
  }
}

async function hydrateItemsWithPhotos(items) {
  return Promise.all(items.map((item) => hydrateItemPhoto(item)));
}

async function ensureBlobBackedPhoto(item) {
  const normalized = normalizeItemForStorage(item);

  if (normalized.photoId && typeof normalized.photoId === 'string') {
    return { ...normalized, photoId: normalized.photoId.trim(), photo: undefined };
  }

  if (isDataUrlPhoto(normalized.photo) && hasPhotosStore()) {
    try {
      const blob = await dataUrlToBlob(normalized.photo);
      const photoId = await putPhotoBlob(blob, blob.type);
      if (photoId) {
        return { ...normalized, photoId, photo: undefined };
      }
    } catch {
      // Fall through to legacy inline photo storage if conversion fails.
    }
  }

  return normalized;
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
  const result = await req(tx('bins', 'readwrite').put(bin));
  dataVersion++;
  return result;
}

async function putBins(bins) {
  await open();
  const t = db.transaction('bins', 'readwrite');
  const store = t.objectStore('bins');
  for (const bin of bins) store.put(bin);
  return txComplete(t);
}

async function getItemsByBinRaw(binId) {
  await open();
  const store = tx('items', 'readonly');
  return req(store.index('binId').getAll(binId));
}

async function deleteBin(id) {
  await open();
  const items = await getItemsByBinRaw(id);
  const photoIds = [...new Set(items.map((item) => item.photoId).filter(Boolean))];

  const t = db.transaction(['bins', 'items'], 'readwrite');
  t.objectStore('bins').delete(id);
  if (items.length > 0) {
    const itemStore = t.objectStore('items');
    for (const item of items) itemStore.delete(item.id);
  }
  await txComplete(t);

  await Promise.all(photoIds.map((photoId) => deletePhotoIfUnused(photoId)));
  dataVersion++;
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
        const { id, binId, description, addedAt, tags } = c.value;
        results.push({ id, binId, description, addedAt, tags });
        c.continue();
      } else {
        resolve(results);
      }
    };
    cursor.onerror = () => reject(cursor.error);
  });
}

async function getItem(id) {
  await open();
  const item = await req(tx('items', 'readonly').get(id));
  return hydrateItemPhoto(item);
}

async function getItemsByBin(binId) {
  const items = await getItemsByBinRaw(binId);
  return hydrateItemsWithPhotos(items);
}

async function getItemsByTag(tag) {
  const needle = String(tag || '').trim().toLowerCase();
  if (!needle) return [];
  await open();
  const store = tx('items', 'readonly');
  let items;
  if (store.indexNames.contains('tags')) {
    items = await req(store.index('tags').getAll(needle));
  } else {
    const all = await getAllItems();
    items = all.filter((item) => normalizeTags(item.tags).includes(needle));
  }
  return hydrateItemsWithPhotos(items);
}

async function putItem(item) {
  await open();
  const itemForStorage = await ensureBlobBackedPhoto(item);
  const result = await req(tx('items', 'readwrite').put(itemForStorage));
  dataVersion++;
  return result;
}

async function deleteItem(id) {
  await open();
  const item = await req(tx('items', 'readonly').get(id));
  await req(tx('items', 'readwrite').delete(id));
  if (item && item.photoId) {
    await deletePhotoIfUnused(item.photoId);
  }
  dataVersion++;
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
  const exportItems = [];

  for (const item of items) {
    const exportItem = { ...item };
    if (!isDataUrlPhoto(exportItem.photo) && exportItem.photoId) {
      const photoRecord = await getPhotoRecord(exportItem.photoId);
      if (photoRecord && photoRecord.blob) {
        try {
          exportItem.photo = await blobToDataUrl(photoRecord.blob);
        } catch {
          // Ignore conversion errors and export without inline photo.
        }
      }
    }
    delete exportItem.photoId;
    exportItems.push(exportItem);
  }

  return { version: 1, bins, items: exportItems, exportedAt: new Date().toISOString() };
}

// ── Import ──

async function importAll(data, mode) {
  await open();

  const photoRecords = [];
  const preparedItems = [];
  for (const item of data.items || []) {
    const normalized = normalizeItemForStorage(item);
    if (normalized.photoId || !isDataUrlPhoto(normalized.photo) || !hasPhotosStore()) {
      preparedItems.push(normalized);
      continue;
    }

    try {
      const blob = await dataUrlToBlob(normalized.photo);
      const photoId = crypto.randomUUID();
      photoRecords.push({
        id: photoId,
        blob,
        mimeType: blob.type || 'application/octet-stream',
        createdAt: new Date().toISOString(),
      });
      preparedItems.push({ ...normalized, photoId, photo: undefined });
    } catch {
      preparedItems.push(normalized);
    }
  }

  // Store bins and items first in their own transaction so that a photo
  // storage failure (quota, blob serialisation, etc.) cannot roll back the
  // entire import and leave the user with zero data.
  const coreStores = hasPhotosStore() && mode === 'replace'
    ? ['bins', 'items', 'photos']
    : ['bins', 'items'];
  const t = db.transaction(coreStores, 'readwrite');
  const binStore = t.objectStore('bins');
  const itemStore = t.objectStore('items');

  if (mode === 'replace') {
    binStore.clear();
    itemStore.clear();
    if (hasPhotosStore()) {
      t.objectStore('photos').clear();
    }
  }

  for (const bin of data.bins || []) binStore.put(bin);
  for (const item of preparedItems) itemStore.put(item);

  await txComplete(t);
  dataVersion++;

  // Store photo blobs in a separate transaction so failures here don't
  // roll back the bins/items saved above.
  let photosFailed = false;
  if (hasPhotosStore() && photoRecords.length > 0) {
    try {
      const pt = db.transaction('photos', 'readwrite');
      const photoStore = pt.objectStore('photos');
      for (const photo of photoRecords) photoStore.put(photo);
      await txComplete(pt);
    } catch {
      // Photos failed to persist — items still reference their photoIds so
      // the photos will simply be missing until the next import/sync.
      photosFailed = true;
    }
  }

  return { photosFailed };
}

// ── Data version (for Fuse cache invalidation) ──

function getDataVersion() {
  return dataVersion;
}

export {
  open,
  getAllBins,
  getBin,
  putBin,
  putBins,
  deleteBin,
  getAllItems,
  getAllItemsLight,
  getItem,
  getItemsByBin,
  getItemsByTag,
  putItem,
  deleteItem,
  getCounts,
  getNextBinNumber,
  exportAll,
  importAll,
  getDataVersion,
};
