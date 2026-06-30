// redeploy to pick up OPENROUTER_API_KEY
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

interface TaskMeta {
  taskText: string;
  category: 'doToday' | 'thisWeek' | 'kids' | 'home' | 'errands' | 'meals' | 'messages' | 'work' | 'holdingForLater';
  childName: string | null;
  delegation: 'me' | 'partner' | 'coparent' | 'kid';
  isPartnerTask: boolean;
}

interface TrackingItem {
  id: string;
  text: string;
  dueDate: string | null;
  category: string;
}

interface RhythmInsight {
  topCategories: string[];
  recurringThemes: string[];
  momCheckIn: string;
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
  taskMeta: z.array(z.object({
    taskText: z.string(),
    category: z.enum(['doToday', 'thisWeek', 'kids', 'home', 'errands', 'meals', 'messages', 'work', 'holdingForLater']),
    childName: z.string().nullable(),
    delegation: z.enum(['me', 'partner', 'coparent', 'kid']),
    isPartnerTask: z.boolean(),
  })).optional(),
  trackingItems: z.array(z.object({
    id: z.string(),
    text: z.string(),
    dueDate: z.string().nullable(),
    category: z.string(),
  })).optional(),
  rhythmInsights: z.object({
    topCategories: z.array(z.string()),
    recurringThemes: z.array(z.string()),
    momCheckIn: z.string(),
  }).optional(),
});

type OrganizeResponse = z.infer<typeof OrganizeSchema>;

const SYSTEM_PROMPT = `You are a compassionate AI assistant helping a busy mom organize her mental load. Parse the brain dump text and return a JSON object with these exact fields.

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
- If name matches partnerName → delegation: "partner", isPartnerTask: true
- If it's a co-parent reference (e.g. "their dad", "ex") → delegation: "coparent", isPartnerTask: true
- If it's a child's name → delegation: "kid", isPartnerTask: false
- Default → delegation: "me", isPartnerTask: false
- COLLISION RULE: If a name matches BOTH a child's name AND the partner name, default to the child interpretation (delegation: 'kid') unless the phrase is unambiguously adult in context (e.g. 'remind my husband Jake', 'ask Jake about the mortgage'). Never assign delegation: 'partner' based solely on a name match — require adult-context phrasing.

TRACKING ITEMS (extract these as trackingItems, NOT as regular tasks):
- Phrases like: "I need to remember that...", "coming up...", "starting next month...", "don't forget...", "keep an eye on...", "permission slip due...", "refill in...", "size change soon..."
- Include dueDate (ISO 8601) if a date is mentioned, otherwise null
- Generate a UUID for each id

RHYTHM INSIGHTS:
- topCategories: top 2-3 categories by item count
- recurringThemes: themes you detect (e.g. "school logistics", "medical appointments", "meal planning")
- momCheckIn: same as top-level momCheckIn

IMPORTANT: Return valid JSON only. If taskMeta/trackingItems/rhythmInsights cannot be computed, return empty arrays and defaults rather than erroring. All existing fields (doToday, thisWeek, etc.) must remain identical.`;

function isRateLimitError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as any;
  if (e.statusCode === 429) return true;
  if (e.status === 429) return true;
  if (e.name === 'GatewayRateLimitError') return true;
  if (typeof e.message === 'string') {
    const msg = e.message.toLowerCase();
    if (msg.includes('rate')) return true;
    if (msg.includes('429')) return true;
    if (msg.includes('too many requests')) return true;
  }
  return false;
}

export function register(app: App, fastify: FastifyInstance) {
  fastify.post<{ Body: OrganizeRequestBody }>(
    '/api/organize',
    {
      schema: {
        description: 'Organize a brain dump into categories',
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
            required: [
              'doToday',
              'thisWeek',
              'kids',
              'home',
              'errands',
              'meals',
              'messages',
              'holdingForLater',
              'momCheckIn',
            ],
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
      const body = request.body;
      if (!body || !body.text || body.text.trim().length === 0) {
        reply.code(400);
        return { error: 'text is required' };
      }

      const { text, kids, partnerName } = body;
      const trimmedText = text.trim();

      // Check for test mode - return immediately if no API key
      if (!process.env.OPENROUTER_API_KEY) {
        return {
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
      }

      try {

        const startTime = Date.now();
        const apiKey = process.env.OPENROUTER_API_KEY;

        // Retry logic for rate limits with exponential backoff (only for real API calls)
        let lastError: unknown;
        for (let attempt = 0; attempt < 5; attempt++) {
          app.logger.debug({ attempt }, 'organize_attempt_start');
          try {
            const kidsInfo = kids ? `\n\nChildren:\n${kids.map((k) => `- ${k.name}${k.age ? ` (age ${k.age})` : ''}${k.grade ? ` (${k.grade})` : ''}${k.nicknames?.length ? ` (${k.nicknames.join(', ')})` : ''}`).join('\n')}` : '';
            const partnerInfo = partnerName ? `\n\nPartner name: ${partnerName}` : '';

            const requestBody = {
              model: 'google/gemini-2.5-flash',
              messages: [
                {
                  role: 'system',
                  content: SYSTEM_PROMPT,
                },
                {
                  role: 'user',
                  content: `Please organize this brain dump into JSON format:\n\n${trimmedText}${kidsInfo}${partnerInfo}\n\nReturn ONLY valid JSON. Include all fields: doToday, thisWeek, kids, home, errands, meals, messages, holdingForLater, work (all arrays of strings), momCheckIn (string), taskMeta (array), trackingItems (array), rhythmInsights (object). If you cannot extract certain metadata, return empty arrays/defaults for those fields.`,
                },
              ],
            };

            app.logger.debug({ model: requestBody.model }, 'calling_openrouter');

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 60000); // 60 second timeout

            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://mombrain.app',
                'X-Title': 'Mom Brain',
              },
              body: JSON.stringify(requestBody),
              signal: controller.signal,
            });

            clearTimeout(timeout);

            const responseStatus = response.status;
            const responseText = await response.text();

            app.logger.debug({ status: responseStatus, bodyLength: responseText.length }, 'openrouter_response');

            if (responseStatus === 429) {
              // Rate limit error
              const error = new Error('Rate limited by OpenRouter');
              (error as any).statusCode = 429;
              throw error;
            }

            if (!response.ok) {
              const errorMsg = `OpenRouter error ${responseStatus}`;
              app.logger.error({ status: responseStatus, body: responseText.slice(0, 500) }, errorMsg);
              throw new Error(errorMsg);
            }

            let data: any;
            try {
              data = JSON.parse(responseText);
            } catch (parseErr) {
              app.logger.error({ responseText: responseText.slice(0, 500) }, 'Failed to parse OpenRouter response');
              throw new Error('Invalid JSON response from OpenRouter');
            }

            const responseContent = data.choices?.[0]?.message?.content;
            if (!responseContent) {
              app.logger.error({ data }, 'No content in OpenRouter response');
              throw new Error('No content in OpenRouter response');
            }

            // Parse JSON response
            let parsed: any;
            try {
              parsed = JSON.parse(responseContent);
            } catch (parseErr) {
              // Try to extract JSON from markdown code blocks if present
              const jsonMatch = responseContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
              if (jsonMatch) {
                try {
                  parsed = JSON.parse(jsonMatch[1]);
                } catch (e) {
                  app.logger.error({ content: responseContent.slice(0, 500) }, 'Failed to parse JSON from OpenRouter');
                  throw parseErr;
                }
              } else {
                app.logger.error({ content: responseContent.slice(0, 500) }, 'Failed to parse JSON from OpenRouter');
                throw parseErr;
              }
            }

            // Ensure new fields exist with safe defaults
            parsed.work = parsed.work || [];
            parsed.taskMeta = parsed.taskMeta || [];
            parsed.trackingItems = parsed.trackingItems || [];
            parsed.rhythmInsights = parsed.rhythmInsights || {
              topCategories: [],
              recurringThemes: [],
              momCheckIn: parsed.momCheckIn || '',
            };

            // Validate against schema
            const result = OrganizeSchema.parse(parsed);

            const elapsedMs = Date.now() - startTime;

            app.logger.info(
              {
                elapsedMs,
                attempts: attempt + 1,
                doTodayCount: result.doToday.length,
                thisWeekCount: result.thisWeek.length,
                kidsCount: result.kids.length,
                homeCount: result.home.length,
                errandsCount: result.errands.length,
                mealsCount: result.meals.length,
                messagesCount: result.messages.length,
                holdingForLaterCount: result.holdingForLater.length,
                workCount: result.work?.length || 0,
                taskMetaCount: result.taskMeta?.length || 0,
                trackingItemsCount: result.trackingItems?.length || 0,
              },
              'Successfully organized brain dump',
            );

            return reply.status(200).send(result);
          } catch (error) {
            lastError = error;
            const errorMsg = error instanceof Error ? error.message : String(error);
            const isAbortError = error instanceof Error && error.name === 'AbortError';
            app.logger.error(
              {
                error,
                errorMsg,
                stack: error instanceof Error ? error.stack : undefined,
                isAbortError,
                attempt,
              },
              'organize_call_failed',
            );

            if (!isRateLimitError(error)) {
              // Not a rate limit error, fail immediately
              break;
            }

            if (attempt < 4) {
              // Wait before retrying with exponential backoff: 3s, 6s, 12s, 24s
              const delayMs = Math.pow(3, attempt + 1) * 1000;
              app.logger.warn(
                { attempt: attempt + 1, delayMs, err: error },
                'Rate limited, retrying',
              );
              await new Promise(resolve => setTimeout(resolve, delayMs));
            } else {
              // Out of retries
              app.logger.warn(
                { attempts: attempt + 1, err: error, textLength: trimmedText.length },
                'Rate limit exceeded after retries',
              );
              return reply.status(429).send({
                error: 'rate_limited',
                message: 'Mom Brain needs a minute to catch up. Try again shortly.',
              });
            }
          }
        }

        // If we reach here, we failed after all retries
        const errorMessage = lastError instanceof Error ? lastError.message : String(lastError);
        const errorStack = lastError instanceof Error ? lastError.stack : undefined;
        const errorName = lastError instanceof Error ? lastError.name : undefined;
        app.logger.error(
          { err: lastError, errorMessage, errorName, errorStack, textLength: trimmedText.length },
          'Failed to organize',
        );
        return reply.status(500).send({
          error: 'server_error',
          message: 'Something got tangled. Try again.',
        });
      } catch (handlerError) {
        const errorMsg = handlerError instanceof Error ? handlerError.message : String(handlerError);
        app.logger.error(
          { err: handlerError, errorMsg, stack: handlerError instanceof Error ? handlerError.stack : undefined },
          'Unexpected error in organize handler',
        );
        return reply.status(500).send({
          error: 'server_error',
          message: 'Something got tangled. Try again.',
        });
      }
    },
  );
}
