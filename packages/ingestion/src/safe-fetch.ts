import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { IngestionError } from './types.js';

type Resolver = (hostname: string) => Promise<string[]>;
type PinnedRequester = (
  url: URL,
  address: string,
  options: { signal: AbortSignal; maxBytes: number },
) => Promise<{
  status: number;
  location?: string;
  contentLength?: number;
  body: Uint8Array;
}>;

const ipv4Number = (address: string) => {
  const parts = address.split('.').map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  )
    return null;
  return parts.reduce((value, part) => value * 256 + part, 0) >>> 0;
};

const inV4Range = (value: number, base: number, prefix: number) =>
  prefix === 0 || (value >>> (32 - prefix)) === (base >>> (32 - prefix));

const blockedV4 = (address: string) => {
  const value = ipv4Number(address);
  if (value === null) return true;
  return [
    ['0.0.0.0', 8],
    ['10.0.0.0', 8],
    ['100.64.0.0', 10],
    ['127.0.0.0', 8],
    ['169.254.0.0', 16],
    ['172.16.0.0', 12],
    ['192.168.0.0', 16],
  ].some(([base, prefix]) =>
    inV4Range(value, ipv4Number(base as string)!, prefix as number),
  );
};

const ipv6Number = (address: string): bigint | null => {
  let normalized = address.toLowerCase().split('%')[0]!;
  const dotted = normalized.match(/(?:^|:)(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (dotted) {
    const value = ipv4Number(dotted);
    if (value === null) return null;
    normalized = normalized.slice(0, -dotted.length) +
      `${(value >>> 16).toString(16)}:${(value & 0xffff).toString(16)}`;
  }
  const halves = normalized.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves[1] ? halves[1].split(':') : [];
  const omitted = 8 - left.length - right.length;
  if (omitted < 0 || (halves.length === 1 && omitted !== 0)) return null;
  const parts = [...left, ...Array(omitted).fill('0'), ...right];
  if (parts.length !== 8 || parts.some((part) => !/^[0-9a-f]{1,4}$/.test(part)))
    return null;
  return parts.reduce((value, part) => (value << 16n) + BigInt(`0x${part}`), 0n);
};

export function isUnsafeAddress(address: string): boolean {
  if (isIP(address) === 4) return blockedV4(address);
  if (isIP(address) !== 6) return true;
  const value = ipv6Number(address);
  if (value === null) return true;
  if (value === 0n || value === 1n) return true;
  if (value >> 121n === 0x7en) return true; // fc00::/7
  if (value >> 118n === 0x3fan) return true; // fe80::/10
  if (value >> 32n === 0xffffn) {
    const mapped = Number(value & 0xffffffffn);
    const addressV4 = [24, 16, 8, 0]
      .map((shift) => (mapped >>> shift) & 255)
      .join('.');
    return blockedV4(addressV4);
  }
  return false;
}

async function defaultResolver(hostname: string) {
  if (isIP(hostname)) return [hostname];
  return (await lookup(hostname, { all: true })).map((item) => item.address);
}

async function resolveSafeUrl(value: string, resolver: Resolver) {
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
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = await resolver(hostname);
  if (!addresses.length || addresses.some(isUnsafeAddress))
    throw new IngestionError(
      'UNSAFE_SOURCE_URL',
      'Destination is private or internal',
    );
  return { url, address: addresses[0]! };
}

export async function assertSafeUrl(
  value: string,
  resolver: Resolver = defaultResolver,
): Promise<URL> {
  return (await resolveSafeUrl(value, resolver)).url;
}

const pinnedRequest: PinnedRequester = (url, address, options) =>
  new Promise((resolve, reject) => {
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(
      url,
      {
        signal: options.signal,
        headers: {
          'user-agent':
            'SupplySignalCollector/1.0 (+https://suppliesignal.local)',
        },
        lookup: (_hostname, lookupOptions, callback) => {
          const family = isIP(address);
          if (typeof lookupOptions === 'object' && lookupOptions.all) {
            const allCallback = callback as unknown as (
              error: null,
              addresses: Array<{ address: string; family: number }>,
            ) => void;
            allCallback(null, [{ address, family }]);
            return;
          }
          const singleCallback = callback as unknown as (
            error: null,
            resolvedAddress: string,
            resolvedFamily: number,
          ) => void;
          singleCallback(null, address, family);
        },
        ...(url.protocol === 'https:' ? { servername: url.hostname } : {}),
      },
      (response) => {
        const chunks: Buffer[] = [];
        let size = 0;
        response.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > options.maxBytes) {
            request.destroy(
              new IngestionError(
                'RESPONSE_TOO_LARGE',
                'Source response exceeds maximum size',
              ),
            );
            return;
          }
          chunks.push(chunk);
        });
        response.on('end', () =>
          resolve({
            status: response.statusCode ?? 0,
            ...(response.headers.location
              ? { location: response.headers.location }
              : {}),
            ...(response.headers['content-length']
              ? { contentLength: Number(response.headers['content-length']) }
              : {}),
            body: Buffer.concat(chunks),
          }),
        );
      },
    );
    request.on('error', reject);
    request.end();
  });

export async function safeFetch(
  value: string,
  options: {
    requester?: PinnedRequester;
    resolver?: Resolver;
    timeoutMs?: number;
    maxBytes?: number;
    maxRedirects?: number;
  } = {},
): Promise<string> {
  const requester = options.requester ?? pinnedRequest;
  const resolver = options.resolver ?? defaultResolver;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const maxBytes = options.maxBytes ?? 2_000_000;
  const maxRedirects = options.maxRedirects ?? 3;
  let current = value;
  for (let redirects = 0; redirects <= maxRedirects; redirects++) {
    const { url, address } = await resolveSafeUrl(current, resolver);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Awaited<ReturnType<PinnedRequester>>;
    try {
      response = await requester(url, address, {
        signal: controller.signal,
        maxBytes,
      });
    } catch (error) {
      if (error instanceof IngestionError) throw error;
      throw new IngestionError(
        'COLLECTION_FAILED',
        'Source request failed or timed out',
      );
    } finally {
      clearTimeout(timer);
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (!response.location || redirects === maxRedirects)
        throw new IngestionError(
          'COLLECTION_FAILED',
          'Redirect limit exceeded',
        );
      current = new URL(response.location, current).toString();
      continue;
    }
    if (response.status < 200 || response.status >= 300)
      throw new IngestionError(
        'COLLECTION_FAILED',
        `Source returned HTTP ${response.status}`,
      );
    if (
      (response.contentLength !== undefined &&
        response.contentLength > maxBytes) ||
      response.body.byteLength > maxBytes
    )
      throw new IngestionError(
        'RESPONSE_TOO_LARGE',
        'Source response exceeds maximum size',
      );
    return new TextDecoder().decode(response.body);
  }
  throw new IngestionError('COLLECTION_FAILED', 'Redirect limit exceeded');
}
