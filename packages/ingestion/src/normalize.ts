import { createHash } from 'node:crypto';
const tracking = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
]);
export function normalizeUrl(original: string, base?: string): string {
  const url = new URL(original, base);
  url.hash = '';
  url.hostname = url.hostname.toLowerCase();
  for (const key of [...url.searchParams.keys()])
    if (tracking.has(key.toLowerCase())) url.searchParams.delete(key);
  if (
    (url.protocol === 'http:' && url.port === '80') ||
    (url.protocol === 'https:' && url.port === '443')
  )
    url.port = '';
  if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString();
}
export function normalizeText(value?: string): string {
  if (!value) return '';
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
export const sha256 = (value: string) =>
  createHash('sha256').update(value, 'utf8').digest('hex');
export function articleHashes(
  originalUrl: string,
  text: string,
  base?: string,
) {
  const canonicalUrl = normalizeUrl(originalUrl, base);
  return {
    canonicalUrl,
    urlHash: sha256(canonicalUrl),
    contentHash: sha256(normalizeText(text)),
  };
}
