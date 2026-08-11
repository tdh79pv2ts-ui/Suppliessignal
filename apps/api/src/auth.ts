import { createClient } from '@supabase/supabase-js';
import type { NextFunction, Request, Response } from 'express';
import type { AuthenticatedUser, ServerEnv, UserRole } from '@suppliesignal/shared';
import { bearerTokenSchema } from '@suppliesignal/shared';
import { db } from '@suppliesignal/db';

export type ResolveUser = (request: Request) => Promise<AuthenticatedUser | null>;

export function createUserResolver(env: ServerEnv): ResolveUser {
  const supabase =
    env.SUPABASE_URL && env.SUPABASE_ANON_KEY
      ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
      : null;

  return async (request) => {
    if (env.ALLOW_DEV_AUTH && env.NODE_ENV !== 'production') {
      const devUserId = request.header('x-dev-user-id');
      if (devUserId) return findApplicationUser(devUserId);
    }

    const authorization = request.header('authorization');
    const parsed = bearerTokenSchema.safeParse(authorization);
    if (!parsed.success || !supabase) return null;

    const token = parsed.data.replace(/^Bearer\s+/i, '');
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return null;

    return findApplicationUser(data.user.id);
  };
}

async function findApplicationUser(id: string): Promise<AuthenticatedUser | null> {
  const user = await db.user.findUnique({
    where: { id },
    include: { memberships: { select: { customerId: true } } },
  });
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    customerIds: user.memberships.map((membership) => membership.customerId),
  };
}

export function requireAuth(resolveUser: ResolveUser) {
  return async (request: Request, response: Response, next: NextFunction) => {
    try {
      const user = await resolveUser(request);
      if (!user) {
        response.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid authentication is required' } });
        return;
      }
      request.authUser = user;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireRole(...roles: UserRole[]) {
  return (request: Request, response: Response, next: NextFunction) => {
    if (!request.authUser || !roles.includes(request.authUser.role)) {
      response.status(403).json({ error: { code: 'FORBIDDEN', message: 'Your role cannot access this resource' } });
      return;
    }
    next();
  };
}

export function assertCustomerAccess(user: AuthenticatedUser, requestedCustomerId: string): boolean {
  return user.role === 'ADMIN' || user.customerIds.includes(requestedCustomerId);
}
