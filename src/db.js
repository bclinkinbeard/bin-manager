import { mergeTags, normalizeTagList, removeTags } from './lib/tags.js';

const DB_NAME = 'binManagerDB';
const DB_VERSION = 3;

let db = null;
let dataVersion = 0;
const readCache = {
  bins: null,
  items: null,
  itemsWithPhotos: null,
  itemsByBin: new Map(),
  itemById: new Map(),
  tags: null,
  counts: null,
};

function clearReadCache() {
  readCache.bins = null;
  readCache.items = null;
  readCache.itemsWithPhotos = null;
  readCache.itemsByBin.clear();
  readCache.itemById.clear();
  readCache.tags = null;
  readCache.counts = null;
}

function bumpDataVersion() {
  dataVersion++;
  clearReadCache();
}

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
  const links = Array.isArray(item && item.links)
    ? [...new Set(item.links
      .map((link) => String(link || '').trim())
      .filter((link) => /^https?:\/\//i.test(link)))]
    : [];
  return {
    ...item,
    tags: normalizeTagList(item.tags),
    links,
  };
}

function safeIso(value) {
  if (typeof value !== 'string') return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function normalizeBinForStorage(bin, existingBin = null, nowIso = new Date().toISOString()) {
  const createdAt = safeIso(bin && bin.createdAt)
    || safeIso(existingBin && existingBin.createdAt)
    || nowIso;

  const base = {
    ...(existingBin || {}),
    ...(bin || {}),
    createdAt,
  };

  const incomingLastModifiedAt = safeIso(bin && bin.lastModifiedAt);
  const previousLastModifiedAt = safeIso(existingBin && existingBin.lastModifiedAt);
  const incomingPrintedAt = safeIso(bin && bin.labelPrintedAt);
  const previousPrintedAt = safeIso(existingBin && existingBin.labelPrintedAt);

  if (incomingLastModifiedAt) {
    base.lastModifiedAt = incomingLastModifiedAt;
  } else if (previousLastModifiedAt) {
    base.lastModifiedAt = previousLastModifiedAt;
  } else {
    base.lastModifiedAt = createdAt;
  }

  if (incomingPrintedAt) {
    base.labelPrintedAt = incomingPrintedAt;
  } else if (incomingPrintedAt === null && Object.prototype.hasOwnProperty.call(bin || {}, 'labelPrintedAt')) {
    delete base.labelPrintedAt;
  } else if (previousPrintedAt) {
    base.labelPrintedAt = previousPrintedAt;
  }

  return base;
}

function isDataUrlPhoto(value) {
  return typeof value === 'string' && value.startsWith('data:image/');
}

function getInlinePhotos(item) {
  if (!item) return [];
  const photos = [];
  if (isDataUrlPhoto(item.photo)) photos.push(item.photo);
  if (Array.isArray(item.photos)) {
    photos.push(...item.photos.filter((photo) => isDataUrlPhoto(photo)));
  }
  return [...new Set(photos)];
}

function getPhotoIds(item) {
  if (!item) return [];
  return [...new Set([
    ...(typeof item.photoId === 'string' ? [item.photoId.trim()] : []),
    ...(Array.isArray(item.photoIds) ? item.photoIds.map((id) => String(id || '').trim()) : []),
  ].filter(Boolean))];
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
  return items.filter((item) => item.photoId === photoId || (Array.isArray(item.photoIds) && item.photoIds.includes(photoId))).length;
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
  const photoIdList = getPhotoIds(item);
  const dedupedInline = getInlinePhotos(item);

  if (photoIdList.length === 0) {
    if (dedupedInline.length === 0) return item;
    return { ...item, photo: dedupedInline[0], photos: dedupedInline };
  }

  const cachedItem = readCache.itemById.get(item.id);
  if (cachedItem && Array.isArray(cachedItem.photos) && cachedItem.photos.length >= photoIdList.length) {
    return { ...item, photo: cachedItem.photos[0], photos: cachedItem.photos };
  }

  const hydratedPhotos = [...dedupedInline];
  for (const photoId of photoIdList) {
    const photoRecord = await getPhotoRecord(photoId);
    if (!photoRecord || !photoRecord.blob) continue;
    try {
      const dataUrl = await blobToDataUrl(photoRecord.blob);
      hydratedPhotos.push(dataUrl);
    } catch {
      // Ignore conversion failures.
    }
  }
  const photos = [...new Set(hydratedPhotos)];
  if (photos.length === 0) return { ...item, photos: [] };
  return { ...item, photo: photos[0], photos };
}

async function hydrateItemsWithPhotos(items) {
  return Promise.all(items.map((item) => hydrateItemPhoto(item)));
}

async function ensureBlobBackedPhoto(item) {
  const normalized = normalizeItemForStorage(item);
  const inlinePhotos = getInlinePhotos(normalized);
  const existingIds = getPhotoIds(normalized);

  if (!hasPhotosStore()) {
    const firstInline = inlinePhotos[0] || null;
    return {
      ...normalized,
      photo: firstInline,
      photos: inlinePhotos,
      photoId: undefined,
      photoIds: undefined,
    };
  }

  const uploadedIds = [];
  const fallbackInlinePhotos = [];
  for (const photo of inlinePhotos) {
    try {
      const blob = await dataUrlToBlob(photo);
      const photoId = await putPhotoBlob(blob, blob.type);
      if (photoId) {
        uploadedIds.push(photoId);
      } else {
        fallbackInlinePhotos.push(photo);
      }
    } catch {
      fallbackInlinePhotos.push(photo);
    }
  }

  const photoIds = [...new Set([...existingIds, ...uploadedIds])];
  const firstPhotoId = photoIds[0] || null;
  const firstInline = fallbackInlinePhotos[0] || null;

  return {
    ...normalized,
    photo: firstInline,
    photos: fallbackInlinePhotos.length > 0 ? fallbackInlinePhotos : undefined,
    photoId: firstPhotoId,
    photoIds: photoIds.length > 0 ? photoIds : undefined,
  };
}

// ── Bins ──

async function getAllBins() {
  await open();
  if (readCache.bins) return readCache.bins;
  const bins = await req(tx('bins', 'readonly').getAll());
  readCache.bins = bins;
  return bins;
}

async function getBin(id) {
  await open();
  return req(tx('bins', 'readonly').get(id));
}

async function putBin(bin) {
  await open();
  const existing = bin && bin.id ? await req(tx('bins', 'readonly').get(bin.id)) : null;
  const nowIso = new Date().toISOString();
  const normalized = normalizeBinForStorage({
    ...bin,
    lastModifiedAt: nowIso,
  }, existing, nowIso);
  const result = await req(tx('bins', 'readwrite').put(normalized));
  bumpDataVersion();
  return result;
}

async function putBins(bins) {
  await open();
  const nowIso = new Date().toISOString();
  const ids = [...new Set((Array.isArray(bins) ? bins : [])
    .map((bin) => String(bin && bin.id ? bin.id : '').trim())
    .filter(Boolean))];
  const existingMap = new Map();
  if (ids.length > 0) {
    const existingBins = await Promise.all(ids.map((id) => req(tx('bins', 'readonly').get(id))));
    for (const existing of existingBins) {
      if (existing && existing.id) existingMap.set(existing.id, existing);
    }
  }

  const t = db.transaction('bins', 'readwrite');
  const store = t.objectStore('bins');
  for (const bin of bins) {
    const existing = bin && bin.id ? existingMap.get(bin.id) : null;
    store.put(normalizeBinForStorage(bin, existing, nowIso));
  }
  await txComplete(t);
  bumpDataVersion();
}

async function touchBins(binIds, modifiedAt = new Date().toISOString()) {
  await open();
  const normalizedIds = [...new Set((Array.isArray(binIds) ? binIds : [])
    .map((binId) => String(binId || '').trim())
    .filter(Boolean))];
  if (!normalizedIds.length) return 0;

  const t = db.transaction('bins', 'readwrite');
  const store = t.objectStore('bins');
  let updated = 0;
  for (const binId of normalizedIds) {
    const bin = await req(store.get(binId));
    if (!bin) continue;
    const existingMs = Date.parse(bin.lastModifiedAt || '');
    const nextMs = Date.parse(modifiedAt);
    if (Number.isFinite(existingMs) && Number.isFinite(nextMs) && existingMs >= nextMs) continue;
    store.put({ ...bin, lastModifiedAt: modifiedAt });
    updated++;
  }

  await txComplete(t);
  if (updated > 0) bumpDataVersion();
  return updated;
}

async function markBinsLabelPrinted(binIds, printedAt = new Date().toISOString()) {
  await open();
  const normalizedIds = [...new Set((Array.isArray(binIds) ? binIds : [])
    .map((binId) => String(binId || '').trim())
    .filter(Boolean))];
  if (!normalizedIds.length) return 0;

  const t = db.transaction('bins', 'readwrite');
  const store = t.objectStore('bins');
  let updated = 0;
  for (const binId of normalizedIds) {
    const bin = await req(store.get(binId));
    if (!bin) continue;
    if (bin.labelPrintedAt === printedAt) continue;
    store.put({ ...bin, labelPrintedAt: printedAt });
    updated++;
  }

  await txComplete(t);
  if (updated > 0) bumpDataVersion();
  return updated;
}

async function getItemsByBinRaw(binId) {
  await open();
  const store = tx('items', 'readonly');
  return req(store.index('binId').getAll(binId));
}

async function deleteBin(id) {
  await open();
  const items = await getItemsByBinRaw(id);
  const photoIds = [...new Set(items.flatMap((item) => [item.photoId, ...(Array.isArray(item.photoIds) ? item.photoIds : [])]).filter(Boolean))];

  const t = db.transaction(['bins', 'items'], 'readwrite');
  t.objectStore('bins').delete(id);
  if (items.length > 0) {
    const itemStore = t.objectStore('items');
    for (const item of items) itemStore.delete(item.id);
  }
  await txComplete(t);

  await Promise.all(photoIds.map((photoId) => deletePhotoIfUnused(photoId)));
  bumpDataVersion();
}

// ── Items ──

async function getAllItems() {
  await open();
  if (readCache.items) return readCache.items;
  const items = await req(tx('items', 'readonly').getAll());
  readCache.items = items;
  return items;
}

async function getAllItemsWithPhotos() {
  if (readCache.itemsWithPhotos) return readCache.itemsWithPhotos;
  const items = await getAllItems();
  const hydrated = await hydrateItemsWithPhotos(items);
  readCache.itemsWithPhotos = hydrated;
  for (const item of hydrated) {
    readCache.itemById.set(item.id, item);
  }
  return hydrated;
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
  if (readCache.itemById.has(id)) return readCache.itemById.get(id);
  const item = await req(tx('items', 'readonly').get(id));
  const hydrated = await hydrateItemPhoto(item);
  if (hydrated) readCache.itemById.set(id, hydrated);
  return hydrated;
}

async function getItemsByBin(binId) {
  if (readCache.itemsByBin.has(binId)) return readCache.itemsByBin.get(binId);
  const items = await getItemsByBinRaw(binId);
  const hydrated = await hydrateItemsWithPhotos(items);
  readCache.itemsByBin.set(binId, hydrated);
  for (const item of hydrated) {
    readCache.itemById.set(item.id, item);
  }
  return hydrated;
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
  const existing = item && item.id ? await req(tx('items', 'readonly').get(item.id)) : null;
  const itemForStorage = await ensureBlobBackedPhoto(item);
  const result = await req(tx('items', 'readwrite').put(itemForStorage));
  const touchedBinIds = new Set([itemForStorage.binId]);
  if (existing && existing.binId) touchedBinIds.add(existing.binId);
  await touchBins([...touchedBinIds]);
  if (existing) {
    const oldPhotoIds = [...new Set([existing.photoId, ...(Array.isArray(existing.photoIds) ? existing.photoIds : [])].filter(Boolean))];
    await Promise.all(oldPhotoIds.map((photoId) => deletePhotoIfUnused(photoId)));
  }
  bumpDataVersion();
  return result;
}

async function updateItemTags(itemIds, options = {}) {
  await open();
  const normalizedIds = [...new Set(
    (Array.isArray(itemIds) ? itemIds : [])
      .map((itemId) => String(itemId || '').trim())
      .filter(Boolean)
  )];
  const tagsToAdd = normalizeTagList(options.add);
  const tagsToRemove = normalizeTagList(options.remove);

  if (!normalizedIds.length || (!tagsToAdd.length && !tagsToRemove.length)) {
    return 0;
  }

  const existingItems = await Promise.all(
    normalizedIds.map((itemId) => req(tx('items', 'readonly').get(itemId)))
  );
  const updatedItems = existingItems
    .filter(Boolean)
    .map((item) => {
      const nextTags = removeTags(mergeTags(item.tags, tagsToAdd), tagsToRemove);
      const currentTags = normalizeTagList(item.tags);
      if (nextTags.length === currentTags.length && nextTags.every((tag, index) => tag === currentTags[index])) {
	return null;
      }
      return {
	...item,
	tags: nextTags,
      };
    })
    .filter(Boolean);

  if (!updatedItems.length) return 0;

  const t = db.transaction('items', 'readwrite');
  const store = t.objectStore('items');
  for (const item of updatedItems) {
    store.put(normalizeItemForStorage(item));
  }
  await txComplete(t);
  await touchBins([...new Set(updatedItems.map((item) => item.binId))]);
  bumpDataVersion();
  return updatedItems.length;
}

async function moveItemsToBin(itemIds, targetBinId) {
  await open();
  const normalizedIds = [...new Set((Array.isArray(itemIds) ? itemIds : [])
    .map((itemId) => String(itemId || '').trim())
    .filter(Boolean))];
  const safeTargetBinId = String(targetBinId || '').trim();

  if (!safeTargetBinId || normalizedIds.length === 0) return 0;

  const t = db.transaction('items', 'readwrite');
  const store = t.objectStore('items');
  let movedCount = 0;
  const touchedBinIds = new Set([safeTargetBinId]);

  for (const itemId of normalizedIds) {
    const item = await req(store.get(itemId));
    if (!item || item.binId === safeTargetBinId) continue;
    store.put({
      ...item,
      binId: safeTargetBinId,
    });
    touchedBinIds.add(item.binId);
    movedCount++;
  }

  await txComplete(t);
  if (movedCount > 0) {
    await touchBins([...touchedBinIds]);
    bumpDataVersion();
  }
  return movedCount;
}

async function deleteItem(id) {
  await open();
  const item = await req(tx('items', 'readonly').get(id));
  await req(tx('items', 'readwrite').delete(id));
  if (item && item.binId) {
    await touchBins([item.binId]);
  }
  if (item) {
    const photoIds = [...new Set([item.photoId, ...(Array.isArray(item.photoIds) ? item.photoIds : [])].filter(Boolean))];
    await Promise.all(photoIds.map((photoId) => deletePhotoIfUnused(photoId)));
  }
  bumpDataVersion();
}

// ── Tags ──

async function getAllTags() {
  await open();
  if (readCache.tags) return readCache.tags;
  const store = tx('items', 'readonly');
  if (store.indexNames.contains('tags')) {
    return new Promise((resolve, reject) => {
      const tags = new Set();
      const cursor = store.index('tags').openKeyCursor();
      cursor.onsuccess = (e) => {
        const c = e.target.result;
        if (c) {
          tags.add(c.key);
          c.continue();
        } else {
          const sorted = [...tags].sort();
          readCache.tags = sorted;
          resolve(sorted);
        }
      };
      cursor.onerror = () => reject(cursor.error);
    });
  }
  const items = await req(store.getAll());
  const tags = new Set();
  for (const item of items) {
    for (const tag of normalizeTags(item.tags)) tags.add(tag);
  }
  const sorted = [...tags].sort();
  readCache.tags = sorted;
  return sorted;
}

// ── Counts ──

async function getCounts() {
  await open();
  if (readCache.counts) return readCache.counts;
  const bins = await req(tx('bins', 'readonly').count());
  const items = await req(tx('items', 'readonly').count());
  const counts = { bins, items };
  readCache.counts = counts;
  return counts;
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
    const photos = getInlinePhotos(exportItem);
    const photoIds = getPhotoIds(exportItem);
    if (photoIds.length > 0) {
      for (const photoId of photoIds) {
        const photoRecord = await getPhotoRecord(photoId);
        if (!photoRecord || !photoRecord.blob) continue;
        try {
          photos.push(await blobToDataUrl(photoRecord.blob));
        } catch {
          // Ignore conversion errors and export without this photo.
        }
      }
    }
    const dedupedPhotos = [...new Set(photos)];
    if (dedupedPhotos.length > 0) {
      exportItem.photo = dedupedPhotos[0];
      exportItem.photos = dedupedPhotos;
    } else {
      delete exportItem.photo;
      delete exportItem.photos;
    }
    delete exportItem.photoId;
    delete exportItem.photoIds;
    exportItems.push(exportItem);
  }

  return { version: 1, bins, items: exportItems, exportedAt: new Date().toISOString() };
}

// ── Import ──

async function importAll(data, mode) {
  await open();

  const photoRecords = [];
  const preparedItems = [];
  const inlineCleanupItems = [];
  for (const item of data.items || []) {
    const normalized = normalizeItemForStorage(item);
    const incomingPhotos = getInlinePhotos(normalized);
    if ((!incomingPhotos.length && !normalized.photoId && !Array.isArray(normalized.photoIds)) || !hasPhotosStore()) {
      preparedItems.push(normalized);
      continue;
    }

    const mergedPhotoIds = getPhotoIds(normalized);
    const fallbackInlinePhotos = [];

    for (const photo of incomingPhotos) {
      try {
        const blob = await dataUrlToBlob(photo);
        const photoId = crypto.randomUUID();
        photoRecords.push({
          id: photoId,
          blob,
          mimeType: blob.type || 'application/octet-stream',
          createdAt: new Date().toISOString(),
        });
        mergedPhotoIds.push(photoId);
      } catch {
        fallbackInlinePhotos.push(photo);
      }
    }

    const uniquePhotoIds = [...new Set(mergedPhotoIds)];
    const preparedItem = {
      ...normalized,
      // Keep inline photo data until blob persistence succeeds so imports still
      // render correctly on devices that fail to write the photo store.
      photo: incomingPhotos[0] || null,
      photos: incomingPhotos.length > 0 ? incomingPhotos : undefined,
      photoId: uniquePhotoIds[0] || null,
      photoIds: uniquePhotoIds.length > 0 ? uniquePhotoIds : undefined,
    };
    preparedItems.push(preparedItem);

    if (incomingPhotos.length > 0 && fallbackInlinePhotos.length === 0 && uniquePhotoIds.length > 0) {
      inlineCleanupItems.push({
        ...preparedItem,
        photo: null,
        photos: undefined,
      });
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
  bumpDataVersion();

  // Store photo blobs in a separate transaction so failures here don't
  // roll back the bins/items saved above.
  let photosFailed = false;
  if (hasPhotosStore() && photoRecords.length > 0) {
    try {
      const pt = db.transaction('photos', 'readwrite');
      const photoStore = pt.objectStore('photos');
      for (const photo of photoRecords) photoStore.put(photo);
      await txComplete(pt);

      if (inlineCleanupItems.length > 0) {
        const it = db.transaction('items', 'readwrite');
        const itemStore = it.objectStore('items');
        for (const item of inlineCleanupItems) itemStore.put(item);
        await txComplete(it);
      }
    } catch {
      // Photos failed to persist — items still reference their photoIds so
      // keep inline image data in place so the photos still render.
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
  getAllItemsWithPhotos,
  getAllItemsLight,
  getItem,
  getItemsByBin,
  getItemsByTag,
  putItem,
  updateItemTags,
  moveItemsToBin,
  deleteItem,
  getCounts,
  getNextBinNumber,
  exportAll,
  importAll,
  getAllTags,
  getDataVersion,
  touchBins,
  markBinsLabelPrinted,
};
