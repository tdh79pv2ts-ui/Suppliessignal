import { afterAll, describe, expect, it } from 'vitest';
import { db } from '../../packages/db/src/index';
import { FakeExtractionProvider } from '../../packages/ai/src/index';
import { POC_THRESHOLDS } from '../../packages/shared/src/poc-evaluation';
import { ExtractionService } from '../../apps/api/src/services/extraction';
import { PocEvaluationService } from '../../apps/api/src/services/poc-evaluation';

const raw=process.env.TEST_DATABASE_URL;
if(!raw||raw!==process.env.DATABASE_URL||process.env.NODE_ENV==='production'||!new URL(raw).pathname.includes('suppliesignal_test_'))throw new Error('Refusing non-disposable POC database');
afterAll(async()=>db.$disconnect());
const output={articleRelevant:true,claims:[{claimType:'PORT_DISRUPTION',assertionMode:'REPORTED',statement:'The fictional test port reported a disruption.',confidence:.96,evidenceText:'The fictional test port reported a disruption.',entities:[{entityType:'PORT',name:'Test Port',confidence:.9}],locations:[{name:'Test City',country:'Testland',confidence:.9}]}]};
const delay=()=>new Promise(resolve=>setTimeout(resolve,2));

async function fixture(){
  const reviewer=await db.user.create({data:{id:crypto.randomUUID(),email:`reviewer-${crypto.randomUUID()}@example.test`,role:'REVIEWER'}});
  const source=await db.source.create({data:{name:`POC Fixture ${crypto.randomUUID()}`,sourceType:'MANUAL',baseUrl:'https://fixture.example',category:'OTHER',reliability:'LOW'}});
  const article=await db.sourceArticle.create({data:{sourceId:source.id,originalUrl:`https://fixture.example/${crypto.randomUUID()}`,title:'Fictional POC article',normalizedText:'The fictional test port reported a disruption.',contentHash:crypto.randomUUID(),urlHash:crypto.randomUUID(),status:'NORMALIZED'}});
  return{reviewer,source,article};
}

describe.sequential('Phase 4.5 POC with PostgreSQL',()=>{
  it('counts compatible articles once, freezes the latest compatible run, and preserves that exact run after reprocessing',async()=>{
    const{reviewer,article}=await fixture();
    const extraction=new ExtractionService(new FakeExtractionProvider(output));
    await extraction.extract(article.id);
    await delay();
    const latestCompatible=await extraction.extract(article.id,true);
    const storedThresholds={...POC_THRESHOLDS,evidenceAccuracy:0};
    const service=new PocEvaluationService(extraction,storedThresholds);
    const dataset=await service.create({name:'Technical validation',minimumArticlesReviewed:100,minimumClaimReviewPercent:100});
    await service.addArticles(dataset.id,[article.id]);
    expect(await service.preflight(dataset.id)).toMatchObject({total:1,compatible:1,requiringExtraction:0});
    await service.run(dataset.id);
    const frozen=await service.get(dataset.id);
    expect(frozen).toMatchObject({status:'REVIEWING',provider:'fake',model:'deterministic-fixture',promptVersion:'1.0',schemaVersion:'1.0',thresholds:storedThresholds});
    expect(frozen.articles[0]?.extractionRunId).toBe(latestCompatible.id);
    await expect(service.addArticles(dataset.id,[article.id])).rejects.toMatchObject({code:'POC_DATASET_IMMUTABLE'});
    await delay();
    await extraction.extract(article.id,true);
    expect((await service.get(dataset.id)).articles[0]?.extractionRunId).toBe(latestCompatible.id);

    const datasetArticle=frozen.articles[0]!;
    const claim=datasetArticle.extractionRun!.claims[0]!;
    await service.reviewArticle(dataset.id,datasetArticle.id,reviewer.id,{expectedRelevant:true,missedClaims:0});
    await service.reviewClaim(dataset.id,claim.id,reviewer.id,{claimScore:'INCORRECT',evidenceScore:'PARTIALLY_CORRECT',entityScore:'CORRECT',locationScore:'NOT_APPLICABLE',dateScore:'INCORRECT',assertionScore:'PARTIALLY_CORRECT',unsupported:true,failureReason:'NEGATION_ERROR',notes:'Independent values'});
    const reviewed=await service.get(dataset.id);
    expect(reviewed.articles[0]?.extractionRun?.claims[0]?.evaluations[0]).toMatchObject({claimScore:'INCORRECT',evidenceScore:'PARTIALLY_CORRECT',entityScore:'CORRECT',locationScore:'NOT_APPLICABLE',dateScore:'INCORRECT',assertionScore:'PARTIALLY_CORRECT',unsupported:true,failureReason:'NEGATION_ERROR',notes:'Independent values'});
    const serviceWithDifferentDefaults=new PocEvaluationService(extraction,POC_THRESHOLDS);
    const results=await serviceWithDifferentDefaults.results(dataset.id);
    expect(results.coverage).toMatchObject({articlesReviewed:1,claimsReviewed:1,claimReviewPercent:100});
    expect(results.decision).toBe('INCOMPLETE');
    expect(results.checks.evidenceAccuracy).toBe(true);
    expect(results.breakdowns.confidence['0.90–1.00']).toMatchObject({total:1,reviewed:1,correct:0,partial:0,incorrect:1,unsupported:1,correctRate:0,unsupportedRate:1});
    expect(await service.exportJson(dataset.id)).toMatchObject({decision:'INCOMPLETE'});
    expect(await service.exportCsv(dataset.id)).toContain('evidenceAccuracy');
  });

  it('never produces negative requiringExtraction when an article has multiple compatible runs',async()=>{
    const{article}=await fixture();const extraction=new ExtractionService(new FakeExtractionProvider(output));
    await extraction.extract(article.id);await extraction.extract(article.id,true);await extraction.extract(article.id,true);
    const service=new PocEvaluationService(extraction);const dataset=await service.create({name:'Unique preflight'});await service.addArticles(dataset.id,[article.id]);
    const preview=await service.preflight(dataset.id);expect(preview.compatible).toBe(1);expect(preview.requiringExtraction).toBe(0);expect(preview.compatible+preview.requiringExtraction).toBe(preview.total);expect(preview.requiringExtraction).toBeGreaterThanOrEqual(0);
  });

  it('database prevents linking an extraction run from another article',async()=>{const{source}=await fixture();const[one,two]=await Promise.all(['one','two'].map(label=>db.sourceArticle.create({data:{sourceId:source.id,originalUrl:`https://fixture.example/${label}-${crypto.randomUUID()}`,title:label,normalizedText:'The fictional test port reported a disruption.',contentHash:crypto.randomUUID(),urlHash:crypto.randomUUID(),status:'NORMALIZED'}})));const run=await new ExtractionService(new FakeExtractionProvider(output)).extract(one.id);const dataset=await db.pocEvaluationDataset.create({data:{name:'FK validation',thresholds:POC_THRESHOLDS}});await expect(db.pocEvaluationArticle.create({data:{datasetId:dataset.id,sourceArticleId:two.id,extractionRunId:run.id,status:'COMPLETED'}})).rejects.toBeTruthy();});
});
