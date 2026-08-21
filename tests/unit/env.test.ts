import { describe, expect, it } from 'vitest';
import {
  assertProductionAuthSafety,
  resolveServerPort,
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
      APP_ENV: 'production',
      ALLOW_DEV_AUTH: 'true',
    });
    expect(result.success).toBe(false);
  });

  it('fails fast if an invalid production environment bypasses schema parsing', () => {
    expect(() =>
      assertProductionAuthSafety({
        NODE_ENV: 'production',
        APP_ENV: 'production',
        ALLOW_DEV_AUTH: true,
      }),
    ).toThrow('ALLOW_DEV_AUTH must be false');
  });

  it('requires production runtime semantics for staging', () => {
    expect(
      serverEnvSchema.safeParse({
        ...base,
        NODE_ENV: 'development',
        APP_ENV: 'staging',
        ALLOW_DEV_AUTH: 'false',
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_ANON_KEY: 'test-anon-key',
      }).success,
    ).toBe(false);
  });

  it('accepts production-like staging without an OpenAI key when extraction is disabled', () => {
    const result = serverEnvSchema.safeParse({
      ...base,
      NODE_ENV: 'production',
      APP_ENV: 'staging',
      ALLOW_DEV_AUTH: 'false',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'test-anon-key',
      AI_EXTRACTION_ENABLED: 'false',
      EVENT_PROCESSING_ENABLED: 'false',
    });
    expect(result.success).toBe(true);
  });

  it('rejects development auth in staging even if runtime semantics are bypassed', () => {
    expect(() =>
      assertProductionAuthSafety({
        NODE_ENV: 'development',
        APP_ENV: 'staging',
        ALLOW_DEV_AUTH: true,
      }),
    ).toThrow('ALLOW_DEV_AUTH must be false');
  });

  it('uses the hosting PORT before the local API_PORT', () => {
    const parsed = serverEnvSchema.parse({
      ...base,
      ALLOW_DEV_AUTH: 'true',
      PORT: '8080',
      API_PORT: '4000',
    });
    expect(resolveServerPort(parsed)).toBe(8080);
  });

  it('falls back to API_PORT and rejects non-positive ports', () => {
    const parsed = serverEnvSchema.parse({
      ...base,
      ALLOW_DEV_AUTH: 'true',
      API_PORT: '4100',
    });
    expect(resolveServerPort(parsed)).toBe(4100);
    expect(
      serverEnvSchema.safeParse({
        ...base,
        ALLOW_DEV_AUTH: 'true',
        PORT: '0',
      }).success,
    ).toBe(false);
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

  it('requires server-only provider credentials only when translation or email is enabled', () => {
    expect(serverEnvSchema.safeParse({ ...base, ALLOW_DEV_AUTH: 'true', ARTICLE_TRANSLATION_ENABLED: 'true' }).success).toBe(false);
    expect(serverEnvSchema.safeParse({ ...base, ALLOW_DEV_AUTH: 'true', ARTICLE_TRANSLATION_ENABLED: 'true', OPENAI_API_KEY: 'test-key' }).success).toBe(true);
    expect(serverEnvSchema.safeParse({ ...base, ALLOW_DEV_AUTH: 'true', DAILY_BRIEF_EMAIL_ENABLED: 'true' }).success).toBe(false);
    expect(serverEnvSchema.safeParse({ ...base, ALLOW_DEV_AUTH: 'true', DAILY_BRIEF_EMAIL_ENABLED: 'true', RESEND_API_KEY: 'server-only', DAILY_BRIEF_FROM_EMAIL: 'briefs@example.test' }).success).toBe(true);
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
