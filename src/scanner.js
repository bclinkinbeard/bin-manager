let scanner = null;
let started = false;
let starting = false;

function start(elementId, onResult) {
  if (scanner && started) return Promise.resolve();
  if (starting) return Promise.resolve();
  starting = true;
  if (!scanner) scanner = new Html5Qrcode(elementId);
  return scanner.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: { width: 250, height: 250 } },
    (text) => {
      if (!started) return; // guard against callbacks after stop
      onResult(text);
    },
    () => {}
  ).then(() => {
    started = true;
    starting = false;
  }).catch((err) => {
    try { scanner.clear(); } catch (_) {}
    scanner = null;
    started = false;
    starting = false;
    throw err;
  });
}

function stop() {
  if (!scanner) { starting = false; return Promise.resolve(); }
  const s = scanner;
  scanner = null;
  const wasStarted = started;
  started = false;
  starting = false;
  if (!wasStarted) {
    try { s.clear(); } catch (_) {}
    return Promise.resolve();
  }
  return s.stop().then(() => s.clear()).catch(() => {
    try { s.clear(); } catch (_) {}
  });
}

export { start, stop };
