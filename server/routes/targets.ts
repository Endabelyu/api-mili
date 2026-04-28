import { OpenAPIHono, z } from '@hono/zod-openapi';
import { db } from '../lib/db';
import { targets } from '../../db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '../lib/auth-middleware.server';
import { HTTPException } from 'hono/http-exception';

const app = new OpenAPIHono();
const API_TAGS = ['Targets'];

app.use('*', requireAuth);

const createTargetSchema = z.object({
  name: z.string().min(1).max(255),
  targetAmount: z.string().or(z.number()).transform(v => String(v)),
  currentAmount: z.string().or(z.number()).optional().default('0').transform(v => String(v)),
  deadline: z.string().optional().nullable(),
  color: z.string().length(7).optional().default('#15803D'),
  icon: z.string().optional().default('🎯'),
  status: z.enum(['active', 'completed', 'paused']).optional().default('active'),
});

const updateTargetSchema = createTargetSchema.partial();

app.openapi({
  method: 'get',
  path: '/',
  summary: 'List targets',
  responses: {
    200: {
      description: 'Success',
      content: {
        'application/json': {
          schema: z.object({
            items: z.array(z.object({
              id: z.string(),
              userId: z.string(),
              name: z.string(),
              targetAmount: z.string(),
              currentAmount: z.string(),
              deadline: z.any().nullable(),
              color: z.string(),
              icon: z.string(),
              status: z.string()
            }))
          })
        }
      }
    }
  },
  tags: API_TAGS
}, async (c) => {
  const user = c.get('user') as { id: string };

  const result = await db.query.targets.findMany({
    where: eq(targets.userId, user.id),
    orderBy: (targets, { desc }) => [desc(targets.createdAt)],
  });

  return c.json({ items: result }, 200);
});

app.openapi({
  method: 'post',
  path: '/',
  summary: 'Create target',
  request: {
    body: {
      content: {
        'application/json': {
          schema: createTargetSchema
        }
      }
    }
  },
  responses: {
    201: {
      description: 'Created',
      content: {
        'application/json': {
          schema: z.object({
            id: z.string(),
            userId: z.string(),
            name: z.string(),
            targetAmount: z.string(),
            currentAmount: z.string(),
            deadline: z.any().nullable(),
            color: z.string(),
            icon: z.string(),
            status: z.string()
          })
        }
      }
    }
  },
  tags: API_TAGS
}, async (c) => {
  const user = c.get('user') as { id: string };
  const data = c.req.valid('json');
  const deadlineDate = data.deadline ? new Date(data.deadline) : null;

  const [newTarget] = await db.insert(targets)
    .values({
      ...data,
      userId: user.id,
      deadline: deadlineDate,
    })
    .returning();

  return c.json(newTarget, 201);
});

app.openapi({
  method: 'put',
  path: '/{id}',
  summary: 'Update target',
  request: {
    params: z.object({ id: z.string() }),
    body: {
      content: {
        'application/json': {
          schema: updateTargetSchema
        }
      }
    }
  },
  responses: {
    200: {
      description: 'Success',
      content: {
        'application/json': {
          schema: z.object({
            id: z.string(),
            userId: z.string(),
            name: z.string(),
            targetAmount: z.string(),
            currentAmount: z.string(),
            deadline: z.any().nullable(),
            color: z.string(),
            icon: z.string(),
            status: z.string()
          })
        }
      }
    }
  },
  tags: API_TAGS
}, async (c) => {
  const user = c.get('user') as { id: string };
  const { id } = c.req.valid('param');
  const data = c.req.valid('json');

  const existing = await db.query.targets.findFirst({
    where: and(eq(targets.id, id), eq(targets.userId, user.id)),
  });

  if (!existing) throw new HTTPException(404, { message: 'Target not found' });

  const { deadline, ...restData } = data;
  const updateData = { 
    ...restData, 
    updatedAt: new Date(),
    ...(deadline !== undefined && {
      deadline: deadline ? new Date(deadline) : null
    })
  };

  const [updatedTarget] = await db.update(targets)
    .set(updateData)
    .where(eq(targets.id, id))
    .returning();

  return c.json(updatedTarget, 200);
});

app.openapi({
  method: 'delete',
  path: '/{id}',
  summary: 'Delete target',
  request: {
    params: z.object({ id: z.string() })
  },
  responses: {
    204: {
      description: 'No Content'
    }
  },
  tags: API_TAGS
}, async (c) => {
  const user = c.get('user') as { id: string };
  const { id } = c.req.valid('param');

  const existing = await db.query.targets.findFirst({
    where: and(eq(targets.id, id), eq(targets.userId, user.id)),
  });

  if (!existing) throw new HTTPException(404, { message: 'Target not found' });

  await db.delete(targets).where(eq(targets.id, id));

  return new Response(null, { status: 204 });
});

export default app;
