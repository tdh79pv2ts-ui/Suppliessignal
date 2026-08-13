import 'dotenv/config';
import { serverEnvSchema } from '@suppliesignal/shared';
import { sourceIntelligenceService } from './services/source-intelligence.js';
serverEnvSchema.parse(process.env);
const pollMs=60_000;
async function tick(){const result=await sourceIntelligenceService.listSources({page:1,pageSize:100,active:'true',collectionEnabled:'true'});for(const source of result.items){const interval=source.collectionIntervalMinutes??15;const due=!source.lastCollectedAt||Date.now()-source.lastCollectedAt.getTime()>=interval*60_000;if(due)await sourceIntelligenceService.collect(source.id).catch((error:unknown)=>console.error(JSON.stringify({operation:'source_collection_failure',sourceId:source.id,error:error instanceof Error?error.message:'Collection failed'})));}}
console.info(JSON.stringify({operation:'source_worker_start',status:'ok',pollMs}));
await tick();
setInterval(()=>void tick(),pollMs);
