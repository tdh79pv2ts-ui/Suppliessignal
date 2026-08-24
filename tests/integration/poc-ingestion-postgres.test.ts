import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../packages/db/src/index';
import { PocIngestionCoordinator } from '../../apps/api/src/services/poc-ingestion-coordinator';

const raw = process.env.TEST_DATABASE_URL;
if (!raw || raw !== process.env.DATABASE_URL || process.env.NODE_ENV === 'production' || !new URL(raw).pathname.includes('suppliesignal_test_')) {
  throw new Error('Refusing non-disposable POC ingestion integration database');
}

const completeResult = (mode: 'INITIAL_FULL_LOAD' | 'DELTA' | 'DAILY_RECONCILIATION') => ({
  mode,
  sourcesExpected: 2,
  sourcesChecked: 2,
  sourcesCollected: 2,
  sourcesFailed: 0,
  sourceFailures: [],
  articlesDiscovered: 3,
  duplicatesPrevented: 1,
  articlesFound: 3,
  articlesProcessed: 3,
  articlesSkipped: 0,
  articleFailures: 0,
  relevanceMatchesCreated: 2,
  articlesTranslated: 1,
  translationFailures: 0,
  translationBacklog: 0,
  relevanceBacklog: 0,
  pendingBacklog: 0,
  batchesProcessed: 1,
  backlogDrained: true,
});

describe.sequential('database-backed POC ingestion coordination', () => {
  beforeEach(async () => {
    await db.pocIngestionRun.deleteMany();
    await db.pocIngestionState.deleteMany();
  });

  afterAll(async () => {
    await db.pocIngestionRun.deleteMany();
    await db.pocIngestionState.deleteMany();
  });

  it('runs initial load, same-day delta and next-day reconciliation deterministically', async () => {
    let now = new Date('2026-08-24T01:00:00Z');
    const runner = { runCycle: vi.fn(async (_batch: number, mode: 'INITIAL_FULL_LOAD' | 'DELTA' | 'DAILY_RECONCILIATION') => completeResult(mode)) };
    const coordinator = new PocIngestionCoordinator(runner as never, () => now);

    await expect(coordinator.run()).resolves.toMatchObject({ mode: 'INITIAL_FULL_LOAD', status: 'COMPLETED' });
    for (let cycle = 1; cycle <= 5; cycle++) {
      now = new Date(`2026-08-24T01:${String(cycle * 5).padStart(2, '0')}:00Z`);
      await expect(coordinator.run()).resolves.toMatchObject({ mode: 'DELTA', status: 'COMPLETED' });
    }
    now = new Date('2026-08-25T00:10:00Z');
    await expect(coordinator.run()).resolves.toMatchObject({ mode: 'DAILY_RECONCILIATION', status: 'COMPLETED' });

    const state = await db.pocIngestionState.findUniqueOrThrow({ where: { id: 'POC_V1' } });
    expect(state).toMatchObject({ pendingBacklog: 0, lastRunStatus: 'COMPLETED' });
    expect(state.lastFullLoadAt?.toISOString()).toBe('2026-08-24T01:00:00.000Z');
    expect(state.lastSuccessfulDeltaAt?.toISOString()).toBe('2026-08-25T00:10:00.000Z');
    expect(state.lastFullReconciliationAt?.toISOString()).toBe('2026-08-25T00:10:00.000Z');
    expect(await db.pocIngestionRun.count({ where: { mode: 'DELTA', status: 'COMPLETED' } })).toBe(5);
  });

  it('allows only one process to own the database lease', async () => {
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const runner = { runCycle: vi.fn(async (_batch: number, mode: 'INITIAL_FULL_LOAD' | 'DELTA' | 'DAILY_RECONCILIATION') => {
      await blocked;
      return completeResult(mode);
    }) };
    const first = new PocIngestionCoordinator(runner as never, () => new Date('2035-08-24T02:00:00Z'));
    const second = new PocIngestionCoordinator(runner as never, () => new Date('2035-08-24T02:00:01Z'));
    const running = first.run();
    await vi.waitFor(async () => {
      expect((await db.pocIngestionState.findUnique({ where: { id: 'POC_V1' } }))?.ownerToken).not.toBeNull();
    });
    await expect(second.run()).rejects.toMatchObject({ code: 'POC_INGESTION_ALREADY_RUNNING' });
    release();
    await expect(running).resolves.toMatchObject({ status: 'COMPLETED' });
    expect(runner.runCycle).toHaveBeenCalledOnce();
  });

  it('records partial status and never reports a material backlog as current', async () => {
    const runner = { runCycle: vi.fn(async () => ({
      ...completeResult('DELTA'),
      relevanceBacklog: 7,
      pendingBacklog: 7,
      backlogDrained: false,
    })) };
    const coordinator = new PocIngestionCoordinator(runner as never, () => new Date('2026-08-24T03:00:00Z'));
    await expect(coordinator.run(100, 'DELTA')).resolves.toMatchObject({ status: 'PARTIAL', pendingBacklog: 7 });
    await expect(db.pocIngestionState.findUniqueOrThrow({ where: { id: 'POC_V1' } })).resolves.toMatchObject({
      lastRunStatus: 'PARTIAL',
      pendingBacklog: 7,
      lastSuccessfulDeltaAt: null,
    });
  });
});
