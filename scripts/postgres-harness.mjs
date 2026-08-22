import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, delimiter, dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const localHosts = new Set(['localhost', '127.0.0.1', '::1']);

export function assertDisposableDatabaseUrl(databaseUrl) {
  const parsed = new URL(databaseUrl);
  const databaseName = basename(parsed.pathname);
  if (
    !localHosts.has(parsed.hostname) ||
    !databaseName.startsWith('suppliesignal_test_')
  ) {
    throw new Error(
      'Refusing database operation: URL must target a local suppliesignal_test_* database',
    );
  }
  if (process.env.NODE_ENV === 'production')
    throw new Error('Refusing database tests with NODE_ENV=production');
}

function postgresBin() {
  const candidates = [
    '/opt/homebrew/opt/postgresql@16/bin',
    '/usr/local/opt/postgresql@16/bin',
    '/usr/local/bin',
    ...['/usr/lib/postgresql']
      .filter(existsSync)
      .flatMap((root) =>
        readdirSync(root).map((version) => join(root, version, 'bin')),
      ),
  ];
  const found = candidates.find(
    (candidate) =>
      existsSync(join(candidate, 'initdb')) &&
      existsSync(join(candidate, 'pg_ctl')),
  );
  if (!found)
    throw new Error(
      'PostgreSQL tools not found. Install PostgreSQL 16 and ensure initdb/pg_ctl are available.',
    );
  return found;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.status !== 0)
    throw new Error(
      `${command} ${args.join(' ')} failed with exit code ${result.status ?? 'unknown'}`,
    );
}

export async function availablePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string')
        return reject(new Error('Could not allocate PostgreSQL test port'));
      server.close(() => resolve(address.port));
    });
  });
}

export async function withDisposablePostgres(callback) {
  const bin = postgresBin();
  const root = mkdtempSync(join(tmpdir(), 'suppliesignal-postgres-'));
  const data = join(root, 'data');
  const port = await availablePort();
  const databaseName = `suppliesignal_test_${process.pid}_${Date.now()}`;
  const path = `${dirname(process.execPath)}${delimiter}${bin}${delimiter}${process.env.PATH ?? ''}`;
  const env = { ...process.env, PATH: path, NODE_ENV: 'test' };
  let started = false;
  try {
    run(
      join(bin, 'initdb'),
      ['-D', data, '-A', 'trust', '-U', 'postgres', '--no-locale'],
      { env },
    );
    run(
      join(bin, 'pg_ctl'),
      ['-D', data, '-o', `-F -p ${port} -h 127.0.0.1 -k ${root}`, '-w', 'start'],
      { env },
    );
    started = true;
    run(
      join(bin, 'createdb'),
      ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', databaseName],
      { env },
    );
    const databaseUrl = `postgresql://postgres@127.0.0.1:${port}/${databaseName}`;
    assertDisposableDatabaseUrl(databaseUrl);
    await callback({
      databaseUrl,
      env: {
        ...env,
        DATABASE_URL: databaseUrl,
        TEST_DATABASE_URL: databaseUrl,
      },
      bin,
      port,
      databaseName,
      root,
    });
  } finally {
    if (started)
      spawnSync(join(bin, 'pg_ctl'), ['-D', data, '-m', 'fast', '-w', 'stop'], {
        env,
        stdio: 'inherit',
      });
    rmSync(root, { recursive: true, force: true });
  }
}

export { run };
