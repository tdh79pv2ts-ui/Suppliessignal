import { db } from '../packages/db/src/index.js';
import { NewsRadarService, NEWS_RADAR_POLICY_VERSION } from '../apps/api/src/services/news-radar.js';

async function main() {
  const service = new NewsRadarService();
  const cycles: Array<Awaited<ReturnType<NewsRadarService['processPending']>>> = [];
  for (let cycle = 0; cycle < 50; cycle++) {
    const result = await service.processPending(100);
    cycles.push(result);
    if (result.pending === 0 || result.processed + result.skipped + result.failed === 0) break;
  }
  const pending = await service.pendingCount();
  console.log(JSON.stringify({ policyVersion: NEWS_RADAR_POLICY_VERSION, cycles, pending }, null, 2));
  if (pending > 0 || cycles.some((cycle) => cycle.failed > 0)) process.exitCode = 1;
}

void main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
