import { Hono } from 'hono';
import { db } from '../lib/db';
import { userConsents } from '@db/schema';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

const consentApp = new Hono();

const consentSchema = z.object({
  consentVersion: z.string().min(1),
});

consentApp.post('/', zValidator('json', consentSchema), async (c) => {
  const { consentVersion } = c.req.valid('json');
  
  // Hash the IP address for privacy
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip') || 'unknown';
  
  // Simple fast hash to avoid storing raw PII
  const ipHash = Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip))
    )
  ).map(b => b.toString(16).padStart(2, '0')).join('');

  await db.insert(userConsents).values({
    ipHash,
    consentVersion,
  });

  return c.json({ success: true }, 201);
});

export default consentApp;
