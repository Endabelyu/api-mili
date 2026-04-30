/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { testClient } from 'hono/testing';
import scheduledRoute from './scheduled';
import * as dbModule from '@server/lib/db';
import * as transactionService from '../lib/services/transactions.server';
import type { MiddlewareHandler } from 'hono';

// Mock the database
vi.mock('@server/lib/db', () => {
  const mockDb = {
    query: {
      scheduledTransactions: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
      },
    },
    insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn() })) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn() })) })) })),
    delete: vi.fn(() => ({ where: vi.fn() })),
    transaction: vi.fn(async (callback) => {
      return await callback(mockDb);
    }),
  };
  return { db: mockDb };
});

// Mock transaction service
vi.mock('../lib/services/transactions.server', () => ({
  createTransaction: vi.fn().mockResolvedValue({ id: 'txn-new-123' }),
}));

// Mock auth middleware
vi.mock('@server/lib/auth-middleware.server', () => ({
  requireAuth: (async (c, next) => {
    c.set('user', { id: 'user-123', email: 'test@example.com' });
    await next();
  }) as MiddlewareHandler,
}));

describe('Scheduled Transactions API', () => {
  const mockScheduled = {
    id: 'sched-123',
    userId: 'user-123',
    type: 'expense',
    amount: '100.00',
    categoryId: 'food',
    frequency: 'monthly',
    nextRunDate: new Date('2024-01-01'),
    description: 'Netflix',
    status: 'active',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/scheduled/:id/post', () => {
    it('should execute a scheduled transaction and update next run date', async () => {
      const db = dbModule.db;
      db.query.scheduledTransactions.findFirst.mockResolvedValue(mockScheduled);
      db.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ ...mockScheduled, nextRunDate: new Date('2024-02-01') }]),
          }),
        }),
      });

      const client = testClient(scheduledRoute);
      // @ts-ignore
      const res = await client[':id'].post.$post({
        param: { id: 'sched-123' },
      });

      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      
      // Verify transaction was created
      expect(transactionService.createTransaction).toHaveBeenCalledWith(expect.objectContaining({
        amount: '100.00',
        categoryId: 'food',
        type: 'expense',
      }));

      // Verify next run date was bumped (2024-01-01 -> 2024-02-01 for monthly)
      const updateCall = db.update().set.mock.calls[0][0];
      const nextRunDate = new Date(updateCall.nextRunDate);
      expect(nextRunDate.getMonth()).toBe(1); // February (0-indexed)
    });

    it('should return 404 if scheduled transaction not found', async () => {
      const db = dbModule.db;
      db.query.scheduledTransactions.findFirst.mockResolvedValue(null);

      const client = testClient(scheduledRoute);
      // @ts-ignore
      const res = await client[':id'].post.$post({
        param: { id: 'nonexistent' },
      });

      expect(res.status).toBe(404);
    });
  });
});
