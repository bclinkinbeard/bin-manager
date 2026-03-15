function createBinsView({ db, $, esc, formatBinId, openBin, openBinForm }) {
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

  async function printInventory() {
    const bins = (await db.getAllBins()).filter((b) => !b.archived);
    const container = document.getElementById('inventory-print');

    const sections = await Promise.all(
      bins.map(async (bin) => {
        const items = await db.getItemsByBin(bin.id);
        const heading = [bin.id, bin.name].filter(Boolean).join(' — ');
        const rows = items.length
          ? items.map((it) => `<li>${esc(it.description)}</li>`).join('')
          : '<li class="inventory-empty">No items</li>';
        return `<div class="inventory-bin">
  <h1 class="inventory-bin-heading">${esc(heading)}</h1>
  <ul class="inventory-item-list">${rows}</ul>
</div>`;
      })
    );

    container.innerHTML = sections.join('');
    document.body.classList.add('printing-inventory');

    const cleanup = () => {
      document.body.classList.remove('printing-inventory');
      container.innerHTML = '';
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);

    window.print();
  }

  function wireBinsEvents() {
    $('bins-grid').addEventListener('click', (e) => {
      const card = e.target.closest('[data-bin-id]');
      if (card) openBin(card.dataset.binId);
    });

    $('bins-print').addEventListener('click', () => window.print());

    $('bins-print-inventory').addEventListener('click', () => printInventory());

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
