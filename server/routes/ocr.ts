import { OpenAPIHono, z } from '@hono/zod-openapi';
import { requireAuth } from '@server/lib/auth-middleware.server';
import { writeLimiter } from '@server/lib/rate-limit';
import { logger } from '@server/lib/logger';
import { db } from '@server/lib/db';
import { rateLimits } from '@db/schema';
import { eq, sql } from 'drizzle-orm';

const app = new OpenAPIHono();
const API_TAGS = ['OCR'];

// Auth + rate limit
app.use('*', requireAuth);
app.use('*', writeLimiter);

async function checkQuota(userId: string): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10);
  const limit = parseInt(process.env.OCR_DAILY_LIMIT || '10', 10);
  const key = `ocr:${userId}:${today}`;
  const midnight = new Date(`${today}T23:59:59Z`);

  const result = await db
    .insert(rateLimits)
    .values({ key, totalHits: 1, expiresAt: midnight })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: { totalHits: sql`${rateLimits.totalHits} + 1` },
    })
    .returning({ totalHits: rateLimits.totalHits });

  return result[0].totalHits <= limit;
}

// ─── Claude Vision System Prompt ─────────────────────────────────────────────
const SYSTEM_PROMPT = `
You are a receipt OCR assistant. Extract all data from the receipt image and return ONLY a JSON object.
No explanation, no markdown, no preamble — raw JSON only.

Return this exact structure:
{
  "store_name": string,
  "date": string (ISO 8601, e.g. "2026-04-30"),
  "items": [
    {
      "name": string,
      "qty": number,
      "unit_price": number,
      "subtotal": number
    }
  ],
  "subtotal": number,
  "tax": number,
  "total": number,
  "payment_method": string (e.g. "QRIS", "Cash", "Debit"),
  "currency": "IDR"
}

Rules:
- All prices in smallest currency unit (e.g. 15000, not 15.000 or 15,000)
- If a field is not found, use null
- If qty is not shown, assume 1
- Date: if only partial date found, best-guess the year as current year
`.trim();

// ─── POST /scan-receipt ──────────────────────────────────────────────────────
const scanReceiptSchema = z.object({
  image: z.string().min(100).max(3_000_000), // base64, ~2MB max
});

app.openapi(
  {
    method: 'post',
    path: '/scan-receipt',
    summary: 'Scan a receipt image using Claude Vision AI',
    tags: API_TAGS,
    request: {
      body: {
        content: {
          'application/json': {
            schema: scanReceiptSchema,
          },
        },
      },
    },
    responses: {
      200: { description: 'Parsed receipt data' },
      429: { description: 'Daily scan quota exceeded' },
      500: { description: 'OCR processing failed' },
      503: { description: 'OCR service unavailable (no API key)' },
    },
  },
  async (c) => {
    const user = c.get('user') as { id: string };
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      return c.json({ error: 'OCR service not configured. Use client-side fallback.' }, 503);
    }

    // Quota check
    if (!await checkQuota(user.id)) {
      return c.json({ error: 'Batas scan harian tercapai. Coba lagi besok.' }, 429);
    }

    const { image } = c.req.valid('json');

    // Detect media type from base64 data URI prefix
    const mediaTypeMatch = image.match(/^data:(image\/[a-z+]+);base64,/);
    const detectedMediaType = mediaTypeMatch?.[1] ?? 'image/jpeg';
    const allowedMediaTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const mediaType = allowedMediaTypes.includes(detectedMediaType) ? detectedMediaType : 'image/jpeg';
    // Strip data URI prefix if present
    const imageData = image.includes(',') ? image.split(',')[1] : image;

    try {
      logger.info('[OCR] Scanning receipt', { userId: user.id });

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-3-5-20241022',
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                    data: imageData,
                  },
                },
                {
                  type: 'text',
                  text: 'Extract all data from this receipt.',
                },
              ],
            },
          ],
        }),
      });

      if (!response.ok) {
        const errBody = await response.text();
        logger.error('[OCR] Claude API error', { status: response.status, body: errBody });
        return c.json({ error: 'OCR processing failed' }, 500);
      }

      const data = (await response.json()) as { content?: { text: string }[] };
      const rawText = data.content?.[0]?.text || '';
      
      // Strip markdown fences if Claude wraps the JSON
      const cleaned = rawText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const parsed = JSON.parse(cleaned);

      logger.info('[OCR] Scan successful', { userId: user.id, store: parsed.store_name });
      return c.json(parsed, 200);
    } catch (err) {
      logger.error('[OCR] Processing error', { error: String(err) });
      return c.json({ error: 'Failed to parse receipt. Try again with a clearer photo.' }, 500);
    }
  }
);

// ─── GET /status ─────────────────────────────────────────────────────────────
app.openapi(
  {
    method: 'get',
    path: '/status',
    summary: 'Check if OCR AI features are enabled',
    tags: API_TAGS,
    responses: {
      200: {
        description: 'AI Status',
        content: {
          'application/json': {
            schema: z.object({
              enabled: z.boolean(),
              limit: z.number(),
            }),
          },
        },
      },
    },
  },
  async (c) => {
    return c.json({
      enabled: !!process.env.ANTHROPIC_API_KEY,
      limit: parseInt(process.env.OCR_DAILY_LIMIT || '10', 10),
    });
  }
);

export default app;
