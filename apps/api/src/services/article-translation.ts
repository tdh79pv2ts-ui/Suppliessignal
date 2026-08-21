import {
  OpenAIArticleTranslationProvider,
  articleTranslationSchema,
  type ArticleTranslationProvider,
} from '@suppliesignal/ai';
import { db } from '@suppliesignal/db';
import { intelligenceLanguages } from '@suppliesignal/shared';
import { ServiceError } from './errors.js';

const supportedLanguages = new Set<string>(intelligenceLanguages);

export class ArticleTranslationService {
  constructor(private readonly provider: ArticleTranslationProvider | null = null) {}

  async translate(articleId: string, targetLanguage: string) {
    if (!supportedLanguages.has(targetLanguage))
      throw new ServiceError('UNSUPPORTED_TRANSLATION_LANGUAGE', 'Translation language is not supported', 400);
    const article = await db.sourceArticle.findUnique({ where: { id: articleId } });
    if (!article) throw new ServiceError('ARTICLE_NOT_FOUND', 'Source article not found', 404);
    const sourceLanguage = article.language?.split('-')[0]?.toLowerCase() ?? 'en';
    if (sourceLanguage === targetLanguage)
      return { sourceArticleId: article.id, targetLanguage, status: 'NOT_REQUIRED' as const, translatedTitle: article.title, translatedSummary: article.excerpt };
    if (!this.provider)
      throw new ServiceError('ARTICLE_TRANSLATION_DISABLED', 'Article translation is not configured', 503);

    const existing = await db.sourceArticleTranslation.findUnique({ where: { sourceArticleId_targetLanguage: { sourceArticleId: articleId, targetLanguage } } });
    if (existing?.status === 'COMPLETED') return existing;
    await db.sourceArticleTranslation.upsert({
      where: { sourceArticleId_targetLanguage: { sourceArticleId: articleId, targetLanguage } },
      create: { sourceArticleId: articleId, targetLanguage, status: 'PENDING' },
      update: { status: 'PENDING', errorCode: null },
    });
    try {
      const summary = article.excerpt ?? article.normalizedText ?? article.rawText;
      if (!summary?.trim()) throw new ServiceError('NO_TRANSLATABLE_CONTENT', 'Article has no summary to translate', 422);
      const result = await this.provider.translate({ title: article.title, summary, sourceLanguage, targetLanguage });
      const translated = articleTranslationSchema.parse(result.output);
      return db.sourceArticleTranslation.update({
        where: { sourceArticleId_targetLanguage: { sourceArticleId: articleId, targetLanguage } },
        data: { translatedTitle: translated.title, translatedSummary: translated.summary, provider: this.provider.name, model: this.provider.model, status: 'COMPLETED', errorCode: null },
      });
    } catch (error) {
      await db.sourceArticleTranslation.update({
        where: { sourceArticleId_targetLanguage: { sourceArticleId: articleId, targetLanguage } },
        data: { status: 'FAILED', errorCode: error instanceof ServiceError ? error.code : 'ARTICLE_TRANSLATION_FAILED' },
      });
      throw error;
    }
  }

  async translatePending(limit = 100) {
    if (!this.provider) return { articlesChecked: 0, translated: 0, failed: 0, skipped: true };
    const preferences = await db.dailyBriefPreference.findMany({ where: { enabled: true }, select: { language: true } });
    const targets = [...new Set(['en', ...preferences.map((preference) => preference.language)])];
    const articles = await db.sourceArticle.findMany({ orderBy: { discoveredAt: 'asc' }, take: Math.min(100, Math.max(1, limit)) });
    let translated = 0;
    let failed = 0;
    for (const article of articles) {
      for (const targetLanguage of targets) {
        if ((article.language?.split('-')[0]?.toLowerCase() ?? 'en') === targetLanguage) continue;
        const existing = await db.sourceArticleTranslation.findUnique({ where: { sourceArticleId_targetLanguage: { sourceArticleId: article.id, targetLanguage } }, select: { status: true } });
        if (existing?.status === 'COMPLETED') continue;
        try { await this.translate(article.id, targetLanguage); translated++; } catch { failed++; }
      }
    }
    return { articlesChecked: articles.length, translated, failed, skipped: false };
  }
}

function configuredProvider(): ArticleTranslationProvider | null {
  if (process.env.ARTICLE_TRANSLATION_ENABLED !== 'true' || !process.env.OPENAI_API_KEY) return null;
  return new OpenAIArticleTranslationProvider(process.env.ARTICLE_TRANSLATION_MODEL ?? 'gpt-5-mini', process.env.OPENAI_API_KEY);
}

export const articleTranslationService = new ArticleTranslationService(configuredProvider());
