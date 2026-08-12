import { db, type Prisma } from '@suppliesignal/db';
import { CLAIM_EXTRACTION_PROMPT_VERSION, CLAIM_EXTRACTION_SCHEMA_VERSION, OpenAIExtractionProvider, extractClaims, type ExtractionProvider } from '@suppliesignal/ai';
import { ServiceError } from './errors.js';

const active = new Set<string>();
type Page = { page: number; pageSize: number };
const page = (p: Page, total: number) => ({ page: p.page, pageSize: p.pageSize, total, totalPages: Math.ceil(total / p.pageSize) });
export class ExtractionService {
  constructor(private readonly provider?: ExtractionProvider) {}
  private configuredProvider() {
    if (this.provider) return this.provider;
    if (process.env.AI_EXTRACTION_ENABLED !== 'true') throw new ServiceError('AI_EXTRACTION_DISABLED', 'AI extraction is disabled', 409);
    if (!process.env.OPENAI_API_KEY) throw new ServiceError('AI_EXTRACTION_DISABLED', 'AI extraction is not configured', 409);
    return new OpenAIExtractionProvider(process.env.OPENAI_EXTRACTION_MODEL ?? 'gpt-5-mini', process.env.OPENAI_API_KEY);
  }
  async extract(articleId: string, reprocess = false) {
    if (active.has(articleId)) throw new ServiceError('EXTRACTION_ALREADY_RUNNING', 'Article extraction is already running', 409);
    const article = await db.sourceArticle.findUnique({ where: { id: articleId }, include: { source: true } });
    if (!article) throw new ServiceError('ARTICLE_NOT_FOUND', 'Source article not found', 404);
    const text = article.normalizedText ?? article.excerpt;
    if (!text?.trim() || article.status === 'IGNORED') throw new ServiceError('ARTICLE_NOT_ELIGIBLE', 'Article has no extractable content', 409);
    const provider = this.configuredProvider();
    if (!reprocess) {
      const existing = await db.articleExtractionRun.findFirst({ where: { sourceArticleId: articleId, status: 'COMPLETED', provider: provider.name, model: provider.model, promptVersion: CLAIM_EXTRACTION_PROMPT_VERSION, schemaVersion: CLAIM_EXTRACTION_SCHEMA_VERSION }, orderBy: { completedAt: 'desc' } });
      if (existing) return this.get(existing.id);
    }
    active.add(articleId);
    const run = await db.articleExtractionRun.create({ data: { sourceArticleId: articleId, provider: provider.name, model: provider.model, promptVersion: CLAIM_EXTRACTION_PROMPT_VERSION, schemaVersion: CLAIM_EXTRACTION_SCHEMA_VERSION, inputHash: 'pending', inputCharacters: text.length } });
    const started = Date.now();
    try {
      let result; let lastError: unknown;
      for (let attempt = 0; attempt < 3; attempt++) { try { result = await extractClaims(provider, { title: article.title, text, sourceName: article.source.name, ...(article.publishedAt ? { publishedAt: article.publishedAt.toISOString() } : {}) }); break; } catch (error) { lastError = error; const providerError=error as {code?:string;transient?:boolean}; if (!providerError.code?.startsWith('AI_') || !providerError.transient || attempt === 2) break; await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1))); } }
      if (!result) throw lastError;
      const unique = [...new Map(result.claims.map((claim) => [`${claim.claimType}\0${claim.statement}\0${claim.evidenceStart}`, claim])).values()];
      await db.$transaction(async (tx) => {
        for (const claim of unique) await tx.claim.create({ data: { sourceArticleId: articleId, extractionRunId: run.id, claimType: claim.claimType, assertionMode: claim.assertionMode, statement: claim.statement, confidence: claim.confidence, occurredAt: claim.occurredAt ? new Date(claim.occurredAt) : null, validFrom: claim.validFrom ? new Date(claim.validFrom) : null, validUntil: claim.validUntil ? new Date(claim.validUntil) : null, evidenceText: claim.evidenceText, evidenceStart: claim.evidenceStart, evidenceEnd: claim.evidenceEnd, entities: { create: claim.entities.map((entity) => ({ entityType: entity.entityType, name: entity.name, normalizedName: entity.normalizedName, role: entity.role, confidence: entity.confidence })) }, locations: { create: claim.locations.map((location) => ({ name: location.name, country: location.country, region: location.region, city: location.city, confidence: location.confidence })) } } as Prisma.ClaimUncheckedCreateInput });
        await tx.articleExtractionRun.update({ where: { id: run.id }, data: { status: 'COMPLETED', completedAt: new Date(), inputHash: result.inputHash, inputCharacters: result.input.text.length, inputTruncated: result.truncated, inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens, articleRelevant: result.articleRelevant, claimsExtracted: unique.length } });
      });
      console.info(JSON.stringify({ operation: 'article_extraction', sourceArticleId: articleId, extractionRunId: run.id, provider: provider.name, model: provider.model, promptVersion: CLAIM_EXTRACTION_PROMPT_VERSION, schemaVersion: CLAIM_EXTRACTION_SCHEMA_VERSION, duration: Date.now() - started, claimsExtracted: unique.length, status: 'COMPLETED' }));
      return this.get(run.id);
    } catch (error) {
      const candidate=(error as {code?:string}).code; const code = candidate?.startsWith('AI_') ? candidate : error instanceof Error && ['INVALID_AI_OUTPUT','INVALID_EVIDENCE'].includes(error.message) ? error.message : 'EXTRACTION_FAILED';
      await db.articleExtractionRun.update({ where: { id: run.id }, data: { status: 'FAILED', completedAt: new Date(), errorCode: code, errorMessage: 'Extraction failed safely' } });
      throw new ServiceError(code, 'Article extraction failed', 502);
    } finally { active.delete(articleId); }
  }
  async get(id: string) { const item = await db.articleExtractionRun.findUnique({ where: { id }, include: { sourceArticle: { include: { source: true } }, claims: { include: { entities: true, locations: true } } } }); if (!item) throw new ServiceError('EXTRACTION_NOT_FOUND', 'Extraction run not found', 404); return item; }
  async articleRuns(articleId: string) { return db.articleExtractionRun.findMany({ where: { sourceArticleId: articleId }, orderBy: { startedAt: 'desc' }, include: { claims: { include: { entities: true, locations: true } } } }); }
  async listExtractions(f: Page & Record<string, unknown>) { const where: Prisma.ArticleExtractionRunWhereInput = { ...(f.status ? { status: f.status as never } : {}), ...(f.model ? { model: f.model as string } : {}), ...(f.sourceId ? { sourceArticle: { sourceId: f.sourceId as string } } : {}) }; const [items,total] = await db.$transaction([db.articleExtractionRun.findMany({ where, skip:(f.page-1)*f.pageSize,take:f.pageSize,orderBy:{startedAt:'desc'},include:{sourceArticle:{include:{source:true}}} }),db.articleExtractionRun.count({where})]); return {items,pagination:page(f,total)}; }
  async listClaims(f: Page & Record<string, unknown>) { const where: Prisma.ClaimWhereInput = { ...(f.claimType ? {claimType:f.claimType as never}:{}), ...(f.extractionRunId?{extractionRunId:f.extractionRunId as string}:{}), ...(f.sourceId?{sourceArticle:{sourceId:f.sourceId as string}}:{}), ...(f.entityName?{entities:{some:{name:{contains:f.entityName as string,mode:'insensitive'}}}}:{}), ...(f.location?{locations:{some:{name:{contains:f.location as string,mode:'insensitive'}}}}:{}), ...(f.confidenceMin||f.confidenceMax?{confidence:{...(f.confidenceMin?{gte:f.confidenceMin as number}:{}),...(f.confidenceMax?{lte:f.confidenceMax as number}:{})}}:{}) }; const [items,total]=await db.$transaction([db.claim.findMany({where,skip:(f.page-1)*f.pageSize,take:f.pageSize,orderBy:{createdAt:'desc'},include:{entities:true,locations:true,sourceArticle:{include:{source:true}},extractionRun:true}}),db.claim.count({where})]); return {items,pagination:page(f,total)}; }
  async getClaim(id:string) { const claim=await db.claim.findUnique({where:{id},include:{entities:true,locations:true,sourceArticle:{include:{source:true}},extractionRun:true}}); if(!claim) throw new ServiceError('CLAIM_NOT_FOUND','Claim not found',404); return claim; }
  async metrics(){const today=new Date();today.setUTCHours(0,0,0,0);const [awaiting,processed,failed,claims,tokens]=await Promise.all([db.sourceArticle.count({where:{normalizedText:{not:null},extractionRuns:{none:{status:'COMPLETED'}}}}),db.articleExtractionRun.count({where:{completedAt:{gte:today},status:'COMPLETED'}}),db.articleExtractionRun.count({where:{completedAt:{gte:today},status:'FAILED'}}),db.claim.count({where:{createdAt:{gte:today}}}),db.articleExtractionRun.aggregate({where:{startedAt:{gte:today}},_sum:{inputTokens:true,outputTokens:true}})]);return{articlesAwaitingExtraction:awaiting,processedToday:processed,failedToday:failed,claimsExtractedToday:claims,inputTokensToday:tokens._sum.inputTokens??0,outputTokensToday:tokens._sum.outputTokens??0};}
}
export const extractionService = new ExtractionService();
