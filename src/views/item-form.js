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

  async function openAddItemForm(preselectedBinId, options = {}) {
    const { syncUrl = true } = options;
    setCurrentPhoto(null);
    setCurrentPhotoId(null);
    setCurrentEditItemId(null);
    $('item-form-desc').value = '';
    $('item-form-tags').value = '';
    $('item-photo-preview').style.display = 'none';
    $('item-form-title').textContent = 'Add Item';
    await populateBinSelector(preselectedBinId);
    showView('itemForm', { syncUrl });
  }

  async function openEditItemForm(itemId, options = {}) {
    const { syncUrl = true } = options;
    const item = await db.getItem(itemId);
    if (!item) return;
    setCurrentEditItemId(itemId);
    setCurrentPhoto(item.photo || null);
    setCurrentPhotoId(item.photoId || null);
    $('item-form-desc').value = item.description || '';
    $('item-form-tags').value = (item.tags || []).join(', ');
    if (item.photo && item.photo.startsWith('data:image/')) {
      $('item-photo-preview').src = item.photo;
      $('item-photo-preview').style.display = 'block';
    } else {
      $('item-photo-preview').style.display = 'none';
    }
    $('item-form-title').textContent = 'Edit Item';
    await populateBinSelector(item.binId);
    showView('itemForm', { syncUrl });
  }

  function wireItemFormEvents() {
    $('item-form-back').addEventListener('click', () => {
      setCurrentPhoto(null);
      setCurrentPhotoId(null);
      if (getCurrentBinId()) {
        openBin(getCurrentBinId());
      } else {
        showView('search');
        refreshSearch();
      }
    });

    $('item-photo-btn').addEventListener('click', () => $('item-photo-input').click());

    $('item-photo-input').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        compressImage(ev.target.result).then((compressed) => {
          setCurrentPhoto(compressed);
          setCurrentPhotoId(null);
          $('item-photo-preview').src = getCurrentPhoto();
          $('item-photo-preview').style.display = 'block';
        });
      };
      reader.readAsDataURL(file);
    });

    $('item-form-save').addEventListener('click', async () => {
      const desc = $('item-form-desc').value.trim();
      if (!desc) return;

      const tags = parseTags($('item-form-tags').value.trim());
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
        description: desc,
        photo: getCurrentPhoto(),
        photoId: getCurrentPhotoId(),
        tags,
        addedAt,
      });
      setCurrentPhoto(null);
      setCurrentPhotoId(null);
      setCurrentEditItemId(null);
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
