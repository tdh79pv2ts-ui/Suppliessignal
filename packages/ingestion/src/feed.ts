import type { CollectableSource, CollectedItem, Collector } from './types.js';
import { IngestionError } from './types.js';
import { normalizeText } from './normalize.js';
import { safeFetch } from './safe-fetch.js';
const value = (xml: string, tags: string[]) => {
  for (const tag of tags) {
    const match = xml.match(
      new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'),
    );
    if (match) return normalizeText(match[1]);
  }
  return undefined;
};
const attr = (xml: string, tag: string, name: string) =>
  xml.match(
    new RegExp(`<${tag}[^>]*\\s${name}=["']([^"']+)["'][^>]*>`, 'i'),
  )?.[1];
export function parseFeed(
  xml: string,
  baseUrl: string,
): { items: CollectedItem[]; failedItems: number } {
  const atom = /<feed[\s>]/i.test(xml);
  const blocks = [
    ...xml.matchAll(
      atom
        ? /<entry\b[^>]*>([\s\S]*?)<\/entry>/gi
        : /<item\b[^>]*>([\s\S]*?)<\/item>/gi,
    ),
  ].map((match) => match[1]!);
  const items: CollectedItem[] = [];
  let failedItems = 0;
  for (const block of blocks) {
    try {
      const title = value(block, ['title']);
      const link = atom
        ? (attr(block, 'link', 'href') ?? value(block, ['link']))
        : value(block, ['link']);
      if (!title || !link) {
        failedItems++;
        continue;
      }
      const published = value(
        block,
        atom ? ['published', 'updated'] : ['pubDate', 'dc:date'],
      );
      const rawText = value(
        block,
        atom ? ['content', 'summary'] : ['content:encoded', 'description'],
      );
      const externalId = value(block, atom ? ['id'] : ['guid']);
      const author = value(
        block,
        atom ? ['name', 'author'] : ['dc:creator', 'author'],
      );
      items.push({
        title,
        originalUrl: new URL(link, baseUrl).toString(),
        ...(externalId ? { externalId } : {}),
        ...(author ? { author } : {}),
        ...(published && !Number.isNaN(Date.parse(published))
          ? { publishedAt: new Date(published) }
          : {}),
        ...(rawText ? { rawText, excerpt: rawText } : {}),
      });
    } catch {
      failedItems++;
    }
  }
  return { items, failedItems };
}
export class FeedCollector implements Collector {
  constructor(
    private fetchText: (url: string) => Promise<string> = safeFetch,
  ) {}
  async collect(source: CollectableSource) {
    if (!source.feedUrl)
      throw new IngestionError('INVALID_SOURCE_URL', 'Feed URL is required');
    return parseFeed(await this.fetchText(source.feedUrl), source.baseUrl);
  }
}
