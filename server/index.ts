import 'dotenv/config';
import { initSentry, sentryMiddleware } from './lib/sentry';
// Sentry must be initialised before any other imports that might throw
initSentry();

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { logger as honoLogger } from 'hono/logger';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';

import apiRoutes from './routes';
import { monitoringMiddleware, getMetrics, getPrometheusMetrics, logMetricsSnapshot } from './lib/monitoring';
import { logger as appLogger } from './lib/logger';
import { apiReference } from '@scalar/hono-api-reference';
import { openApiSpec } from './openapi';
import { db, pingDb } from './lib/db';
import { csrf } from 'hono/csrf';

const app = new Hono();

// Middleware
app.use(honoLogger());
app.use('*', monitoringMiddleware as unknown as import('hono').MiddlewareHandler);
app.use('*', sentryMiddleware as unknown as import('hono').MiddlewareHandler);
app.use(cors({
  origin: (origin) => {
    const envOrigins = process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',').map(u => u.trim()).filter(Boolean) : ['http://localhost:5174'];
    const allowedOrigins = [
      ...envOrigins,
      'http://localhost:5173',
      'http://localhost:4016',
      'http://localhost:3000',
      'https://finance-web.endabelyu.com',
      'https://finance-api.endabelyu.com',
      'http://finance-web.endabelyu.com',
      'http://finance-api.endabelyu.com'
    ];
    if (!origin || allowedOrigins.some(o => origin.startsWith(o)) || origin.endsWith('.endabelyu.com')) return origin || '*';
    return null;
  },
  credentials: true,
  allowHeaders: ['Content-Type', 'Authorization', 'X-Trace-ID'],
  exposeHeaders: ['X-Trace-ID'],
}));
app.use(async (c, next) => {
  // Skip CSRF for Better Auth since it has its own built-in CSRF protection
  if (c.req.path.startsWith('/api/auth')) {
    return next();
  }
  
  const csrfMiddleware = csrf({
    origin: (origin) => {
      const envOrigins = process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',').map(u => u.trim()).filter(Boolean) : ['http://localhost:5174'];
      const allowedOrigins = [
        ...envOrigins,
        'http://localhost:5173',
        'http://localhost:4016',
        'http://localhost:3000',
        'https://finance-web.endabelyu.com',
        'https://finance-api.endabelyu.com',
        'http://finance-web.endabelyu.com',
        'http://finance-api.endabelyu.com'
      ];
      // In production require exact match or subdomain match.
      // In dev allow localhost
      if (!origin) return false;
      return allowedOrigins.some(o => origin.startsWith(o)) || origin.endsWith('.endabelyu.com');
    }
  });
  
  return csrfMiddleware(c, next);
});
app.use(secureHeaders());

// Error handlers
process.on('uncaughtException', (err) => {
  appLogger.error('[Uncaught Exception]', { error: err.message, stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  appLogger.error('[Unhandled Rejection]', { reason: String(reason) });
});

// Health check — pings DB to verify full readiness (fast timeout: 3s)
app.get('/health', async (c) => {
  const dbOk = await pingDb();
  if (dbOk) {
    return c.json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() });
  }
  appLogger.error('Health check DB ping failed');
  return c.json({ status: 'degraded', db: 'unreachable', timestamp: new Date().toISOString() }, 503);
});
// Liveness probe — no DB check (just confirms process is alive)
app.get('/livez', (c) => c.json({ status: 'ok' }));
// Readiness probe — confirms DB is reachable before accepting traffic
app.get('/readyz', async (c) => {
  const dbOk = await pingDb();
  return dbOk ? c.json({ status: 'ok' }) : c.json({ status: 'not ready' }, 503);
});

// Metrics endpoint — protected in production by a shared secret
app.get('/metrics', (c) => {
  if (process.env.NODE_ENV === 'production') {
    const key = c.req.header('X-Metrics-Key');
    if (key !== process.env.METRICS_SECRET) {
      return c.json({ error: 'Forbidden' }, 403);
    }
  }
  const accept = c.req.header('Accept');
  if (accept && accept.includes('application/json')) {
    return c.json(getMetrics());
  }
  return c.text(getPrometheusMetrics());
});

// API routes
// /api/v1 is the canonical versioned path (standards §19 — required from day one)
// /api is kept for backward compatibility during the transition window
app.route('/api/v1', apiRoutes);
app.route('/api', apiRoutes);

// Root — API info
app.get('/', (c) => {
  return c.html(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Finance Tracker API Engine</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-color: #0f172a;
            --text-color: #f8fafc;
            --primary: #3b82f6;
            --accent: #8b5cf6;
            --glass-bg: rgba(30, 41, 59, 0.7);
            --glass-border: rgba(255, 255, 255, 0.1);
        }
        body {
            margin: 0;
            padding: 0;
            font-family: 'Outfit', sans-serif;
            background-color: var(--bg-color);
            color: var(--text-color);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background-image: 
                radial-gradient(circle at 15% 50%, rgba(59, 130, 246, 0.15), transparent 25%),
                radial-gradient(circle at 85% 30%, rgba(139, 92, 246, 0.15), transparent 25%);
        }
        .container {
            background: var(--glass-bg);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border: 1px solid var(--glass-border);
            border-radius: 24px;
            padding: 4rem;
            max-width: 650px;
            text-align: center;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
            animation: fadeIn 0.8s ease-out;
            margin: 1rem;
        }
        h1 {
            font-size: clamp(2.5rem, 5vw, 3.5rem);
            margin: 0 0 1rem 0;
            background: linear-gradient(135deg, #60a5fa, #c084fc);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            font-weight: 800;
            letter-spacing: -0.025em;
        }
        p {
            font-size: 1.15rem;
            color: #94a3b8;
            margin-bottom: 2.5rem;
            line-height: 1.7;
        }
        .meta-tags {
            display: flex;
            gap: 1rem;
            justify-content: center;
            margin-bottom: 3rem;
            flex-wrap: wrap;
        }
        .tag {
            background: rgba(255,255,255,0.05);
            padding: 0.5rem 1rem;
            border-radius: 99px;
            font-size: 0.9rem;
            border: 1px solid var(--glass-border);
            color: #cbd5e1;
            font-weight: 600;
        }
        .tag.version { color: #60a5fa; border-color: rgba(96, 165, 250, 0.3); background: rgba(96, 165, 250, 0.1); }
        .tag.status { color: #34d399; border-color: rgba(52, 211, 153, 0.3); background: rgba(52, 211, 153, 0.1); }
        
        .actions {
            display: flex;
            gap: 1.5rem;
            justify-content: center;
            flex-wrap: wrap;
        }
        a.btn {
            text-decoration: none;
            padding: 1rem 2rem;
            border-radius: 12px;
            font-weight: 600;
            font-size: 1.1rem;
            transition: all 0.3s ease;
        }
        a.btn-primary {
            background: linear-gradient(135deg, var(--primary), var(--accent));
            color: white;
            box-shadow: 0 10px 20px -10px rgba(139, 92, 246, 0.5);
        }
        a.btn-primary:hover {
            transform: translateY(-3px);
            box-shadow: 0 15px 25px -10px rgba(139, 92, 246, 0.7);
        }
        a.btn-secondary {
            background: rgba(255, 255, 255, 0.05);
            color: #cbd5e1;
            border: 1px solid var(--glass-border);
        }
        a.btn-secondary:hover {
            background: rgba(255, 255, 255, 0.1);
            color: white;
            transform: translateY(-3px);
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .footer {
            margin-top: 3.5rem;
            font-size: 0.85rem;
            color: #475569;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }
        .ping {
            display: inline-block;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background-color: #10b981;
            margin-right: 8px;
            box-shadow: 0 0 12px #10b981;
            animation: pulse 2s infinite;
        }
        @keyframes pulse {
            0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
            70% { box-shadow: 0 0 0 8px rgba(16, 185, 129, 0); }
            100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Finance Tracker API</h1>
        <p>A high-performance Node.js REST API driving the future of personal wealth management and real-time financial analytics.</p>
        
        <div class="meta-tags">
            <div class="tag version">v1.0.0</div>
            <div class="tag status"><span class="ping"></span>All Systems Operational</div>
            <div class="tag">Powered by Hono</div>
        </div>

        <div class="actions">
            <a href="/docs" class="btn btn-primary">Open API Swagger &rarr;</a>
            <a href="/metrics" class="btn btn-secondary">System Metrics</a>
        </div>
        
        <div class="footer">
            Server is running securely on port ${process.env.PORT || '4006'}
        </div>
    </div>
</body>
</html>
  `);
});

// Serve OpenAPI spec — dynamically inject the current server URL
app.get('/openapi.json', (c) => {
  const url = new URL(c.req.url);
  // x-forwarded-proto is set by the reverse proxy in production.
  // Fall back to 'https' in production and 'http' in development.
  const defaultProtocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
  const protocol = c.req.header('x-forwarded-proto') || defaultProtocol;
  const host = c.req.header('x-forwarded-host') || c.req.header('host') || url.host;

  return c.json({
    ...openApiSpec,
    servers: [
      {
        url: `${protocol}://${host}`,
        description: process.env.NODE_ENV === 'production' ? 'Production' : 'Local Dev'
      }
    ]
  });
});

// OpenAPI Scalar UI dashboard
app.get('/docs', apiReference({ 
  url: '/openapi.json',
  theme: 'purple',
  layout: 'modern'
}));

// Error handler
import { HTTPException } from 'hono/http-exception';

app.onError((err, c) => {
  appLogger.error('Server Error', { error: err.message, stack: err.stack });
  
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  
  // Hide technical details from frontend in production
  const isProd = process.env.NODE_ENV === 'production';
  const message = isProd ? 'Internal Server Error' : err.message;
  
  return c.json({ error: 'Internal Server Error', message }, 500);
});

// Not found handler
app.notFound((c) => c.json({ error: 'Not Found' }, 404));

// Start server
const port = parseInt(process.env.PORT || '3005');
appLogger.info('Server starting', { port, cwd: process.cwd(), env: process.env.NODE_ENV });

serve({
  fetch: app.fetch,
  port,
}, (info: { port: number }) => {
  appLogger.info('Server running', { url: `http://localhost:${info.port}` });
  setInterval(logMetricsSnapshot, 5 * 60 * 1000).unref();
});
