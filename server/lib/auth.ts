import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from './db';
import * as schema from '@db/schema';
import { logActivity } from './activity-logger';

// Derive trusted origins from env — avoids hardcoding production URLs in source.
// FRONTEND_URL must be set in production (e.g. https://finance-web.endabelyu.com).
const LOCAL_DEV_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:4016',
  'http://localhost:5174',
  'http://localhost:4015',
];

const envOrigins = process.env.FRONTEND_URL 
  ? process.env.FRONTEND_URL.split(',').map(u => u.trim()).filter(Boolean)
  : [];

const trustedOrigins = [...envOrigins, ...LOCAL_DEV_ORIGINS];

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
  user: {
    additionalFields: {
      role: { type: 'string', required: false, defaultValue: 'user' },
      lastSeenAt: { type: 'date', required: false },
      banned: { type: 'boolean', required: false, defaultValue: false },
    }
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          logActivity(user.id, 'USER_REGISTER', `Pengguna baru terdaftar dengan email ${user.email}`);
        },
      },
    },
    session: {
      create: {
        after: async (session) => {
          logActivity(session.userId, 'USER_LOGIN', `Pengguna berhasil masuk ke sistem`);
        },
      },
    },
  },
  baseURL: process.env.NODE_ENV === 'production'
    ? `${process.env.BETTER_AUTH_URL}/api/auth`
    : 'http://localhost:4015/api/auth',
  secret: process.env.BETTER_AUTH_SECRET,
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    },
  },
  trustedOrigins,
  advanced: {
    cookiePrefix: 'saku',
    useSecureCookies: process.env.NODE_ENV === 'production',
    crossSubDomainCookies: {
      enabled: false,
    },
  },
});
