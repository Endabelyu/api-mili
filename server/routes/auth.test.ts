/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { testClient } from 'hono/testing';
import type { AuthApp } from './auth';
import authRoute from './auth';

// Mock better-auth - use factory pattern with internal variables
const mockAuthHandler = vi.fn();

vi.mock('@server/lib/auth', () => ({
  auth: {
    handler: (...args: unknown[]) => mockAuthHandler(...args),
  },
}));

describe('Auth API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/auth/sign-in/email', () => {
    it('should handle sign in request', async () => {
      const mockResponse = new Response(
        JSON.stringify({ user: { id: 'user-123', email: 'test@example.com' } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
      mockAuthHandler.mockResolvedValue(mockResponse);

      // @ts-expect-error - testClient type inference
      const client = testClient(authRoute);
      const res = await client['sign-in'].email.$post({
        json: {
          email: 'test@example.com',
          password: 'password123',
        },
      });

      expect(res.status).toBe(200);
      expect(mockAuthHandler).toHaveBeenCalled();
    });

    it('should handle sign in with invalid credentials', async () => {
      const mockResponse = new Response(
        JSON.stringify({ error: 'Invalid credentials' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
      mockAuthHandler.mockResolvedValue(mockResponse);

      // @ts-expect-error - testClient type inference
      const client = testClient(authRoute);
      const res = await client['sign-in'].email.$post({
        json: {
          email: 'test@example.com',
          password: 'wrongpassword',
        },
      });

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/auth/sign-up/email', () => {
    it('should handle sign up request', async () => {
      const mockResponse = new Response(
        JSON.stringify({ user: { id: 'user-new', email: 'new@example.com' } }),
        { status: 201, headers: { 'Content-Type': 'application/json' } }
      );
      mockAuthHandler.mockResolvedValue(mockResponse);

      // @ts-expect-error - testClient type inference
      const client = testClient(authRoute);
      const res = await client['sign-up'].email.$post({
        json: {
          email: 'new@example.com',
          password: 'password123',
          name: 'New User',
        },
      });

      expect(res.status).toBe(201);
      expect(mockAuthHandler).toHaveBeenCalled();
    });

    it('should handle duplicate email', async () => {
      const mockResponse = new Response(
        JSON.stringify({ error: 'Email already exists' }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      );
      mockAuthHandler.mockResolvedValue(mockResponse);

      // @ts-expect-error - testClient type inference
      const client = testClient(authRoute);
      const res = await client['sign-up'].email.$post({
        json: {
          email: 'existing@example.com',
          password: 'password123',
          name: 'Existing User',
        },
      });

      expect(res.status).toBe(409);
    });
  });

  describe('POST /api/auth/sign-out', () => {
    it('should handle sign out request', async () => {
      const mockResponse = new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
      mockAuthHandler.mockResolvedValue(mockResponse);

      // @ts-expect-error - testClient type inference
      const client = testClient(authRoute);
      const res = await client['sign-out'].$post({});

      expect(res.status).toBe(200);
      expect(mockAuthHandler).toHaveBeenCalled();
    });
  });

  describe('GET /api/auth/session', () => {
    it('should return current session for authenticated user', async () => {
      const mockResponse = new Response(
        JSON.stringify({
          user: { id: 'user-123', email: 'test@example.com', name: 'Test User' },
          session: { id: 'session-123', userId: 'user-123' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
      mockAuthHandler.mockResolvedValue(mockResponse);

      // @ts-expect-error - testClient type inference
      const client = testClient(authRoute);
      const res = await client.session.$get();
      const data = await res.json();

      expect(res.status).toBe(200);
      if ('user' in data) {
        expect(data.user.id).toBe('user-123');
      }
    });

    it('should return 401 for unauthenticated request', async () => {
      const mockResponse = new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
      mockAuthHandler.mockResolvedValue(mockResponse);

      // @ts-expect-error - testClient type inference
      const client = testClient(authRoute);
      const res = await client.session.$get();

      expect(res.status).toBe(401);
    });
  });

  describe('Route mounting', () => {
    it('should mount auth handler at all routes', async () => {
      const mockResponse = new Response(
        JSON.stringify({ message: 'OK' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
      mockAuthHandler.mockResolvedValue(mockResponse);

      // @ts-expect-error - testClient type inference
      const client = testClient(authRoute);
      
      // Test that all routes go through the auth handler
      await client.$get();
      expect(mockAuthHandler).toHaveBeenCalledTimes(1);

      await client.session.$get();
      expect(mockAuthHandler).toHaveBeenCalledTimes(2);
    });
  });
});
