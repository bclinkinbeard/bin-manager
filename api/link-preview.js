import { badRequest, jsonResponse, serverError } from '../server/json.js';

const MAX_BYTES = 300_000;

function normalizeUrl(value) {
  const raw = String(value || '').trim();
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

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function normalizeWhitespace(value) {
  return decodeHtml(String(value || '').replace(/\s+/g, ' ')).trim();
}

function pickMeta(html, key) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const attrPattern = `(?:property|name)\\s*=\\s*["']${escapedKey}["']`;
  const contentPattern = 'content\\s*=\\s*["\']([^"\']+)["\']';
  const regex = new RegExp(`<meta[^>]+${attrPattern}[^>]+${contentPattern}[^>]*>`, 'i');
  const match = html.match(regex);
  return match ? normalizeWhitespace(match[1]) : '';
}

function pickTitle(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? normalizeWhitespace(match[1]) : '';
}

function extractPreview(html) {
  const title = pickMeta(html, 'og:title')
    || pickMeta(html, 'twitter:title')
    || pickTitle(html);
  const summary = pickMeta(html, 'og:description')
    || pickMeta(html, 'twitter:description')
    || pickMeta(html, 'description');
  const siteName = pickMeta(html, 'og:site_name');
  return { title, summary, siteName };
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const normalizedUrl = normalizeUrl(searchParams.get('url') || '');
    if (!normalizedUrl) {
      return badRequest('A valid http(s) url query parameter is required.');
    }

    const response = await fetch(normalizedUrl, {
      headers: {
        'user-agent': 'BinManager Link Preview/1.0',
        accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!response.ok) {
      return jsonResponse({ ok: false, error: `Unable to fetch URL (${response.status}).` }, { status: 502 });
    }

    const contentType = response.headers.get('content-type') || '';
    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      return jsonResponse({
        ok: true,
        preview: {
          title: normalizedUrl,
          summary: '',
          siteName: new URL(normalizedUrl).hostname,
        },
      });
    }

    const html = (await response.text()).slice(0, MAX_BYTES);
    const preview = extractPreview(html);
    if (!preview.title) {
      preview.title = normalizedUrl;
    }

    return jsonResponse({ ok: true, preview });
  } catch (error) {
    return serverError(error?.message || 'Failed to build link preview.');
  }
}
