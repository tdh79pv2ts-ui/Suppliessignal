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

function inferLanguage(value: string): string | undefined {
  if (/\p{Script=Myanmar}/u.test(value)) return 'my';
  if (/\p{Script=Bengali}/u.test(value)) return 'bn';
  if (/\p{Script=Han}/u.test(value)) return 'zh';
  return undefined;
}
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
      if (!published || Number.isNaN(Date.parse(published))) {
        failedItems++;
        continue;
      }
      const rawText = value(
        block,
        atom ? ['content', 'summary'] : ['content:encoded', 'description'],
      );
      const externalId = value(block, atom ? ['id'] : ['guid']);
      const author = value(
        block,
        atom ? ['name', 'author'] : ['dc:creator', 'author'],
      );
      const language = inferLanguage(`${title} ${rawText ?? ''}`);
      items.push({
        title,
        originalUrl: new URL(link, baseUrl).toString(),
        ...(externalId ? { externalId } : {}),
        ...(author ? { author } : {}),
        publishedAt: new Date(published),
        ...(language ? { language } : {}),
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
