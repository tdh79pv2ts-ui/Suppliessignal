import 'dotenv/config';
import { db } from '@suppliesignal/db';
import {
  eventIntelligenceService,
  processingMetadata,
} from './services/event-intelligence.js';
import { addEventProcessingMetrics } from './services/event-worker-metrics.js';
const batchSize = Math.min(
  25,
  Math.max(1, Number(process.env.EVENT_BATCH_SIZE ?? 5)),
);
const pollMs = Math.max(5_000, Number(process.env.EVENT_POLL_MS ?? 60_000));
const enabled = process.env.EVENT_PROCESSING_ENABLED === 'true';
let running = false;
console.info(
  JSON.stringify({
    operation: 'event_worker_start',
    status: 'ok',
    enabled,
    batchSize,
    pollMs,
  }),
);
async function tick() {
  if (!enabled || running) return;
  running = true;
  let metrics = processingMetadata();
  const started = Date.now();
  try {
    const claims = await eventIntelligenceService.pendingClaims(batchSize);
    for (const claim of claims)
      try {
        const result = await eventIntelligenceService.processClaim(claim.id);
        metrics = addEventProcessingMetrics(metrics, result);
      } catch (error) {
        metrics.processingFailures++;
        console.error(
          JSON.stringify({
            operation: 'event_worker_claim',
            claimId: claim.id,
            status: 'failed',
            errorCode:
              (error as { code?: string }).code ?? 'EVENT_PROCESSING_FAILED',
          }),
        );
      }
    console.info(
      JSON.stringify({
        operation: 'event_worker_batch',
        status: 'completed',
        durationMs: Date.now() - started,
        ...metrics,
      }),
    );
  } finally {
    running = false;
  }
}
const timer = setInterval(() => void tick(), pollMs);
void tick();
process.on('SIGTERM', async () => {
  clearInterval(timer);
  while (running) await new Promise((resolve) => setTimeout(resolve, 25));
  await db.$disconnect();
  process.exit(0);
});
