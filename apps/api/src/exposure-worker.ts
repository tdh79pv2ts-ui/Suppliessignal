import 'dotenv/config';
import { db } from '@suppliesignal/db';
import { customerExposureService } from './services/customer-exposure.js';

const enabled = process.env.EXPOSURE_PROCESSING_ENABLED === 'true';
const batchSize = Math.min(25, Math.max(1, Number(process.env.EXPOSURE_BATCH_SIZE ?? 5)));
const pollMs = Math.max(5_000, Number(process.env.EXPOSURE_POLL_MS ?? 60_000));
let running = false;
let lastEventId: string | undefined;
console.info(JSON.stringify({ operation: 'exposure_worker_start', status: 'ok', enabled, batchSize, pollMs }));
async function tick() {
  if (!enabled || running) return;
  running = true;
  try {
    const events = await db.event.findMany({
      where: { status: { in: ['DETECTED', 'ACTIVE', 'RESOLVED', 'CANCELLED'] }, ...(lastEventId ? { id: { gt: lastEventId } } : {}) },
      select: { id: true }, take: batchSize, orderBy: { id: 'asc' },
    });
    for (const event of events) try { await customerExposureService.reconcileEvent(event.id); } catch (error) { console.error(JSON.stringify({ operation: 'exposure_worker_event', eventId: event.id, status: 'failed', errorCode: (error as { code?: string }).code ?? 'EXPOSURE_RECONCILIATION_FAILED' })); }
    lastEventId = events.length === batchSize ? events.at(-1)?.id : undefined;
    console.info(JSON.stringify({ operation: 'exposure_worker_batch', status: 'completed', eventsProcessed: events.length }));
  } finally { running = false; }
}
const timer = setInterval(() => void tick(), pollMs);
void tick();
process.on('SIGTERM', async () => { clearInterval(timer); while (running) await new Promise((resolve) => setTimeout(resolve, 25)); await db.$disconnect(); process.exit(0); });
