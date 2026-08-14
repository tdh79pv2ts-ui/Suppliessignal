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
  '20260817000000_event_policy_hardening',
];
const phaseSixA = [
  ...phaseFive,
  '20260818000000_phase_6a_exposure_foundation',
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
      "DO $$ BEGIN IF (SELECT count(*) FROM suppliers WHERE customer_id='5a6ce6b4-0d65-4d16-90dc-04b751f5169b') <> 20 OR (SELECT count(*) FROM factories WHERE customer_id='5a6ce6b4-0d65-4d16-90dc-04b751f5169b') <> 50 OR (SELECT count(*) FROM products WHERE customer_id='5a6ce6b4-0d65-4d16-90dc-04b751f5169b') <> 30 OR (SELECT count(*) FROM materials WHERE customer_id='5a6ce6b4-0d65-4d16-90dc-04b751f5169b') <> 20 OR (SELECT count(*) FROM routes WHERE customer_id='5a6ce6b4-0d65-4d16-90dc-04b751f5169b') <> 15 OR (SELECT count(DISTINCT port_id) FROM route_ports WHERE customer_id='5a6ce6b4-0d65-4d16-90dc-04b751f5169b') <> 10 OR (SELECT count(*) FROM sources WHERE id IN ('a1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002') AND collection_enabled AND feed_url IS NOT NULL) <> 2 OR EXISTS (SELECT 1 FROM source_articles WHERE original_url LIKE '%.invalid%') THEN RAISE EXCEPTION 'POC demo seed or real-source configuration is invalid'; END IF; END $$; SELECT (SELECT count(*) FROM customers) AS customers, (SELECT count(*) FROM suppliers WHERE customer_id='5a6ce6b4-0d65-4d16-90dc-04b751f5169b') AS demo_suppliers, (SELECT count(*) FROM factories WHERE customer_id='5a6ce6b4-0d65-4d16-90dc-04b751f5169b') AS demo_factories, (SELECT count(*) FROM source_articles) AS collected_articles, (SELECT count(*) FROM news_radar_exposures WHERE customer_id='5a6ce6b4-0d65-4d16-90dc-04b751f5169b') AS detected_exposures, (SELECT count(*) FROM sources WHERE collection_enabled) AS collection_enabled_sources, to_regclass('public.daily_briefs') IS NOT NULL AS briefs_available;",
    ],
    { env },
  );
});

console.log('B. EXISTING PHASE 6A TO HARDENED PHASE 6A UPGRADE');
await withDisposablePostgres(async ({ env, bin, port, databaseName }) => {
  const psql = join(bin, 'psql');
  for (const migration of phaseSixA) {
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
      `INSERT INTO customers (id,name,created_at,updated_at) VALUES ('${customerId}','Existing Phase 6A Customer',now(),now()); INSERT INTO suppliers(id,customer_id,name,country,tier,criticality,created_at,updated_at) VALUES ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','${customerId}','Existing Phase 6A Supplier','Thailand','TIER_1','HIGH',now(),now()); INSERT INTO events(id,event_type,status,title,summary,severity,confidence,assertion_mode,temporal_precision,first_seen_at,last_seen_at,fingerprint,created_at,updated_at) VALUES ('55555555-5555-4555-8555-555555555555','STRIKE','DETECTED','Existing Phase 6A Event','Existing Phase 6A data','HIGH',0.8,'OBSERVED','UNKNOWN',now(),now(),'existing-phase6a-event',now(),now()); INSERT INTO exposure_candidates(id,customer_id,event_id,candidate_key,status,match_methods,reason_codes,event_entity_ids,event_location_ids,snapshot,exposure_policy_version,graph_revision,event_version,created_at,updated_at) VALUES ('44444444-4444-4444-8444-444444444444','${customerId}','55555555-5555-4555-8555-555555555555','existing-node','PENDING',ARRAY['COMPOSITE_EXACT_IDENTITY']::"ExposureMatchMethod"[],ARRAY['AMBIGUOUS_ENTITY_IDENTITY']::"ExposureReasonCode"[],ARRAY[]::uuid[],ARRAY[]::uuid[],'{}','1.0',0,1,now(),now()); INSERT INTO exposure_candidate_nodes(id,customer_id,candidate_id,supplier_id,snapshot,created_at) VALUES ('33333333-3333-4333-8333-333333333333','${customerId}','44444444-4444-4444-8444-444444444444','cccccccc-cccc-4ccc-8ccc-cccccccccccc','{}',now());`,
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
      `SELECT EXISTS(SELECT 1 FROM exposure_candidate_nodes WHERE id='33333333-3333-4333-8333-333333333333' AND node_type='SUPPLIER') AS existing_node_backfilled, EXISTS(SELECT 1 FROM events WHERE id='55555555-5555-4555-8555-555555555555') AS phase5_event_preserved;`,
    ],
    { env },
  );
});

console.log('C. PHASE 5 TO HARDENED PHASE 6A UPGRADE');
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
      `SELECT EXISTS(SELECT 1 FROM customers WHERE id='${customerId}') AS customer_preserved, EXISTS(SELECT 1 FROM customer_memberships WHERE user_id='${userId}' AND customer_id='${customerId}') AS membership_preserved, EXISTS(SELECT 1 FROM supplier_products WHERE supplier_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc') AS graph_preserved, EXISTS(SELECT 1 FROM source_articles WHERE id='ffffffff-ffff-4fff-8fff-ffffffffffff') AS article_preserved, EXISTS(SELECT 1 FROM claims WHERE id='77777777-7777-4777-8777-777777777777') AS claim_preserved, EXISTS(SELECT 1 FROM poc_evaluation_datasets WHERE id='66666666-6666-4666-8666-666666666666') AS poc_preserved, EXISTS(SELECT 1 FROM events WHERE id='55555555-5555-4555-8555-555555555555' AND policy_version='1.1' AND exposure_version=1) AS historic_event_preserved, to_regclass('public.event_claims') IS NOT NULL AS event_claims_available, to_regclass('public.claim_event_processing') IS NOT NULL AS processing_available, to_regclass('public.customer_exposures') IS NOT NULL AS exposures_available, to_regclass('public.exposure_path_steps') IS NOT NULL AS path_steps_available, to_regclass('public.exposure_candidates') IS NOT NULL AS candidates_available, to_regclass('public.customer_graph_identities') IS NOT NULL AS identities_available;`,
    ],
    { env },
  );
});
