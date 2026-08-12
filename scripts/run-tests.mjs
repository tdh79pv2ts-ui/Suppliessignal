import { withDisposablePostgres, run } from './postgres-harness.mjs';

await withDisposablePostgres(async ({ env }) => {
  run('pnpm', ['prisma', 'migrate', 'deploy'], { env });
  run('pnpm', ['exec', 'vitest', 'run'], { env });
});
