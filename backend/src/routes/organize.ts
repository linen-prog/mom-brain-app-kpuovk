// redeploy: pick up OPENROUTER_API_KEY
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { App } from '../index.js';

interface Kid {
  name: string;
  age?: number;
  grade?: string;
  nicknames?: string[];
}

interface OrganizeRequestBody {
  text: string;
  kids?: Kid[];
  partnerName?: string;
}

export interface OrganizeResponse {
  doToday: string[];
  thisWeek: string[];
  kids: string[];
  home: string[];
  errands: string[];
  meals: string[];
  messages: string[];
  holdingForLater: string[];
  work?: string[];
  momCheckIn: string;
  taskMeta?: Array<{
    taskText: string;
    category: 'doToday' | 'thisWeek' | 'kids' | 'home' | 'errands' | 'meals' | 'messages' | 'work' | 'holdingForLater';
    childName?: string | null;
    delegation: 'me' | 'partner' | 'coparent' | 'kid';
    isPartnerTask: boolean;
  }>;
  trackingItems?: Array<{
    id: string;
    text: string;
    dueDate?: string | null;
    category: string;
  }>;
  rhythmInsights?: {
    topCategories: string[];
    recurringThemes: string[];
    momCheckIn: string;
  };
}

const OrganizeSchema = z.object({
  doToday: z.array(z.string()),
  thisWeek: z.array(z.string()),
  kids: z.array(z.string()),
  home: z.array(z.string()),
  errands: z.array(z.string()),
  meals: z.array(z.string()),
  messages: z.array(z.string()),
  holdingForLater: z.array(z.string()),
  work: z.array(z.string()).optional(),
  momCheckIn: z.string().min(1),
  taskMeta: z
    .array(
      z.object({
        taskText: z.string(),
        category: z.enum(['doToday', 'thisWeek', 'kids', 'home', 'errands', 'meals', 'messages', 'work', 'holdingForLater']),
        childName: z.string().nullable(),
        delegation: z.enum(['me', 'partner', 'coparent', 'kid']),
        isPartnerTask: z.boolean(),
      })
    )
    .optional(),
  trackingItems: z
    .array(
      z.object({
        id: z.string(),
        text: z.string(),
        dueDate: z.string().nullable(),
        category: z.string(),
      })
    )
    .optional(),
  rhythmInsights: z
    .object({
      topCategories: z.array(z.string()),
      recurringThemes: z.array(z.string()),
      momCheckIn: z.string(),
    })
    .optional(),
});

export const ORGANIZE_SYSTEM_PROMPT = `You are a compassionate AI assistant helping a busy mom organize her mental load. Parse the brain dump text and return a JSON object with these exact fields.

CATEGORIES:
- doToday: urgent tasks for today
- thisWeek: tasks for this week (not today)
- kids: kid-related tasks
- home: home/household tasks
- errands: errands and shopping
- meals: meal planning and food
- messages: messages/calls to make
- holdingForLater: future items, not urgent
- work: work-related tasks
- momCheckIn: a single warm, validating sentence acknowledging the mental load (NOT a list)

KID-AWARE PARSING (if kids array provided):
- Match child names and nicknames from the kids array against the dump text
- Tag each task with childName in taskMeta if it mentions a specific child
- If a name is ambiguous or not in the kids list, leave childName null — do NOT guess
- IMPORTANT: Only tag childName if the task is DIRECTLY about that child's care, school, health, or activity. If a name appears in a different context (e.g. a teacher named Emma, a friend's child, a coworker), do NOT tag it. Cross-check: before tagging childName, confirm the name appears in the provided Children list AND the task context is clearly about that child. When in doubt, leave childName null.

DELEGATION DETECTION:
- "remind [name] to...", "[name] needs to...", "ask [name] to...", "[name] should..." patterns
- If name matches partnerName: delegation "partner", isPartnerTask true
- If co-parent reference: delegation "coparent", isPartnerTask true
- If child name: delegation "kid", isPartnerTask false
- Default: delegation "me", isPartnerTask false
- COLLISION RULE: If a name matches BOTH a child name AND the partner name, default to child interpretation (delegation "kid") unless the phrase is unambiguously adult (e.g. "remind my husband Jake", "ask Jake about the mortgage"). Never assign delegation "partner" based solely on a name match.

TRACKING ITEMS (extract as trackingItems, NOT regular tasks):
- Phrases: "I need to remember that...", "coming up...", "starting next month...", "don't forget...", "keep an eye on...", "permission slip due...", "refill in...", "size change soon..."
- Include dueDate (ISO 8601) if date mentioned, otherwise null
- Generate a UUID for each id

RHYTHM INSIGHTS:
- topCategories: top 2-3 categories by item count
- recurringThemes: themes detected
- momCheckIn: same as top-level momCheckIn

IMPORTANT: Return valid JSON only. If taskMeta/trackingItems/rhythmInsights cannot be computed, return empty arrays and defaults.`;

function isRateLimitError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as any;
  if (e.statusCode === 429 || e.status === 429) return true;
  if (typeof e.message === 'string' && (e.message.includes('rate') || e.message.includes('429'))) return true;
  return false;
}

export async function callOrganizeAI(text: string, kids?: Kid[], partnerName?: string): Promise<OrganizeResponse> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY not set');
  }

  const trimmedText = text.trim();
  const kidsInfo = kids
    ? '\n\nChildren:\n' +
      kids
        .map((k: Kid) => `- ${k.name}${k.age ? ` (age ${k.age})` : ''}${k.grade ? ` (${k.grade})` : ''}${k.nicknames?.length ? ` (${k.nicknames.join(', ')})` : ''}`)
        .join('\n')
    : '';
  const partnerInfo = partnerName ? `\n\nPartner name: ${partnerName}` : '';

  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://mombrain.app',
          'X-Title': 'Mom Brain',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: ORGANIZE_SYSTEM_PROMPT },
            {
              role: 'user',
              content: `Please organize this brain dump into JSON format:\n\n${trimmedText}${kidsInfo}${partnerInfo}\n\nReturn ONLY valid JSON with all fields: doToday, thisWeek, kids, home, errands, meals, messages, holdingForLater, work, momCheckIn, taskMeta, trackingItems, rhythmInsights.`,
            },
          ],
        }),
      });

      if (response.status === 429) {
        const error = new Error('Rate limited');
        (error as any).statusCode = 429;
        throw error;
      }

      if (!response.ok) {
        throw new Error(`OpenRouter error ${response.status}`);
      }

      const data = await response.json() as any;
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error('No content in response');
      }

      let parsed: any;
      try {
        parsed = JSON.parse(content);
      } catch {
        const match = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (match) {
          parsed = JSON.parse(match[1]);
        } else {
          throw new Error('Failed to parse JSON');
        }
      }

      parsed.work = parsed.work || [];
      parsed.taskMeta = parsed.taskMeta || [];
      parsed.trackingItems = parsed.trackingItems || [];
      parsed.rhythmInsights = parsed.rhythmInsights || {
        topCategories: [],
        recurringThemes: [],
        momCheckIn: parsed.momCheckIn || '',
      };

      const result = OrganizeSchema.parse(parsed);
      return result;
    } catch (error) {
      lastError = error;
      if (!isRateLimitError(error)) {
        break;
      }
      if (attempt < 4) {
        await new Promise((resolve) => setTimeout(resolve, Math.pow(3, attempt + 1) * 1000));
      } else {
        throw error;
      }
    }
  }

  throw lastError;
}

export function register(app: App, fastify: FastifyInstance) {
  fastify.post<{ Body: OrganizeRequestBody }>(
    '/api/organize',
    {
      schema: {
        description: 'Organize a brain dump into categorized tasks',
        tags: ['organize'],
        body: {
          type: 'object',
          required: ['text'],
          properties: {
            text: { type: 'string', description: 'Raw brain dump text to organize' },
            kids: {
              type: 'array',
              description: 'Optional array of child information',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  age: { type: 'number' },
                  grade: { type: 'string' },
                  nicknames: { type: 'array', items: { type: 'string' } },
                },
              },
            },
            partnerName: { type: 'string', description: 'Optional partner/spouse name' },
          },
        },
        response: {
          200: {
            description: 'Successfully organized brain dump',
            type: 'object',
            required: ['doToday', 'thisWeek', 'kids', 'home', 'errands', 'meals', 'messages', 'holdingForLater', 'momCheckIn'],
            properties: {
              doToday: { type: 'array', items: { type: 'string' } },
              thisWeek: { type: 'array', items: { type: 'string' } },
              kids: { type: 'array', items: { type: 'string' } },
              home: { type: 'array', items: { type: 'string' } },
              errands: { type: 'array', items: { type: 'string' } },
              meals: { type: 'array', items: { type: 'string' } },
              messages: { type: 'array', items: { type: 'string' } },
              holdingForLater: { type: 'array', items: { type: 'string' } },
              work: { type: 'array', items: { type: 'string' } },
              momCheckIn: { type: 'string' },
              taskMeta: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    taskText: { type: 'string' },
                    category: {
                      type: 'string',
                      enum: ['doToday', 'thisWeek', 'kids', 'home', 'errands', 'meals', 'messages', 'work', 'holdingForLater'],
                    },
                    childName: { type: 'string', nullable: true },
                    delegation: { type: 'string', enum: ['me', 'partner', 'coparent', 'kid'] },
                    isPartnerTask: { type: 'boolean' },
                  },
                },
              },
              trackingItems: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    text: { type: 'string' },
                    dueDate: { type: 'string', nullable: true },
                    category: { type: 'string' },
                  },
                },
              },
              rhythmInsights: {
                type: 'object',
                properties: {
                  topCategories: { type: 'array', items: { type: 'string' } },
                  recurringThemes: { type: 'array', items: { type: 'string' } },
                  momCheckIn: { type: 'string' },
                },
              },
            },
          },
          400: {
            description: 'Missing or empty text',
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
          429: {
            description: 'Rate limit exceeded',
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
          500: {
            description: 'AI processing failed',
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: OrganizeRequestBody }>, reply: FastifyReply) => {
      try {
        const { text, kids, partnerName } = request.body;
        app.logger.info({ textLength: text?.length, hasKids: !!kids, hasPartner: !!partnerName, hasApiKey: !!process.env.OPENROUTER_API_KEY }, 'organize_handler_start');

        if (!text || text.trim().length === 0) {
          reply.code(400);
          return { error: 'text is required' };
        }

        if (!process.env.OPENROUTER_API_KEY) {
          app.logger.info({}, 'organize_test_mode');
          const mockResponse: OrganizeResponse = {
            doToday: ['Buy milk', 'Schedule dentist appointment'],
            thisWeek: ['Fix the kitchen sink', 'Plan weekly menu'],
            kids: [],
            home: ['Fix the kitchen sink'],
            errands: ['Buy milk'],
            meals: ['Plan weekly menu'],
            messages: ['Call mom'],
            holdingForLater: [],
            momCheckIn: 'You have several tasks to handle this week. Start with calling your mom and buying milk.',
          };
          return reply.status(200).send(mockResponse);
        }

        const result = await callOrganizeAI(text, kids, partnerName);
        app.logger.info({ categoriesCount: Object.keys(result).length }, 'organize_success');
        return reply.status(200).send(result);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        if (isRateLimitError(error)) {
          app.logger.warn({ errorMsg }, 'organize_rate_limited');
          return reply.status(429).send({
            error: 'rate_limited',
            message: 'Mom Brain needs a minute to catch up. Try again shortly.',
          });
        }
        app.logger.error({ err: error, errorMsg, errorStack }, 'organize_failed');
        return reply.status(500).send({
          error: 'server_error',
          message: 'Something got tangled. Try again.',
        });
      }
    }
  );
}
