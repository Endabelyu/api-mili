import { db } from './db';
import { activityLogs } from '@db/schema/activity-logs';
import { logger } from './logger';

export function getClientIp(c: { req: { header(name: string): string | undefined } }): string | undefined {
  const realIp = c.req.header('x-real-ip');
  if (realIp) return realIp.trim();
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim(); // leftmost = original client
  return undefined;
}

export const logActivity = (
  userId: string,
  action: string,
  description: string,
  metadata?: Record<string, unknown>,
  ipAddress?: string
) => {
  // Fire and forget, do not await it so it doesn't block the request
  db.insert(activityLogs)
    .values({
      userId,
      action,
      description,
      metadata,
      ipAddress,
    })
    .execute()
    .catch((err) => {
      logger.error('Failed to log activity', { error: err.message, userId, action });
    });
};
