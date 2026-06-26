import { MiddlewareHandler } from 'hono';
import { auth } from './auth';
import { db } from './db';
import { users } from '@db/schema';
import { eq } from 'drizzle-orm';

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

  // Background update lastSeenAt (throttled to 5 mins)
  const now = new Date();
  const lastSeen = session.user.lastSeenAt ? new Date(session.user.lastSeenAt) : null;
  if (!lastSeen || (now.getTime() - lastSeen.getTime() > 5 * 60 * 1000)) {
    db.update(users)
      .set({ lastSeenAt: now })
      .where(eq(users.id, session.user.id))
      .execute()
      .catch(err => console.error('Failed to update lastSeenAt', err));
  }

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
