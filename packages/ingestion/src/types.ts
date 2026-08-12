export type CollectedItem = {
  title: string;
  originalUrl: string;
  externalId?: string;
  author?: string;
  publishedAt?: Date;
  rawText?: string;
  excerpt?: string;
  language?: string;
};
export type CollectableSource = {
  id: string;
  sourceType: 'RSS' | 'ATOM' | 'API' | 'WEB' | 'MANUAL';
  baseUrl: string;
  feedUrl: string | null;
  language: string | null;
};
export interface Collector {
  collect(
    source: CollectableSource,
  ): Promise<{ items: CollectedItem[]; failedItems: number }>;
}
export class IngestionError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
