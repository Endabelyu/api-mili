import { OpenAPIHono, z } from '@hono/zod-openapi';
import { requireAuth } from '@server/lib/auth-middleware.server';
import { db } from '@server/lib/db';
import { feedbacks, users } from '@db/schema';
import { eq, desc } from 'drizzle-orm';
import { logActivity } from '@server/lib/activity-logger';
import { HTTPException } from 'hono/http-exception';

const app = new OpenAPIHono();
const API_TAGS = ['Feedbacks'];

// Apply auth middleware to all routes
app.use('*', requireAuth);

const createSchema = z.object({
  message: z.string().min(1).max(2000),
  rating: z.number().int().min(1).max(5).default(5),
});

app.openapi({
  method: 'post',
  path: '/',
  summary: 'Submit a feedback',
  request: {
    body: {
      content: {
        'application/json': {
          schema: createSchema
        }
      }
    }
  },
  responses: {
    201: {
      description: 'Created',
      content: {
        'application/json': {
          schema: z.any()
        }
      }
    }
  },
  tags: API_TAGS
}, async (c) => {
  const user = c.get('user') as { id: string };
  const data = c.req.valid('json');

  const [feedback] = await db.insert(feedbacks).values({
    userId: user.id,
    message: data.message,
    rating: data.rating,
  }).returning();

  logActivity(
    user.id, 
    'SUBMIT_FEEDBACK', 
    `Submitted feedback with rating ${data.rating}`, 
    { feedbackId: feedback.id, rating: data.rating },
    c.req.header('x-forwarded-for')
  );

  return c.json(feedback, 201);
});

app.openapi({
  method: 'get',
  path: '/',
  summary: 'Get all feedbacks (Developer only)',
  responses: {
    200: {
      description: 'Success',
      content: {
        'application/json': {
          schema: z.object({
            items: z.array(z.any())
          })
        }
      }
    },
    403: { description: 'Forbidden' }
  },
  tags: API_TAGS
}, async (c) => {
  const user = c.get('user') as { id: string, email?: string };
  
  // Developer access restriction
  if (user.email !== 'endabelyuproject@gmail.com') {
    throw new HTTPException(403, { message: 'Forbidden' });
  }

  const items = await db
    .select({
      id: feedbacks.id,
      message: feedbacks.message,
      rating: feedbacks.rating,
      createdAt: feedbacks.createdAt,
      user: {
        id: users.id,
        name: users.name,
        email: users.email,
      }
    })
    .from(feedbacks)
    .innerJoin(users, eq(feedbacks.userId, users.id))
    .orderBy(desc(feedbacks.createdAt));

  return c.json({ items });
});

export default app;
export type FeedbacksApp = typeof app;
