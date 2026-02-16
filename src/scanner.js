let scanner = null;

function start(elementId, onResult) {
  if (scanner) return Promise.resolve();
  scanner = new Html5Qrcode(elementId);
  return scanner.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: { width: 250, height: 250 } },
    (text) => onResult(text),
    () => {}
  );
}

function stop() {
  if (!scanner) return Promise.resolve();
  const s = scanner;
  scanner = null;
  return s.stop().then(() => s.clear()).catch(() => {});
}

export { start, stop };
