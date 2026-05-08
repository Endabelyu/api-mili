import { MiddlewareHandler } from 'hono';
import { auth } from './auth';

/**
 * Require authentication middleware - returns 401 if not authenticated
 */
export const requireAuth: MiddlewareHandler = async (c, next) => {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  // Cast user with banned property
  const user = session.user as { banned?: boolean };
  if (user.banned === true) {
    return c.json({ error: 'Your account has been banned. Please contact support.' }, 403);
  }

  c.set('user', session.user);
  await next();
};

/**
 * Optional auth middleware - sets user if authenticated, continues regardless
 */
export const optionalAuth: MiddlewareHandler = async (c, next) => {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (session) {
    c.set('user', session.user);
  }

  await next();
};

/**
 * Get user from context (after requireAuth or optionalAuth)
 */
export function getUser(c: Parameters<MiddlewareHandler>[0]): { id: string; email: string; name?: string | null; image?: string | null } | null {
  return c.get('user') as { id: string; email: string; name?: string | null; image?: string | null } | null;
}
