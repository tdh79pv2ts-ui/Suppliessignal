import { join } from 'node:path';
import { withDisposablePostgres, run } from './postgres-harness.mjs';

const phaseOne = [
  '20260811000000_phase_1_foundation',
  '20260811010000_membership_authorization',
];
const customerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const userId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

console.log('A. CLEAN INSTALL');
await withDisposablePostgres(async ({ env, bin, port, databaseName }) => {
  run('pnpm', ['prisma', 'migrate', 'deploy'], { env });
  run('pnpm', ['prisma', 'db', 'seed'], { env });
  run(
    join(bin, 'psql'),
    [
      '-h',
      '127.0.0.1',
      '-p',
      String(port),
      '-U',
      'postgres',
      '-d',
      databaseName,
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      'SELECT (SELECT count(*) FROM customers) AS customers, (SELECT count(*) FROM suppliers) AS suppliers, (SELECT count(*) FROM route_ports) AS route_ports;',
    ],
    { env },
  );
});

console.log('B. PHASE 1 UPGRADE');
await withDisposablePostgres(async ({ env, bin, port, databaseName }) => {
  const psql = join(bin, 'psql');
  for (const migration of phaseOne) {
    run(
      psql,
      [
        '-h',
        '127.0.0.1',
        '-p',
        String(port),
        '-U',
        'postgres',
        '-d',
        databaseName,
        '-v',
        'ON_ERROR_STOP=1',
        '-f',
        join('prisma', 'migrations', migration, 'migration.sql'),
      ],
      { env },
    );
    run('pnpm', ['prisma', 'migrate', 'resolve', '--applied', migration], {
      env,
    });
  }
  run(
    psql,
    [
      '-h',
      '127.0.0.1',
      '-p',
      String(port),
      '-U',
      'postgres',
      '-d',
      databaseName,
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      `INSERT INTO customers (id,name,created_at,updated_at) VALUES ('${customerId}','Phase 1 Customer',now(),now()); INSERT INTO users (id,email,role,created_at,updated_at) VALUES ('${userId}','phase1-upgrade@example.test','CUSTOMER',now(),now()); INSERT INTO customer_memberships (id,user_id,customer_id,created_at,updated_at) VALUES (gen_random_uuid(),'${userId}','${customerId}',now(),now());`,
    ],
    { env },
  );
  run('pnpm', ['prisma', 'migrate', 'deploy'], { env });
  run(
    psql,
    [
      '-h',
      '127.0.0.1',
      '-p',
      String(port),
      '-U',
      'postgres',
      '-d',
      databaseName,
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      `SELECT EXISTS(SELECT 1 FROM customers WHERE id='${customerId}') AS customer_preserved, EXISTS(SELECT 1 FROM users WHERE id='${userId}') AS user_preserved, EXISTS(SELECT 1 FROM customer_memberships WHERE user_id='${userId}' AND customer_id='${customerId}') AS membership_preserved, to_regclass('public.suppliers') IS NOT NULL AS suppliers_available, to_regclass('public.route_ports') IS NOT NULL AS route_ports_available;`,
    ],
    { env },
  );
});
