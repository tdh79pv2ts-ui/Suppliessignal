import { describe, expect, it } from 'vitest';
import {
  assertProductionAuthSafety,
  serverEnvSchema,
} from '../../packages/shared/src/env';

const base = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://user:password@localhost:5432/test',
  WEB_ORIGIN: 'http://localhost:5173',
};

describe('server environment', () => {
  it('requires Supabase when development auth is disabled', () => {
    const result = serverEnvSchema.safeParse({
      ...base,
      ALLOW_DEV_AUTH: 'false',
    });
    expect(result.success).toBe(false);
  });

  it('allows explicit development auth outside production', () => {
    const result = serverEnvSchema.safeParse({
      ...base,
      ALLOW_DEV_AUTH: 'true',
    });
    expect(result.success).toBe(true);
  });

  it('rejects development auth in production', () => {
    const result = serverEnvSchema.safeParse({
      ...base,
      NODE_ENV: 'production',
      ALLOW_DEV_AUTH: 'true',
    });
    expect(result.success).toBe(false);
  });

  it('fails fast if an invalid production environment bypasses schema parsing', () => {
    expect(() =>
      assertProductionAuthSafety({
        NODE_ENV: 'production',
        ALLOW_DEV_AUTH: true,
      }),
    ).toThrow('ALLOW_DEV_AUTH must be false');
  });

  it('requires an OpenAI key only when AI extraction is enabled', () => {
    expect(
      serverEnvSchema.safeParse({
        ...base,
        ALLOW_DEV_AUTH: 'true',
        AI_EXTRACTION_ENABLED: 'true',
      }).success,
    ).toBe(false);
    expect(
      serverEnvSchema.safeParse({
        ...base,
        ALLOW_DEV_AUTH: 'true',
        AI_EXTRACTION_ENABLED: 'true',
        OPENAI_API_KEY: 'test-key',
      }).success,
    ).toBe(true);
    expect(
      serverEnvSchema.safeParse({
        ...base,
        ALLOW_DEV_AUTH: 'true',
        AI_EXTRACTION_ENABLED: 'false',
      }).success,
    ).toBe(true);
  });

  it('validates the event minimum Claim confidence at startup', () => {
    expect(
      serverEnvSchema.safeParse({
        ...base,
        ALLOW_DEV_AUTH: 'true',
        EVENT_MIN_CLAIM_CONFIDENCE: '0.72',
      }).success,
    ).toBe(true);
    expect(
      serverEnvSchema.safeParse({
        ...base,
        ALLOW_DEV_AUTH: 'true',
        EVENT_MIN_CLAIM_CONFIDENCE: '1.01',
      }).success,
    ).toBe(false);
  });
});
