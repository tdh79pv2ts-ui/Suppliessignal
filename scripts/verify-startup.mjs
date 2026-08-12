import { spawn } from 'node:child_process';
import {
  availablePort,
  withDisposablePostgres,
  run,
} from './postgres-harness.mjs';

await withDisposablePostgres(async ({ env }) => {
  run('pnpm', ['prisma', 'migrate', 'deploy'], { env });
  const apiPort = await availablePort();
  const apiEnv = {
    ...env,
    NODE_ENV: 'development',
    API_PORT: String(apiPort),
    WEB_ORIGIN: 'http://localhost:5173',
    ALLOW_DEV_AUTH: 'true',
    LOG_LEVEL: 'fatal',
  };
  const server = spawn(
    process.execPath,
    ['apps/api/dist/apps/api/src/server.js'],
    { env: apiEnv, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  server.stdout.pipe(process.stdout);
  server.stderr.pipe(process.stderr);
  try {
    let response;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      if (server.exitCode !== null)
        throw new Error(`API exited early with code ${server.exitCode}`);
      try {
        response = await fetch(`http://127.0.0.1:${apiPort}/api/health`);
        if (response.ok) break;
      } catch {
        /* startup retry */
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!response?.ok)
      throw new Error('API health endpoint did not become ready');
    const health = await response.json();
    if (health.status !== 'ok')
      throw new Error('API health response was not ok');
    console.log(
      `Application startup verified on disposable database (port ${apiPort})`,
    );
  } finally {
    server.kill('SIGTERM');
    await new Promise((resolve) => server.once('exit', resolve));
  }
  const worker = spawn(
    process.execPath,
    ['apps/api/dist/apps/api/src/worker.js'],
    { env: apiEnv, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  worker.stdout.pipe(process.stdout);
  worker.stderr.pipe(process.stderr);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, 500);
    worker.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Worker exited early with code ${code}`));
    });
  });
  worker.kill('SIGTERM');
  await new Promise((resolve) => worker.once('exit', resolve));
  console.log('Source collection worker startup verified');
  const extractionWorker = spawn(process.execPath, ['apps/api/dist/apps/api/src/extraction-worker.js'], { env: { ...apiEnv, AI_EXTRACTION_ENABLED: 'false' }, stdio: ['ignore', 'pipe', 'pipe'] });
  extractionWorker.stdout.pipe(process.stdout); extractionWorker.stderr.pipe(process.stderr);
  await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,500);extractionWorker.once('exit',(code)=>{clearTimeout(timer);reject(new Error(`Extraction worker exited early with code ${code}`));});});
  extractionWorker.kill('SIGTERM'); await new Promise((resolve)=>extractionWorker.once('exit',resolve));
  console.log('Extraction worker startup verified (AI disabled, no key required)');
  const eventWorker = spawn(process.execPath, ['apps/api/dist/apps/api/src/event-worker.js'], { env: { ...apiEnv, EVENT_PROCESSING_ENABLED: 'false' }, stdio: ['ignore', 'pipe', 'pipe'] });
  eventWorker.stdout.pipe(process.stdout); eventWorker.stderr.pipe(process.stderr);
  await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,500);eventWorker.once('exit',(code)=>{clearTimeout(timer);reject(new Error(`Event worker exited early with code ${code}`));});});
  eventWorker.kill('SIGTERM'); await new Promise((resolve)=>eventWorker.once('exit',resolve));
  console.log('Event worker startup verified (processing disabled)');
});
