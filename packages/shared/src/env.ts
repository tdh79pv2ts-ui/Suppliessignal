import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

export const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.string().min(1),
    SUPABASE_URL: z.string().url().optional(),
    SUPABASE_ANON_KEY: z.string().min(1).optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
    API_PORT: z.coerce.number().int().positive().default(4000),
    WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
    ALLOW_DEV_AUTH: booleanString,
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  })
  .superRefine((env, context) => {
    if (env.NODE_ENV === 'production' && env.ALLOW_DEV_AUTH) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['ALLOW_DEV_AUTH'], message: 'Development auth cannot run in production' });
    }
    if (!env.ALLOW_DEV_AUTH && (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['SUPABASE_URL'], message: 'Supabase configuration is required unless development auth is enabled' });
    }
  });

export type ServerEnv = z.infer<typeof serverEnvSchema>;
