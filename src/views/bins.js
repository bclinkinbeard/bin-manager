import { isBinLabelOutdated } from '../lib/label-status.js';

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
        <div class="label-state">${isBinLabelOutdated(b) ? 'Needs reprint' : 'Up to date'}</div>
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

    $('bins-print').addEventListener('click', async () => {
      const ids = (await db.getAllBins()).filter((b) => !b.archived).map((b) => b.id);
      if (ids.length > 0) {
        await db.markBinsLabelPrinted(ids);
      }
      window.print();
      await renderBins();
    });

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
