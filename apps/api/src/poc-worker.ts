import 'dotenv/config';
import { db } from '@suppliesignal/db';
import { serverEnvSchema } from '@suppliesignal/shared';
import { pocIngestionCoordinator } from './services/poc-ingestion-coordinator.js';

serverEnvSchema.parse(process.env);

export const POC_INGESTION_INTERVAL_MS = 5 * 60_000;
const batchSize = Math.min(
  100,
  Math.max(1, Number(process.env.POC_ARTICLE_BATCH_SIZE ?? 100)),
);
let running = false;

export async function runPocCycle() {
  if (running) return null;
  running = true;
  try {
    const result = await pocIngestionCoordinator.run(batchSize);
    console.info(
      JSON.stringify({ operation: 'poc_ingestion_cycle', ...result }),
    );
    return result;
  } catch (error) {
    console.error(
      JSON.stringify({
        operation: 'poc_ingestion_cycle',
        status: 'failed',
        error: error instanceof Error ? error.message : 'POC ingestion failed',
      }),
    );
    return null;
  } finally {
    running = false;
  }
}

console.info(
  JSON.stringify({
    operation: 'poc_worker_start',
    status: 'ok',
    pollMs: POC_INGESTION_INTERVAL_MS,
    batchSize,
  }),
);
void runPocCycle();
const timer = setInterval(() => void runPocCycle(), POC_INGESTION_INTERVAL_MS);
process.on('SIGTERM', async () => {
  clearInterval(timer);
  while (running) await new Promise((resolve) => setTimeout(resolve, 25));
  await db.$disconnect();
  process.exit(0);
});
