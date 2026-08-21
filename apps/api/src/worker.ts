import 'dotenv/config';
import { db } from '@suppliesignal/db';
import { serverEnvSchema } from '@suppliesignal/shared';
import { collectDueSources } from './services/source-collection-batch.js';
serverEnvSchema.parse(process.env);
const pollMs = 60_000;
let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    console.info(JSON.stringify({ operation: 'source_worker_batch', status: 'completed', ...await collectDueSources() }));
  } finally {
    running = false;
  }
}

console.info(JSON.stringify({ operation: 'source_worker_start', status: 'ok', pollMs }));
void tick();
const timer = setInterval(() => void tick(), pollMs);
process.on('SIGTERM', async () => {
  clearInterval(timer);
  while (running) await new Promise((resolve) => setTimeout(resolve, 25));
  await db.$disconnect();
  process.exit(0);
});
