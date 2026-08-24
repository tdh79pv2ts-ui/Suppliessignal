import crypto from 'node:crypto';
import { Prisma, db, type PocIngestionMode } from '@suppliesignal/db';
import { ServiceError } from './errors.js';
import { pocIngestionService, type PocIngestionService } from './poc-ingestion.js';

const STATE_ID = 'POC_V1';
const LEASE_MS = 30 * 60_000;

type Runner = Pick<PocIngestionService, 'runCycle'>;

const sameUtcDay = (left: Date, right: Date) =>
  left.getUTCFullYear() === right.getUTCFullYear() &&
  left.getUTCMonth() === right.getUTCMonth() &&
  left.getUTCDate() === right.getUTCDate();

export class PocIngestionCoordinator {
  constructor(
    private readonly runner: Runner = pocIngestionService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async run(batchSize = 100, requestedMode?: PocIngestionMode) {
    const now = this.now();
    await db.pocIngestionState.upsert({
      where: { id: STATE_ID },
      create: { id: STATE_ID },
      update: {},
    });
    const mode = requestedMode ?? await this.modeFor(now);
    const ownerToken = crypto.randomUUID();
    const leaseExpiresAt = new Date(now.getTime() + LEASE_MS);
    const claimed = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      UPDATE "poc_ingestion_state"
      SET "owner_token" = ${ownerToken}::uuid,
          "lease_expires_at" = ${leaseExpiresAt},
          "last_run_started_at" = ${now},
          "last_run_status" = 'RUNNING',
          "updated_at" = NOW()
      WHERE "id" = ${STATE_ID}
        AND ("owner_token" IS NULL OR "lease_expires_at" <= NOW())
      RETURNING "id"
    `);
    if (claimed.length === 0) {
      throw new ServiceError(
        'POC_INGESTION_ALREADY_RUNNING',
        'A database-owned POC ingestion cycle is already running',
        409,
      );
    }

    const run = await db.pocIngestionRun.create({ data: { mode } });
    try {
      const result = await this.runner.runCycle(batchSize, mode);
      const completedAt = this.now();
      const status = result.backlogDrained && result.sourcesFailed === 0 &&
        result.articleFailures === 0 && result.translationFailures === 0
        ? 'COMPLETED' as const
        : 'PARTIAL' as const;
      await db.$transaction([
        db.pocIngestionRun.update({
          where: { id: run.id },
          data: {
            status,
            completedAt,
            sourcesExpected: result.sourcesExpected,
            sourcesChecked: result.sourcesChecked,
            sourcesCollected: result.sourcesCollected,
            sourcesFailed: result.sourcesFailed,
            articlesDiscovered: result.articlesDiscovered,
            articlesProcessed: result.articlesProcessed,
            articlesFailed: result.articleFailures + result.translationFailures,
            duplicatesPrevented: result.duplicatesPrevented,
            pendingBacklog: result.pendingBacklog,
          },
        }),
        db.pocIngestionState.updateMany({
          where: { id: STATE_ID, ownerToken },
          data: {
            ownerToken: null,
            leaseExpiresAt: null,
            lastRunCompletedAt: completedAt,
            lastRunStatus: status,
            pendingBacklog: result.pendingBacklog,
            ...(status === 'COMPLETED' ? {
              lastSuccessfulDeltaAt: completedAt,
              ...(mode === 'INITIAL_FULL_LOAD' ? { lastFullLoadAt: completedAt, lastFullReconciliationAt: completedAt } : {}),
              ...(mode === 'DAILY_RECONCILIATION' ? { lastFullReconciliationAt: completedAt } : {}),
            } : {}),
          },
        }),
      ]);
      return { runId: run.id, status, ...result };
    } catch (error) {
      const completedAt = this.now();
      await db.$transaction([
        db.pocIngestionRun.update({
          where: { id: run.id },
          data: {
            status: 'FAILED',
            completedAt,
            errorCode: error instanceof ServiceError ? error.code : 'POC_INGESTION_FAILED',
            errorMessage: (error instanceof Error ? error.message : 'POC ingestion failed').slice(0, 500),
          },
        }),
        db.pocIngestionState.updateMany({
          where: { id: STATE_ID, ownerToken },
          data: { ownerToken: null, leaseExpiresAt: null, lastRunCompletedAt: completedAt, lastRunStatus: 'FAILED' },
        }),
      ]).catch(() => undefined);
      throw error;
    }
  }

  async status() {
    const [state, runs] = await Promise.all([
      db.pocIngestionState.findUnique({ where: { id: STATE_ID } }),
      db.pocIngestionRun.findMany({ orderBy: { startedAt: 'desc' }, take: 20 }),
    ]);
    return { state, runs };
  }

  private async modeFor(now: Date): Promise<PocIngestionMode> {
    const state = await db.pocIngestionState.findUnique({ where: { id: STATE_ID } });
    if (!state?.lastFullLoadAt) return 'INITIAL_FULL_LOAD';
    if (!state.lastFullReconciliationAt || !sameUtcDay(state.lastFullReconciliationAt, now)) {
      return 'DAILY_RECONCILIATION';
    }
    return 'DELTA';
  }
}

export const pocIngestionCoordinator = new PocIngestionCoordinator();
