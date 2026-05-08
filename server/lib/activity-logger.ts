import { db } from './db';
import { activityLogs } from '@db/schema/activity-logs';
import { logger } from './logger';

export const logActivity = (
  userId: string,
  action: string,
  description: string,
  metadata?: Record<string, any>,
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
