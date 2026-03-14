function createBinsView({ db, $, esc, formatBinId, openBin, openBinForm }) {
  function ensureInventoryPrintRoot() {
    let root = document.getElementById('inventory-print-root');
    if (root) return root;

    root = document.createElement('div');
    root.id = 'inventory-print-root';
    root.className = 'inventory-print-root';
    document.body.append(root);
    return root;
  }

  function buildInventoryPrintMarkup(inventoryBins) {
    if (inventoryBins.length === 0) {
      return `
        <section class="inventory-print-page">
          <h1 class="inventory-print-title">No bins to print</h1>
        </section>
      `;
    }

    return inventoryBins
      .map(({ bin, items }, index) => {
        const itemMarkup = items.length
          ? `<ol class="inventory-print-list">${items
            .map((item) => `<li>${esc(item.description || 'Unnamed item')}</li>`)
            .join('')}</ol>`
          : '<p class="inventory-print-empty">No items in this bin.</p>';

        return `
          <section class="inventory-print-page ${index < inventoryBins.length - 1 ? 'inventory-print-page-break' : ''}">
            <h1 class="inventory-print-title">${esc(bin.name || bin.id)}</h1>
            <p class="inventory-print-bin-id">${esc(bin.id)}</p>
            ${itemMarkup}
          </section>
        `;
      })
      .join('');
  }

  async function printInventory() {
    const bins = (await db.getAllBins())
      .filter((b) => !b.archived)
      .sort((a, b) => (a.id || '').localeCompare(b.id || ''));

    const inventoryBins = await Promise.all(
      bins.map(async (bin) => ({
        bin,
        items: (await db.getItemsByBin(bin.id))
          .slice()
          .sort((a, b) => (a.description || '').localeCompare(b.description || '')),
      }))
    );

    const printRoot = ensureInventoryPrintRoot();
    printRoot.innerHTML = buildInventoryPrintMarkup(inventoryBins);

    const cleanup = () => {
      document.body.classList.remove('inventory-print-active');
      printRoot.innerHTML = '';
      window.removeEventListener('afterprint', cleanup);
    };

    window.addEventListener('afterprint', cleanup, { once: true });
    document.body.classList.add('inventory-print-active');
    window.setTimeout(() => window.print(), 0);
  }

  async function renderBins() {
    const bins = (await db.getAllBins()).filter((b) => !b.archived);
    const grid = $('bins-grid');

    if (bins.length === 0) {
      grid.innerHTML = '<div class="empty-state">No bins yet. Tap + Add Bin to create one.</div>';
      return;
    }

    grid.innerHTML = bins
      .map(
        (b) => `
      <button class="label-card label-card-btn" data-bin-id="${esc(b.id)}">
        <canvas data-qr-id="${esc(b.id)}"></canvas>
        <div class="label-text">${esc(b.id)}</div>
        <div class="label-name">${esc(b.name || '')}</div>
      </button>`
      )
      .join('');

    const canvases = grid.querySelectorAll('canvas[data-qr-id]');
    await Promise.all(
      Array.from(canvases).map((canvas) =>
        QRCode.toCanvas(canvas, canvas.dataset.qrId, {
          width: 220,
          margin: 1,
          color: { dark: '#000000', light: '#ffffff' },
        }).catch((e) => console.error('QR generation failed for', canvas.dataset.qrId, e))
      )
    );
  }

  function wireBinsEvents() {
    $('bins-grid').addEventListener('click', (e) => {
      const card = e.target.closest('[data-bin-id]');
      if (card) openBin(card.dataset.binId);
    });

    $('bins-print').addEventListener('click', () => window.print());
    $('bins-print-inventory').addEventListener('click', printInventory);

    $('bins-add').addEventListener('click', async () => {
      const next = await db.getNextBinNumber();
      openBinForm(formatBinId(next), null);
    });
  }

  wireBinsEvents();

  return {
    renderBins,
  };
}

export { createBinsView };
