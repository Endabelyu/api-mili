/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { testClient } from 'hono/testing';
import transactionsRoute from './transactions';
import * as dbModule from '@server/lib/db';
import type { MiddlewareHandler } from 'hono';

type MockDb = {
  query: {
    transactions: { findMany: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn> };
    categories: { findFirst: ReturnType<typeof vi.fn> };
  };
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

// Mock the database
vi.mock('@server/lib/db', () => ({
  db: {
    query: {
      transactions: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
      },
      categories: {
        findFirst: vi.fn(),
      },
    },
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn() })) })),
    insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn() })) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn() })) })) })),
    delete: vi.fn(() => ({ where: vi.fn() })),
  },
}));

// Mock auth middleware - use c.set for Hono context
vi.mock('@server/lib/auth-middleware.server', () => ({
  requireAuth: (async (c, next) => {
    const mockUser = { id: 'user-123', email: 'test@example.com' };
    c.set('user', mockUser);
    await next();
  }) as MiddlewareHandler,
}));

describe('Transactions API', () => {
  const mockTransaction = {
    id: 'txn-123',
    userId: 'user-123',
    type: 'expense' as const,
    amount: '50.00',
    categoryId: 'food',
    description: 'Grocery shopping',
    date: new Date('2024-01-15'),
    createdAt: new Date(),
    updatedAt: new Date(),
    category: {
      id: 'food',
      label: 'Food & Dining',
      color: '#FF5722',
      icon: '🍔',
      type: 'expense' as const,
    },
  };

  const mockCategory = {
    id: 'food',
    label: 'Food & Dining',
    color: '#FF5722',
    icon: '🍔',
    type: 'expense' as const,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/transactions', () => {
    it('should list transactions for authenticated user', async () => {
      const db = dbModule.db as unknown as MockDb;
      db.query.transactions.findMany.mockResolvedValue([mockTransaction]);
      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 1 }]),
        }),
      });

      // @ts-expect-error - testClient type inference
      const client = testClient(transactionsRoute);
      const res = await client.index.$get({ query: {} });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.items).toHaveLength(1);
      expect(data.items[0].id).toBe('txn-123');
      expect(data.pagination.total).toBe(1);
    });

    it('should filter transactions by type', async () => {
      const db = dbModule.db as unknown as MockDb;
      db.query.transactions.findMany.mockResolvedValue([]);
      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 0 }]),
        }),
      });

      // @ts-expect-error - testClient type inference
      const client = testClient(transactionsRoute);
      const res = await client.index.$get({ query: { type: 'income' } });

      expect(res.status).toBe(200);
    });

    it('should filter transactions by month', async () => {
      const db = dbModule.db as unknown as MockDb;
      db.query.transactions.findMany.mockResolvedValue([]);
      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 0 }]),
        }),
      });

      // @ts-expect-error - testClient type inference
      const client = testClient(transactionsRoute);
      const res = await client.index.$get({ query: { month: '2024-01' } });

      expect(res.status).toBe(200);
    });

    it('should filter transactions by search term', async () => {
      const db = dbModule.db as unknown as MockDb;
      db.query.transactions.findMany.mockResolvedValue([]);
      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 0 }]),
        }),
      });

      // @ts-expect-error - testClient type inference
      const client = testClient(transactionsRoute);
      const res = await client.index.$get({ query: { search: 'grocery' } });

      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/transactions', () => {
    it('should create a new transaction', async () => {
      const db = dbModule.db as unknown as MockDb;
      db.query.categories.findFirst.mockResolvedValue(mockCategory);
      db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockTransaction]),
        }),
      });

      // @ts-expect-error - testClient type inference
      const client = testClient(transactionsRoute);
      const res = await client.index.$post({
        json: {
          type: 'expense',
          amount: 50.00,
          categoryId: 'food',
          description: 'Grocery shopping',
          date: '2024-01-15',
        },
      });
      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data.id).toBe('txn-123');
    });

    it('should return 400 for invalid category', async () => {
      const db = dbModule.db as unknown as MockDb;
      db.query.categories.findFirst.mockResolvedValue(null);

      // @ts-expect-error - testClient type inference
      const client = testClient(transactionsRoute);
      const res = await client.index.$post({
        json: {
          type: 'expense',
          amount: 50.00,
          categoryId: 'nonexistent',
          description: 'Test',
          date: '2024-01-15',
        },
      });
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe('Category not found');
    });

    it('should return 400 for invalid request body', async () => {
      // @ts-expect-error - testClient type inference
      const client = testClient(transactionsRoute);
      const res = await client.index.$post({
        json: {
          type: 'invalid',
          amount: 'not-a-number',
        } as unknown as Record<string, unknown>,
      });

      expect(res.status).toBe(400);
    });
  });

  describe('PUT /api/transactions/:id', () => {
    it('should update own transaction', async () => {
      const db = dbModule.db as unknown as MockDb;
      db.query.transactions.findFirst.mockResolvedValue(mockTransaction);
      db.query.categories.findFirst.mockResolvedValue(mockCategory);
      db.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ ...mockTransaction, amount: '75.00' }]),
          }),
        }),
      });

      // @ts-expect-error - testClient type inference
      const client = testClient(transactionsRoute);
      const res = await client[':id'].$put({
        param: { id: 'txn-123' },
        json: { amount: 75.00 },
      });

      expect(res.status).toBe(200);
    });

    it('should return 404 for non-existent transaction', async () => {
      const db = dbModule.db as unknown as MockDb;
      db.query.transactions.findFirst.mockResolvedValue(null);

      // @ts-expect-error - testClient type inference
      const client = testClient(transactionsRoute);
      const res = await client[':id'].$put({
        param: { id: 'nonexistent' },
        json: { amount: 75.00 },
      });
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.error).toBe('Transaction not found');
    });

    it('should return 403 for updating other user transaction', async () => {
      const db = dbModule.db as unknown as MockDb;
      db.query.transactions.findFirst.mockResolvedValue({
        ...mockTransaction,
        userId: 'other-user',
      });

      // @ts-expect-error - testClient type inference
      const client = testClient(transactionsRoute);
      const res = await client[':id'].$put({
        param: { id: 'txn-123' },
        json: { amount: 75.00 },
      });
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data.error).toBe('Forbidden');
    });
  });

  describe('DELETE /api/transactions/:id', () => {
    it('should delete own transaction', async () => {
      const db = dbModule.db as unknown as MockDb;
      db.query.transactions.findFirst.mockResolvedValue(mockTransaction);
      db.delete.mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });

      // @ts-expect-error - testClient type inference
      const client = testClient(transactionsRoute);
      const res = await client[':id'].$delete({
        param: { id: 'txn-123' },
      });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('should return 404 for non-existent transaction', async () => {
      const db = dbModule.db as unknown as MockDb;
      db.query.transactions.findFirst.mockResolvedValue(null);

      // @ts-expect-error - testClient type inference
      const client = testClient(transactionsRoute);
      const res = await client[':id'].$delete({
        param: { id: 'nonexistent' },
      });
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.error).toBe('Transaction not found');
    });

    it('should return 403 for deleting other user transaction', async () => {
      const db = dbModule.db as unknown as MockDb;
      db.query.transactions.findFirst.mockResolvedValue({
        ...mockTransaction,
        userId: 'other-user',
      });

      // @ts-expect-error - testClient type inference
      const client = testClient(transactionsRoute);
      const res = await client[':id'].$delete({
        param: { id: 'txn-123' },
      });
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data.error).toBe('Forbidden');
    });
  });
});