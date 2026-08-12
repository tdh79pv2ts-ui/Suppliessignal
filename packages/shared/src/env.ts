import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

export const serverEnvSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    APP_ENV: z
      .enum(['development', 'staging', 'production'])
      .default('development'),
    DATABASE_URL: z.string().min(1),
    SUPABASE_URL: z.string().url().optional(),
    SUPABASE_ANON_KEY: z.string().min(1).optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
    PORT: z.coerce.number().int().positive().optional(),
    API_PORT: z.coerce.number().int().positive().default(4000),
    WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
    ALLOW_DEV_AUTH: booleanString,
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
      .default('info'),
    AI_EXTRACTION_ENABLED: booleanString,
    OPENAI_API_KEY: z.string().min(1).optional(),
    OPENAI_EXTRACTION_MODEL: z.string().min(1).default('gpt-5-mini'),
    EXTRACTION_BATCH_SIZE: z.coerce.number().int().min(1).max(25).default(5),
    EVENT_PROCESSING_ENABLED: booleanString,
    EVENT_BATCH_SIZE: z.coerce.number().int().min(1).max(25).default(5),
    EVENT_POLL_MS: z.coerce.number().int().min(5000).default(60000),
    EVENT_MIN_CLAIM_CONFIDENCE: z.coerce.number().min(0).max(1).default(0.6),
  })
  .superRefine((env, context) => {
    const productionLike =
      env.APP_ENV === 'staging' || env.APP_ENV === 'production';
    if (productionLike && env.NODE_ENV !== 'production') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['NODE_ENV'],
        message: `${env.APP_ENV} requires NODE_ENV=production`,
      });
    }
    if (env.NODE_ENV === 'production' && env.APP_ENV === 'development') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['APP_ENV'],
        message:
          'NODE_ENV=production requires APP_ENV=staging or APP_ENV=production',
      });
    }
    if ((env.NODE_ENV === 'production' || productionLike) && env.ALLOW_DEV_AUTH) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ALLOW_DEV_AUTH'],
        message: 'Development auth cannot run in production',
      });
    }
    if (!env.ALLOW_DEV_AUTH && (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SUPABASE_URL'],
        message:
          'Supabase configuration is required unless development auth is enabled',
      });
    }
    if (env.AI_EXTRACTION_ENABLED && !env.OPENAI_API_KEY)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['OPENAI_API_KEY'],
        message: 'OpenAI API key is required when extraction is enabled',
      });
  });

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function assertProductionAuthSafety(
  env: Pick<ServerEnv, 'NODE_ENV' | 'APP_ENV' | 'ALLOW_DEV_AUTH'>,
): void {
  if (
    env.ALLOW_DEV_AUTH &&
    (env.NODE_ENV === 'production' ||
      env.APP_ENV === 'staging' ||
      env.APP_ENV === 'production')
  ) {
    throw new Error(
      'Invalid production-like configuration: ALLOW_DEV_AUTH must be false',
    );
  }
}

export function resolveServerPort(
  env: Pick<ServerEnv, 'PORT' | 'API_PORT'>,
): number {
  return env.PORT ?? env.API_PORT;
}
