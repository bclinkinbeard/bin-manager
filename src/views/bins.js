function createBinsView({ db, $, esc, formatBinId, openBin, openBinForm }) {
  function buildInventoryPrintHtml(inventoryBins) {
    const pages = inventoryBins
      .map(({ bin, items }, index) => {
        const itemMarkup = items.length
          ? `<ol class="inventory-list">${items.map((item) => `<li>${esc(item.description || 'Unnamed item')}</li>`).join('')}</ol>`
          : '<p class="inventory-empty">No items in this bin.</p>';

        return `
          <section class="inventory-page ${index < inventoryBins.length - 1 ? 'inventory-page-break' : ''}">
            <h1>${esc(bin.name || bin.id)}</h1>
            <p class="inventory-bin-id">${esc(bin.id)}</p>
            ${itemMarkup}
          </section>
        `;
      })
      .join('');

    return `<!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <title>Bin Inventory</title>
          <style>
            @page { size: auto; margin: 0.5in; }
            * { box-sizing: border-box; }
            body {
              margin: 0;
              color: #000;
              font-family: Arial, Helvetica, sans-serif;
            }
            .inventory-page {
              width: 100%;
              min-height: calc(100vh - 1in);
            }
            .inventory-page-break {
              page-break-after: always;
              break-after: page;
            }
            h1 {
              margin: 0 0 0.1in;
              font-size: 42px;
              line-height: 1.1;
              text-transform: uppercase;
            }
            .inventory-bin-id {
              margin: 0 0 0.35in;
              font-size: 26px;
              font-weight: 700;
            }
            .inventory-list {
              margin: 0;
              padding-left: 0.4in;
              font-size: 28px;
              line-height: 1.35;
            }
            .inventory-list li {
              margin: 0 0 0.16in;
            }
            .inventory-empty {
              margin: 0;
              font-size: 28px;
              font-style: italic;
            }
          </style>
        </head>
        <body>
          ${pages}
          <script>
            window.addEventListener('load', () => {
              window.print();
              window.close();
            });
          </script>
        </body>
      </html>`;
  }

  async function printInventory() {
    const bins = (await db.getAllBins()).filter((b) => !b.archived);
    const inventoryBins = await Promise.all(
      bins.map(async (bin) => ({
        bin,
        items: (await db.getItemsByBin(bin.id))
          .slice()
          .sort((a, b) => (a.description || '').localeCompare(b.description || '')),
      }))
    );

    const printWindow = window.open('', '_blank', 'noopener,noreferrer');
    if (!printWindow) {
      window.alert('Unable to open print preview. Please allow pop-ups and try again.');
      return;
    }

    printWindow.document.open();
    printWindow.document.write(buildInventoryPrintHtml(inventoryBins));
    printWindow.document.close();
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
