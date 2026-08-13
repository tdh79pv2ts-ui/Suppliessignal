import 'dotenv/config';
import { db } from '@suppliesignal/db';
import { serverEnvSchema } from '@suppliesignal/shared';
import { newsRadarService } from './services/news-radar.js';

serverEnvSchema.parse(process.env);
const enabled = process.env.NEWS_RADAR_ENABLED !== 'false';
const pollMs = Math.max(60_000, Number(process.env.NEWS_RADAR_POLL_MS ?? 5 * 60_000));
const batchSize = Math.min(100, Math.max(1, Number(process.env.NEWS_RADAR_BATCH_SIZE ?? 20)));
let running = false;
console.info(JSON.stringify({ operation: 'news_radar_worker_start', status: 'ok', enabled, pollMs, batchSize }));

async function tick() {
  if (!enabled || running) return;
  running = true;
  try {
    const result = await newsRadarService.processPending(batchSize);
    console.info(JSON.stringify({ operation: 'news_radar_worker_batch', status: 'completed', ...result }));
  } catch (error) {
    console.error(JSON.stringify({ operation: 'news_radar_worker_batch', status: 'failed', errorCode: error instanceof Error ? error.name : 'NEWS_RADAR_WORKER_FAILED' }));
  } finally {
    running = false;
  }
}

void tick();
const timer = setInterval(() => void tick(), pollMs);
process.on('SIGTERM', async () => {
  clearInterval(timer);
  while (running) await new Promise((resolve) => setTimeout(resolve, 25));
  await db.$disconnect();
  process.exit(0);
});
