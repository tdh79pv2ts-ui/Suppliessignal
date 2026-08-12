import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  articleHashes,
  assertSafeUrl,
  normalizeText,
  normalizeUrl,
  parseFeed,
  safeFetch,
} from '../../packages/ingestion/src/index';
const rss = readFileSync(
  new URL('../fixtures/rss.xml', import.meta.url),
  'utf8',
);
const atom = readFileSync(
  new URL('../fixtures/atom.xml', import.meta.url),
  'utf8',
);
describe('deterministic ingestion', () => {
  it('parses RSS, isolates malformed items, and preserves optional metadata', () => {
    const result = parseFeed(rss, 'https://public.example/');
    expect(result.items).toHaveLength(2);
    expect(result.failedItems).toBe(1);
    expect(result.items[0]).toMatchObject({
      title: 'First item',
      externalId: 'fixture-1',
      author: 'Fixture Author',
    });
  });
  it('parses Atom and resolves safe relative links', () => {
    expect(parseFeed(atom, 'https://public.example/').items[0]).toMatchObject({
      title: 'Atom item',
      originalUrl: 'https://public.example/articles/atom',
      externalId: 'atom-1',
    });
  });
  it('normalizes URLs/text and hashes deterministically', () => {
    expect(
      normalizeUrl('HTTPS://PUBLIC.EXAMPLE:443/a/?utm_source=x#fragment'),
    ).toBe('https://public.example/a');
    expect(normalizeText('<script>x</script><p>Hello  world</p>')).toBe(
      'Hello world',
    );
    expect(articleHashes('https://public.example/a', 'same')).toEqual(
      articleHashes('https://public.example/a', 'same'),
    );
  });
});
describe('SSRF protection', () => {
  it.each([
    ['http://localhost/a', '127.0.0.1'],
    ['http://127.0.0.2/a', '127.0.0.2'],
    ['http://private/a', '10.0.0.1'],
    ['http://private/a', '192.168.1.1'],
    ['http://private/a', '169.254.169.254'],
    ['http://private/a', '::1'],
    ['http://private/a', 'fe80::1'],
  ])('rejects unsafe destination %s -> %s', async (url, address) => {
    await expect(
      assertSafeUrl(url, async () => [address]),
    ).rejects.toMatchObject({ code: 'UNSAFE_SOURCE_URL' });
  });
  it('rejects non-http protocols', async () => {
    await expect(assertSafeUrl('file:///etc/passwd')).rejects.toMatchObject({
      code: 'INVALID_SOURCE_URL',
    });
  });
  it('validates redirect destinations', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: 'http://private/internal' },
        }),
      );
    await expect(
      safeFetch('https://public.example/feed', {
        fetcher,
        resolver: async (host) => [
          host === 'private' ? '10.0.0.2' : '93.184.216.34',
        ],
      }),
    ).rejects.toMatchObject({ code: 'UNSAFE_SOURCE_URL' });
  });
  it('rejects oversized responses', async () => {
    await expect(
      safeFetch('https://public.example/feed', {
        fetcher: async () => new Response('oversized'),
        resolver: async () => ['93.184.216.34'],
        maxBytes: 3,
      }),
    ).rejects.toMatchObject({ code: 'RESPONSE_TOO_LARGE' });
  });
  it('handles timeouts safely', async () => {
    const fetcher: typeof fetch = async (_input, init) =>
      new Promise((_resolve, reject) =>
        init?.signal?.addEventListener('abort', () =>
          reject(new Error('aborted')),
        ),
      );
    await expect(
      safeFetch('https://public.example/feed', {
        fetcher,
        resolver: async () => ['93.184.216.34'],
        timeoutMs: 5,
      }),
    ).rejects.toMatchObject({ code: 'COLLECTION_FAILED' });
  });
});
