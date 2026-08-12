import 'dotenv/config';
import { db } from '@suppliesignal/db';
import { extractionService } from './services/extraction.js';
const batchSize=Math.min(25,Math.max(1,Number(process.env.EXTRACTION_BATCH_SIZE??5)));
if(process.env.AI_EXTRACTION_ENABLED==='true'&&!process.env.OPENAI_API_KEY)throw new Error('Invalid extraction configuration: OPENAI_API_KEY is required');
console.info(JSON.stringify({operation:'extraction_worker_start',status:'ok',batchSize}));
async function tick(){if(process.env.AI_EXTRACTION_ENABLED!=='true')return;const articles=await db.sourceArticle.findMany({where:{status:{not:'IGNORED'},OR:[{normalizedText:{not:null}},{excerpt:{not:null}}],extractionRuns:{none:{status:'COMPLETED'}}},take:batchSize,orderBy:{collectedAt:'asc'}});for(const article of articles)try{await extractionService.extract(article.id);}catch(error){console.error(JSON.stringify({operation:'article_extraction_worker',sourceArticleId:article.id,status:'failed',errorCode:error instanceof Error?error.name:'UNKNOWN'}));}}
const timer=setInterval(()=>void tick(),60_000);void tick();
process.on('SIGTERM',async()=>{clearInterval(timer);await db.$disconnect();process.exit(0);});
