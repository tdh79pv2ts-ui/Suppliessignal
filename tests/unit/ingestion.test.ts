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
  it('rejects feed items without a valid publication date', () => {
    const result = parseFeed(
      '<rss><channel><item><title>Undated</title><link>https://public.example/undated</link></item></channel></rss>',
      'https://public.example/',
    );
    expect(result).toEqual({ items: [], failedItems: 1 });
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
    ['http://zero/a', '0.1.2.3'],
    ['http://private/a', '10.0.0.1'],
    ['http://carrier/a', '100.64.0.1'],
    ['http://127.0.0.2/a', '127.0.0.2'],
    ['http://link-local/a', '169.254.169.254'],
    ['http://private/a', '172.31.255.255'],
    ['http://private/a', '192.168.1.1'],
    ['http://unspecified/a', '::'],
    ['http://private/a', '::1'],
    ['http://private/a', 'fc00::1'],
    ['http://private/a', 'fdff::1'],
    ['http://private/a', 'fe80::1'],
    ['http://mapped/a', '::ffff:0.1.2.3'],
    ['http://mapped/a', '::ffff:10.0.0.1'],
    ['http://mapped/a', '::ffff:100.64.0.1'],
    ['http://mapped/a', '::ffff:127.0.0.1'],
    ['http://mapped/a', '::ffff:169.254.1.1'],
    ['http://mapped/a', '::ffff:172.16.0.1'],
    ['http://mapped/a', '::ffff:192.168.0.1'],
    ['http://mapped/a', '::ffff:c0a8:101'],
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
    const requester = vi
      .fn()
      .mockResolvedValueOnce(
        {
          status: 302,
          location: 'http://private/internal',
          body: new Uint8Array(),
        },
      );
    await expect(
      safeFetch('https://public.example/feed', {
        requester,
        resolver: async (host) => [
          host === 'private' ? '10.0.0.2' : '93.184.216.34',
        ],
      }),
    ).rejects.toMatchObject({ code: 'UNSAFE_SOURCE_URL' });
    expect(requester).toHaveBeenCalledTimes(1);
  });
  it('pins the validated address so a later DNS answer cannot rebind', async () => {
    const resolver = vi
      .fn()
      .mockResolvedValueOnce(['93.184.216.34'])
      .mockResolvedValueOnce(['127.0.0.1']);
    const requester = vi.fn(async (_url, pinnedAddress: string) => ({
      status: 200,
      body: new TextEncoder().encode(pinnedAddress),
    }));
    await expect(
      safeFetch('https://public.example/feed', { resolver, requester }),
    ).resolves.toBe('93.184.216.34');
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(requester).toHaveBeenCalledWith(
      expect.objectContaining({ hostname: 'public.example' }),
      '93.184.216.34',
      expect.any(Object),
    );
  });
  it('rejects oversized responses', async () => {
    await expect(
      safeFetch('https://public.example/feed', {
        requester: async () => ({
          status: 200,
          body: new TextEncoder().encode('oversized'),
        }),
        resolver: async () => ['93.184.216.34'],
        maxBytes: 3,
      }),
    ).rejects.toMatchObject({ code: 'RESPONSE_TOO_LARGE' });
  });
  it('handles timeouts safely', async () => {
    const requester = async (
      _url: URL,
      _address: string,
      options: { signal: AbortSignal },
    ) =>
      new Promise((_resolve, reject) =>
        options.signal.addEventListener('abort', () =>
          reject(new Error('aborted')),
        ),
      );
    await expect(
      safeFetch('https://public.example/feed', {
        requester,
        resolver: async () => ['93.184.216.34'],
        timeoutMs: 5,
      }),
    ).rejects.toMatchObject({ code: 'COLLECTION_FAILED' });
  });
});
