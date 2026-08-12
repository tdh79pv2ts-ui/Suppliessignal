import { join } from 'node:path';
import { withDisposablePostgres, run } from './postgres-harness.mjs';

const phaseTwo = [
  '20260811000000_phase_1_foundation',
  '20260811010000_membership_authorization',
  '20260811020000_supply_chain_graph',
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
      'SELECT (SELECT count(*) FROM customers) AS customers, (SELECT count(*) FROM suppliers) AS suppliers, (SELECT count(*) FROM route_ports) AS route_ports, (SELECT count(*) FROM sources) AS sources, (SELECT count(*) FROM sources WHERE collection_enabled) AS collection_enabled_sources;',
    ],
    { env },
  );
});

console.log('B. PHASE 2 UPGRADE');
await withDisposablePostgres(async ({ env, bin, port, databaseName }) => {
  const psql = join(bin, 'psql');
  for (const migration of phaseTwo) {
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
      `INSERT INTO customers (id,name,created_at,updated_at) VALUES ('${customerId}','Phase 2 Customer',now(),now()); INSERT INTO users (id,email,role,created_at,updated_at) VALUES ('${userId}','phase2-upgrade@example.test','CUSTOMER',now(),now()); INSERT INTO customer_memberships (id,user_id,customer_id,created_at,updated_at) VALUES (gen_random_uuid(),'${userId}','${customerId}',now(),now()); INSERT INTO suppliers(id,customer_id,name,country,tier,criticality,created_at,updated_at) VALUES ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','${customerId}','Preserved Supplier','Thailand','TIER_1','HIGH',now(),now()); INSERT INTO products(id,customer_id,name,criticality,created_at,updated_at) VALUES ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','${customerId}','Preserved Product','HIGH',now(),now()); INSERT INTO supplier_products(customer_id,supplier_id,product_id,created_at) VALUES ('${customerId}','cccccccc-cccc-4ccc-8ccc-cccccccccccc','dddddddd-dddd-4ddd-8ddd-dddddddddddd',now());`,
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
      `SELECT EXISTS(SELECT 1 FROM customers WHERE id='${customerId}') AS customer_preserved, EXISTS(SELECT 1 FROM customer_memberships WHERE user_id='${userId}' AND customer_id='${customerId}') AS membership_preserved, EXISTS(SELECT 1 FROM suppliers WHERE id='cccccccc-cccc-4ccc-8ccc-cccccccccccc') AS supplier_preserved, EXISTS(SELECT 1 FROM supplier_products WHERE supplier_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc' AND product_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd') AS relationship_preserved, to_regclass('public.sources') IS NOT NULL AS sources_available, to_regclass('public.source_articles') IS NOT NULL AS articles_available;`,
    ],
    { env },
  );
});
