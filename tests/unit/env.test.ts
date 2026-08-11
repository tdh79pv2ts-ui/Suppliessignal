import { describe, expect, it } from 'vitest';
import { serverEnvSchema } from '../../packages/shared/src/env';

const base = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://user:password@localhost:5432/test',
  WEB_ORIGIN: 'http://localhost:5173',
};

describe('server environment', () => {
  it('requires Supabase when development auth is disabled', () => {
    const result = serverEnvSchema.safeParse({ ...base, ALLOW_DEV_AUTH: 'false' });
    expect(result.success).toBe(false);
  });

  it('allows explicit development auth outside production', () => {
    const result = serverEnvSchema.safeParse({ ...base, ALLOW_DEV_AUTH: 'true' });
    expect(result.success).toBe(true);
  });

  it('rejects development auth in production', () => {
    const result = serverEnvSchema.safeParse({ ...base, NODE_ENV: 'production', ALLOW_DEV_AUTH: 'true' });
    expect(result.success).toBe(false);
  });
});
