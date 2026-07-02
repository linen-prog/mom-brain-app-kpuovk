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
  work: string[];
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

// Helper function to coerce unknown values to string arrays
function coerceToStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];

  return input
    .map((item) => {
      if (typeof item === 'string') return item;
      if (typeof item === 'object' && item !== null) {
        const obj = item as Record<string, unknown>;
        const textValue = obj.text || obj.task || obj.message || obj.content || obj.description || obj.item;
        if (typeof textValue === 'string') return textValue;
        return JSON.stringify(item);
      }
      return String(item);
    })
    .filter((str) => str && str.trim().length > 0);
}

const OrganizeSchema = z.object({
  doToday: z.unknown().transform(coerceToStringArray).default([]),
  thisWeek: z.unknown().transform(coerceToStringArray).default([]),
  kids: z.unknown().transform(coerceToStringArray).default([]),
  home: z.unknown().transform(coerceToStringArray).default([]),
  errands: z.unknown().transform(coerceToStringArray).default([]),
  meals: z.unknown().transform(coerceToStringArray).default([]),
  messages: z.unknown().transform(coerceToStringArray).default([]),
  holdingForLater: z.unknown().transform(coerceToStringArray).default([]),
  work: z.unknown().transform(coerceToStringArray).default([]),
  momCheckIn: z.string().min(1).default('You showed up. That counts.'),
  taskMeta: z
    .unknown()
    .transform((val): OrganizeResponse['taskMeta'] => {
      if (val === undefined || val === null) return undefined;
      if (!Array.isArray(val)) return [];
      return (val as unknown[]).flatMap((item) => {
        if (!item || typeof item !== 'object') return [];
        const obj = item as Record<string, unknown>;
        const taskText = typeof obj.taskText === 'string' ? obj.taskText : typeof obj.task === 'string' ? obj.task : typeof obj.text === 'string' ? obj.text : null;
        if (!taskText) return [];
        const validCategories = ['doToday','thisWeek','kids','home','errands','meals','messages','work','holdingForLater'] as const;
        const cat = validCategories.includes(obj.category as typeof validCategories[number]) ? obj.category as typeof validCategories[number] : 'doToday';
        const validDelegations = ['me','partner','coparent','kid'] as const;
        const del = validDelegations.includes(obj.delegation as typeof validDelegations[number]) ? obj.delegation as typeof validDelegations[number] : 'me';
        return [{
          taskText,
          category: cat,
          childName: typeof obj.childName === 'string' ? obj.childName : null,
          delegation: del,
          isPartnerTask: obj.isPartnerTask === true || obj.delegation === 'partner' || obj.delegation === 'coparent',
        }];
      });
    })
    .optional()
    .catch(undefined),
  trackingItems: z
    .unknown()
    .transform((val): OrganizeResponse['trackingItems'] => {
      if (val === undefined || val === null) return undefined;
      if (!Array.isArray(val)) return [];
      return (val as unknown[]).flatMap((item) => {
        if (!item || typeof item !== 'object') return [];
        const obj = item as Record<string, unknown>;
        const text = typeof obj.text === 'string' ? obj.text : typeof obj.task === 'string' ? obj.task : typeof obj.item === 'string' ? obj.item : typeof obj.description === 'string' ? obj.description : null;
        if (!text) return [];
        return [{
          id: typeof obj.id === 'string' ? obj.id : Math.random().toString(36).slice(2),
          text,
          dueDate: typeof obj.dueDate === 'string' ? obj.dueDate : typeof obj.date === 'string' ? obj.date : null,
          category: typeof obj.category === 'string' ? obj.category : 'holdingForLater',
        }];
      });
    })
    .optional()
    .catch(undefined),
  rhythmInsights: z
    .object({
      topCategories: z.array(z.string()),
      recurringThemes: z.array(z.string()),
      momCheckIn: z.string(),
    })
    .optional()
    .catch(undefined),
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
- School events with specific dates (picture day, bake sale, parent meeting, field trips) → trackingItems with dueDate
- Order confirmations with delivery dates → trackingItems with dueDate set to delivery date
- Return windows → trackingItems with text like "Return window closes [date]"
- IMPORTANT: Even if items go into trackingItems, also add a reminder task to the appropriate category (e.g. "Sign up for parent-teacher conferences by Nov 10" in thisWeek)
- Include dueDate (ISO 8601) if date mentioned, otherwise null
- Generate a UUID for each id

TASKMETA REQUIREMENT: You MUST populate the taskMeta array with one entry for EVERY task that appears in any category array. Each entry needs: taskText (exact task string), category (which array it's in), childName (null unless task is directly about a stored child), delegation ("me"/"partner"/"coparent"/"kid"), isPartnerTask (true if delegation is partner or coparent). Do not return an empty taskMeta array if there are tasks.

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
    // Return mock response when API key is not set (for testing)
    return {
      doToday: ['Buy milk', 'Schedule dentist appointment'],
      thisWeek: ['Fix the kitchen sink', 'Plan weekly menu'],
      kids: [],
      home: ['Fix the kitchen sink'],
      errands: ['Buy milk'],
      meals: ['Plan weekly menu'],
      messages: ['Call mom'],
      holdingForLater: [],
      work: [],
      momCheckIn: 'You have several tasks to handle this week. Start with calling your mom and buying milk.',
      taskMeta: [],
      trackingItems: [],
      rhythmInsights: {
        topCategories: ['home', 'errands'],
        recurringThemes: ['household', 'shopping'],
        momCheckIn: 'You have several tasks to handle this week. Start with calling your mom and buying milk.',
      },
    };
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
            required: ['doToday', 'thisWeek', 'kids', 'home', 'errands', 'meals', 'messages', 'holdingForLater', 'work', 'momCheckIn'],
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
        app.logger.info({ hasApiKey: !!process.env.OPENROUTER_API_KEY }, 'organize_handler_entry');

        const { text, kids, partnerName } = request.body;
        app.logger.info({ textLength: text?.length, hasKids: !!kids, hasPartner: !!partnerName }, 'organize_handler_start');

        if (!text || text.trim().length === 0) {
          app.logger.warn({}, 'organize_empty_text');
          reply.code(400);
          return { error: 'text is required' };
        }

        app.logger.info({}, 'calling_organize_ai');
        const result = await callOrganizeAI(text, kids, partnerName);
        app.logger.info({ resultKeys: Object.keys(result) }, 'organize_success');
        return result;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        app.logger.error({ err: error, errorMsg, errorStack, errorType: typeof error }, 'organize_exception_caught');

        if (isRateLimitError(error)) {
          app.logger.warn({ errorMsg }, 'organize_rate_limited');
          reply.code(429);
          return {
            error: 'rate_limited',
            message: 'Mom Brain needs a minute to catch up. Try again shortly.',
          };
        }

        reply.code(500);
        return {
          error: 'server_error',
          message: 'Something got tangled. Try again.',
        };
      }
    }
  );
}
