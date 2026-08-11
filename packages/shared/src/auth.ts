import { z } from 'zod';
import { userRoles } from './types.js';

export const authenticatedUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().nullable(),
  role: z.enum(userRoles),
  customerIds: z.array(z.string().uuid()),
});

export const bearerTokenSchema = z
  .string()
  .regex(/^Bearer\s+\S+$/i, 'Expected a Bearer token');
