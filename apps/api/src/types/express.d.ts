import type { AuthenticatedUser } from '@suppliesignal/shared';

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthenticatedUser;
    }
  }
}

export {};
