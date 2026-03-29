import { isTweetUrl, normalizeUrl } from './links.js';

const previewCache = new Map();

async function fetchLinkPreview(url) {
  const normalizedUrl = normalizeUrl(url);
  if (!normalizedUrl) return null;

  if (isTweetUrl(normalizedUrl)) {
    return {
      type: 'tweet',
      url: normalizedUrl,
    };
  }

  if (!previewCache.has(normalizedUrl)) {
    previewCache.set(normalizedUrl, (async () => {
      try {
        const response = await fetch(`/api/link-preview?url=${encodeURIComponent(normalizedUrl)}`);
        if (!response.ok) throw new Error(`Preview request failed: ${response.status}`);
        const payload = await response.json();
        if (!payload || payload.ok !== true || !payload.preview) return null;
        return {
          type: 'preview',
          url: normalizedUrl,
          title: payload.preview.title || '',
          summary: payload.preview.summary || '',
          siteName: payload.preview.siteName || '',
        };
      } catch {
        return {
          type: 'fallback',
          url: normalizedUrl,
          title: normalizedUrl,
          summary: '',
          siteName: '',
        };
      }
    })());
  }

  return previewCache.get(normalizedUrl);
}

function clearLinkPreviewCache() {
  previewCache.clear();
}

export { fetchLinkPreview, clearLinkPreviewCache };
