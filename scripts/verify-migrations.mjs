import { join } from 'node:path';
import { withDisposablePostgres, run } from './postgres-harness.mjs';

const phaseFive = [
  '20260811000000_phase_1_foundation',
  '20260811010000_membership_authorization',
  '20260811020000_supply_chain_graph',
  '20260812000000_source_intelligence',
  '20260813000000_ai_extraction_claims',
  '20260814000000_extraction_leases',
  '20260815000000_extraction_validation_poc',
  '20260816000000_event_intelligence_engine',
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

console.log('B. PHASE 5 TO HARDENED PHASE 5 UPGRADE');
await withDisposablePostgres(async ({ env, bin, port, databaseName }) => {
  const psql = join(bin, 'psql');
  for (const migration of phaseFive) {
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
      `INSERT INTO customers (id,name,created_at,updated_at) VALUES ('${customerId}','Phase 5 Customer',now(),now()); INSERT INTO users (id,email,role,created_at,updated_at) VALUES ('${userId}','phase5-upgrade@example.test','REVIEWER',now(),now()); INSERT INTO customer_memberships (id,user_id,customer_id,created_at,updated_at) VALUES (gen_random_uuid(),'${userId}','${customerId}',now(),now()); INSERT INTO suppliers(id,customer_id,name,country,tier,criticality,created_at,updated_at) VALUES ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','${customerId}','Preserved Supplier','Thailand','TIER_1','HIGH',now(),now()); INSERT INTO products(id,customer_id,name,criticality,created_at,updated_at) VALUES ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','${customerId}','Preserved Product','HIGH',now(),now()); INSERT INTO supplier_products(customer_id,supplier_id,product_id,created_at) VALUES ('${customerId}','cccccccc-cccc-4ccc-8ccc-cccccccccccc','dddddddd-dddd-4ddd-8ddd-dddddddddddd',now()); INSERT INTO sources(id,name,source_type,base_url,category,reliability,active,collection_enabled,consecutive_failures,created_at,updated_at) VALUES ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','Preserved Fixture','MANUAL','https://fixture.example','OTHER','LOW',true,false,0,now(),now()); INSERT INTO source_articles(id,source_id,original_url,title,normalized_text,content_hash,url_hash,status,created_at,updated_at) VALUES ('ffffffff-ffff-4fff-8fff-ffffffffffff','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','https://fixture.example/article','Preserved article','Preserved text','content','url','NORMALIZED',now(),now()); INSERT INTO source_collection_runs(id,source_id,collector_type,status,created_at) VALUES ('99999999-9999-4999-8999-999999999999','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','MANUAL','SUCCESS',now()); INSERT INTO article_extraction_runs(id,source_article_id,status,provider,model,prompt_version,schema_version,input_hash,input_characters,claims_extracted,article_relevant,completed_at) VALUES ('88888888-8888-4888-8888-888888888888','ffffffff-ffff-4fff-8fff-ffffffffffff','COMPLETED','fake','preserved','1.0','1.0','hash',14,1,true,now()); INSERT INTO claims(id,source_article_id,extraction_run_id,claim_type,assertion_mode,statement,confidence,evidence_text,evidence_start,evidence_end,created_at,updated_at) VALUES ('77777777-7777-4777-8777-777777777777','ffffffff-ffff-4fff-8fff-ffffffffffff','88888888-8888-4888-8888-888888888888','OTHER','REPORTED','Preserved claim',0.9,'Preserved text',0,14,now(),now()); INSERT INTO poc_evaluation_datasets(id,name,status,thresholds,created_at,updated_at) VALUES ('66666666-6666-4666-8666-666666666666','Preserved POC','COMPLETED','{}',now(),now()); INSERT INTO events(id,event_type,status,title,summary,severity,confidence,assertion_mode,temporal_precision,first_seen_at,last_seen_at,fingerprint,created_at,updated_at) VALUES ('55555555-5555-4555-8555-555555555555','STRIKE','DETECTED','Preserved Event','Historic Phase 5 Event','HIGH',0.8,'OBSERVED','UNKNOWN',now(),now(),'preserved-phase5-event',now(),now());`,
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
      `SELECT EXISTS(SELECT 1 FROM customers WHERE id='${customerId}') AS customer_preserved, EXISTS(SELECT 1 FROM customer_memberships WHERE user_id='${userId}' AND customer_id='${customerId}') AS membership_preserved, EXISTS(SELECT 1 FROM supplier_products WHERE supplier_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc') AS graph_preserved, EXISTS(SELECT 1 FROM source_articles WHERE id='ffffffff-ffff-4fff-8fff-ffffffffffff') AS article_preserved, EXISTS(SELECT 1 FROM claims WHERE id='77777777-7777-4777-8777-777777777777') AS claim_preserved, EXISTS(SELECT 1 FROM poc_evaluation_datasets WHERE id='66666666-6666-4666-8666-666666666666') AS poc_preserved, EXISTS(SELECT 1 FROM events WHERE id='55555555-5555-4555-8555-555555555555' AND policy_version='1.0') AS historic_event_policy_preserved, to_regclass('public.event_claims') IS NOT NULL AS event_claims_available, to_regclass('public.claim_event_processing') IS NOT NULL AS processing_available;`,
    ],
    { env },
  );
});
