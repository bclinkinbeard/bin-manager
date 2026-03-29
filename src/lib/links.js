function normalizeUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

function parseLinks(input) {
  const lines = String(input || '')
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);
  return [...new Set(lines.map((line) => normalizeUrl(line)).filter(Boolean))];
}

function isTweetUrl(url) {
  const normalized = normalizeUrl(url);
  if (!normalized) return false;
  try {
    const parsed = new URL(normalized);
    const host = parsed.hostname.toLowerCase();
    const isX = host === 'x.com' || host.endsWith('.x.com');
    const isTwitter = host === 'twitter.com' || host.endsWith('.twitter.com');
    if (!isX && !isTwitter) return false;
    return /^\/[^/]+\/status\/\d+/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

export { normalizeUrl, parseLinks, isTweetUrl };
