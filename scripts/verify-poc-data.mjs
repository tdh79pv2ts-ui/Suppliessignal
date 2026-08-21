import { withDisposablePostgres, run } from './postgres-harness.mjs';

await withDisposablePostgres(async ({ env }) => {
  run('pnpm', ['--filter', '@suppliesignal/shared', 'build'], { env });
  run('pnpm', ['--filter', '@suppliesignal/db', 'build'], { env });
  run('pnpm', ['prisma', 'migrate', 'deploy'], { env });
  run('pnpm', ['prisma', 'db', 'seed'], { env });
  run('pnpm', ['poc:validate-data'], { env });
});
