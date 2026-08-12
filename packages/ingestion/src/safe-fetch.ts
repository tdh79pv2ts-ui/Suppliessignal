import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import { IngestionError } from './types.js';
type Resolver = (hostname: string) => Promise<string[]>;
type Fetcher = typeof fetch;
const blockedV4 = (address: string) => {
  const p = address.split('.').map(Number);
  return (
    p[0] === 10 ||
    p[0] === 127 ||
    (p[0] === 169 && p[1] === 254) ||
    (p[0] === 172 && p[1]! >= 16 && p[1]! <= 31) ||
    (p[0] === 192 && p[1] === 168) ||
    (p[0] === 100 && p[1]! >= 64 && p[1]! <= 127) ||
    p[0] === 0
  );
};
export function isUnsafeAddress(address: string): boolean {
  if (isIP(address) === 4) return blockedV4(address);
  const normalized = address.toLowerCase();
  return (
    normalized === '::1' ||
    normalized === '::' ||
    normalized.startsWith('fe80:') ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('::ffff:127.') ||
    normalized.startsWith('::ffff:10.') ||
    normalized.startsWith('::ffff:192.168.')
  );
}
async function defaultResolver(hostname: string) {
  if (isIP(hostname)) return [hostname];
  return (await lookup(hostname, { all: true })).map((item) => item.address);
}
export async function assertSafeUrl(
  value: string,
  resolver: Resolver = defaultResolver,
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new IngestionError('INVALID_SOURCE_URL', 'Source URL is invalid');
  }
  if (!['http:', 'https:'].includes(url.protocol))
    throw new IngestionError(
      'INVALID_SOURCE_URL',
      'Only HTTP and HTTPS are allowed',
    );
  const addresses = await resolver(url.hostname);
  if (!addresses.length || addresses.some(isUnsafeAddress))
    throw new IngestionError(
      'UNSAFE_SOURCE_URL',
      'Destination is private or internal',
    );
  return url;
}
export async function safeFetch(
  value: string,
  options: {
    fetcher?: Fetcher;
    resolver?: Resolver;
    timeoutMs?: number;
    maxBytes?: number;
    maxRedirects?: number;
  } = {},
): Promise<string> {
  const fetcher = options.fetcher ?? fetch;
  const resolver = options.resolver ?? defaultResolver;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const maxBytes = options.maxBytes ?? 2_000_000;
  const maxRedirects = options.maxRedirects ?? 3;
  let current = value;
  for (let redirects = 0; redirects <= maxRedirects; redirects++) {
    await assertSafeUrl(current, resolver);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetcher(current, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'user-agent':
            'SupplySignalCollector/1.0 (+https://suppliesignal.local)',
        },
      });
    } catch {
      throw new IngestionError(
        'COLLECTION_FAILED',
        'Source request failed or timed out',
      );
    } finally {
      clearTimeout(timer);
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location || redirects === maxRedirects)
        throw new IngestionError(
          'COLLECTION_FAILED',
          'Redirect limit exceeded',
        );
      current = new URL(location, current).toString();
      continue;
    }
    if (!response.ok)
      throw new IngestionError(
        'COLLECTION_FAILED',
        `Source returned HTTP ${response.status}`,
      );
    const length = Number(response.headers.get('content-length') ?? 0);
    if (length > maxBytes)
      throw new IngestionError(
        'RESPONSE_TOO_LARGE',
        'Source response exceeds maximum size',
      );
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes)
      throw new IngestionError(
        'RESPONSE_TOO_LARGE',
        'Source response exceeds maximum size',
      );
    return new TextDecoder().decode(bytes);
  }
  throw new IngestionError('COLLECTION_FAILED', 'Redirect limit exceeded');
}
