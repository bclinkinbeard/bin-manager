function createItemFormView({
  db,
  $,
  esc,
  formatBinId,
  parseTags,
  showView,
  openBin,
  refreshSearch,
  refreshStats,
  showToast,
  compressImage,
  getCurrentBinId,
  setCurrentBinId,
  getCurrentPhoto,
  setCurrentPhoto,
  getCurrentPhotoId,
  setCurrentPhotoId,
  getCurrentEditItemId,
  setCurrentEditItemId,
}) {
  let currentPhotos = [];

  async function populateBinSelector(selectedBinId) {
    const bins = (await db.getAllBins()).filter((b) => !b.archived);
    const select = $('item-form-bin');
    select.innerHTML = bins
      .map(
        (b) =>
          `<option value="${esc(b.id)}"${b.id === selectedBinId ? ' selected' : ''}>${esc(b.id)}${b.name ? ' — ' + esc(b.name) : ''}</option>`
      )
      .join('');
    $('item-form-bin-group').style.display = selectedBinId ? 'none' : 'block';
  }

  function updatePhotoUiForMode(isEditing) {
    const preview = $('item-photo-preview');
    if (isEditing) {
      preview.classList.add('is-editing');
    } else {
      preview.classList.remove('is-editing');
    }
  }

  function setPhotos(nextPhotos) {
    currentPhotos = (Array.isArray(nextPhotos) ? nextPhotos : []).filter((photo) => typeof photo === 'string' && photo.startsWith('data:image/'));
    const firstPhoto = currentPhotos[0] || null;
    setCurrentPhoto(firstPhoto);
    setCurrentPhotoId(null);

    const preview = $('item-photo-preview');
    const previewFrame = $('item-photo-preview-frame');
    if (firstPhoto) {
      preview.src = firstPhoto;
      preview.style.display = 'block';
      previewFrame.style.display = 'block';
    } else {
      preview.removeAttribute('src');
      preview.style.display = 'none';
      previewFrame.style.display = 'none';
    }

    const gallery = $('item-photo-gallery');
    gallery.innerHTML = currentPhotos.slice(1).map((photo, index) => `
      <div class="photo-gallery-item">
        <img src="${esc(photo)}" class="photo-gallery-thumb" alt="Additional item photo ${index + 2}" role="button" tabindex="0" data-photo-index="${index + 1}">
        <button class="photo-delete-icon photo-gallery-delete" data-delete-index="${index + 1}" type="button" aria-label="Delete additional photo ${index + 2}">&times;</button>
      </div>
    `).join('');

    gallery.querySelectorAll('[data-photo-index]').forEach((img) => {
      const open = () => window.open(currentPhotos[Number(img.dataset.photoIndex)], '_blank', 'noopener,noreferrer');
      img.addEventListener('click', open);
      img.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      });
    });

    gallery.querySelectorAll('[data-delete-index]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.deleteIndex);
        const next = currentPhotos.filter((_, i) => i !== idx);
        setPhotos(next);
      });
    });
  }

  function readFilesAsDataUrls(fileList) {
    const files = Array.from(fileList || []).filter((file) => file && /^image\//.test(file.type));
    return Promise.all(files.map((file) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (ev) => resolve(ev.target.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    })));
  }

  async function openAddItemForm(preselectedBinId, options = {}) {
    const { syncUrl = true } = options;
    setCurrentPhoto(null);
    setCurrentPhotoId(null);
    setCurrentEditItemId(null);
    $('item-form-desc').value = '';
    $('item-form-tags').value = '';
    $('item-form-title').textContent = 'Add Item';
    updatePhotoUiForMode(false);
    setPhotos([]);
    await populateBinSelector(preselectedBinId);
    showView('itemForm', { syncUrl });
  }

  async function openEditItemForm(itemId, options = {}) {
    const { syncUrl = true } = options;
    const item = await db.getItem(itemId);
    if (!item) return;
    setCurrentEditItemId(itemId);
    $('item-form-desc').value = item.description || '';
    $('item-form-tags').value = (item.tags || []).join(', ');
    $('item-form-title').textContent = 'Edit Item';
    updatePhotoUiForMode(true);

    const itemPhotos = Array.isArray(item.photos)
      ? item.photos
      : (item.photo && item.photo.startsWith('data:image/') ? [item.photo] : []);
    setPhotos(itemPhotos);

    await populateBinSelector(item.binId);
    showView('itemForm', { syncUrl });
  }

  function wireItemFormEvents() {
    $('item-form-back').addEventListener('click', () => {
      setCurrentPhoto(null);
      setCurrentPhotoId(null);
      setPhotos([]);
      if (getCurrentBinId()) {
        openBin(getCurrentBinId());
      } else {
        showView('search');
        refreshSearch();
      }
    });

    $('item-photo-btn').addEventListener('click', () => $('item-photo-input').click());

    $('item-photo-input').addEventListener('change', async (e) => {
      const incoming = await readFilesAsDataUrls(e.target.files);
      if (!incoming.length) return;
      const normalizedIncoming = typeof compressImage === 'function'
        ? await Promise.all(incoming.map((photo) => compressImage(photo)))
        : incoming;
      setPhotos([...currentPhotos, ...normalizedIncoming]);
      e.target.value = '';
    });

    $('item-photo-delete').addEventListener('click', () => {
      if (!currentPhotos.length) return;
      setPhotos(currentPhotos.slice(1));
    });

    $('item-photo-preview').addEventListener('click', () => {
      const src = $('item-photo-preview').src;
      if (!src) return;
      window.open(src, '_blank', 'noopener,noreferrer');
    });

    $('item-form-save').addEventListener('click', async () => {
      const desc = $('item-form-desc').value.trim();
      const hasPhoto = currentPhotos.length > 0;
      if (!desc && !hasPhoto) return;

      const tags = parseTags($('item-form-tags').value.trim());
      if (!desc && !tags.length) {
        tags.push('unlabeled');
      }
      const currentEditId = getCurrentEditItemId();
      const itemId = currentEditId || crypto.randomUUID();
      let addedAt = new Date().toISOString();

      if (currentEditId) {
        const existing = await db.getItem(currentEditId);
        if (existing) {
          addedAt = existing.addedAt;
        }
      }

      const binId = $('item-form-bin').value || getCurrentBinId();
      await db.putItem({
        id: itemId,
        binId,
        description: desc || 'Unlabeled item',
        photo: currentPhotos[0] || null,
        photos: currentPhotos,
        photoId: getCurrentPhotoId(),
        tags,
        addedAt,
      });
      setCurrentPhoto(null);
      setCurrentPhotoId(null);
      setCurrentEditItemId(null);
      setPhotos([]);
      await refreshStats();
      openBin(binId);
    });

    $('search-add-item').addEventListener('click', async () => {
      const bins = (await db.getAllBins()).filter((b) => !b.archived);
      if (bins.length === 0) {
        const next = await db.getNextBinNumber();
        const newBin = {
          id: formatBinId(next),
          name: '',
          location: '',
          description: '',
          createdAt: new Date().toISOString(),
          archived: false,
        };
        await db.putBin(newBin);
        await refreshStats();
        showToast(`Created ${newBin.id}`, 'success');
        setCurrentBinId(newBin.id);
        openAddItemForm(newBin.id);
        return;
      }
      setCurrentBinId(null);
      openAddItemForm(null);
    });
  }

  wireItemFormEvents();

  return {
    openAddItemForm,
    openEditItemForm,
  };
}

export { createItemFormView };
