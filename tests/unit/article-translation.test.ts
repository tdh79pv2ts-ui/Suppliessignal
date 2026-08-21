import { describe, expect, it } from 'vitest';
import {
  FakeArticleTranslationProvider,
  articleTranslationSchema,
} from '../../packages/ai/src/translation';

describe('article translation boundary', () => {
  it('accepts only a complete translated title and summary', () => {
    expect(articleTranslationSchema.parse({ title: 'Vertaalde titel', summary: 'Vertaalde samenvatting.' })).toEqual({
      title: 'Vertaalde titel',
      summary: 'Vertaalde samenvatting.',
    });
    expect(articleTranslationSchema.safeParse({ title: '', summary: 'Missing title' }).success).toBe(false);
    expect(articleTranslationSchema.safeParse({ title: 'Title', summary: '   ' }).success).toBe(false);
  });

  it('keeps translation providers injectable and deterministic in tests', async () => {
    const provider = new FakeArticleTranslationProvider((input) => ({
      title: `${input.targetLanguage}: ${input.title}`,
      summary: `${input.targetLanguage}: ${input.summary}`,
    }));
    await expect(provider.translate({ title: 'Titel', summary: 'Inhoud', sourceLanguage: 'nl', targetLanguage: 'en' })).resolves.toMatchObject({
      output: { title: 'en: Titel', summary: 'en: Inhoud' },
    });
  });
});
