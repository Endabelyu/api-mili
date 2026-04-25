import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from './db';
import * as schema from '@db/schema';
import { MiddlewareHandler } from 'hono';

// Derive trusted origins from env — avoids hardcoding production URLs in source.
// FRONTEND_URL must be set in production (e.g. https://finance-web.endabelyu.com).
const LOCAL_DEV_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3005',
];

const trustedOrigins = process.env.FRONTEND_URL
  ? [process.env.FRONTEND_URL, ...LOCAL_DEV_ORIGINS]
  : LOCAL_DEV_ORIGINS;

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: schema.users,
      session: schema.session,
      account: schema.account,
      verification: schema.verification
    },
  }),
  baseURL: process.env.NODE_ENV === 'production'
    ? process.env.BETTER_AUTH_URL
    : 'http://localhost:3005/api/auth',
  secret: process.env.BETTER_AUTH_SECRET,
  emailAndPassword: {
    enabled: true,
  },
  trustedOrigins,
});

export const requireAuth: MiddlewareHandler = async (c, next) => {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  c.set('user', session.user);
  await next();
};
