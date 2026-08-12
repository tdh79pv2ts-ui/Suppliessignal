import { withDisposablePostgres, run } from './postgres-harness.mjs';

await withDisposablePostgres(async ({ env }) => {
  run('pnpm', ['--filter', '@suppliesignal/shared', 'build'], { env });
  run('pnpm', ['--filter', '@suppliesignal/db', 'build'], { env });
  run('pnpm', ['--filter', '@suppliesignal/ingestion', 'build'], { env });
  run('pnpm', ['--filter', '@suppliesignal/ai', 'build'], { env });
  run('pnpm', ['prisma', 'migrate', 'deploy'], { env });
  run('pnpm', ['exec', 'vitest', 'run'], { env });
});
