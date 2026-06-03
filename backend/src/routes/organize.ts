import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { gateway } from '@specific-dev/framework';
import { generateText } from 'ai';
import type { App } from '../index.js';

interface OrganizeRequestBody {
  text: string;
}

interface OrganizeResponse {
  doToday: string[];
  thisWeek: string[];
  kids: string[];
  home: string[];
  errands: string[];
  meals: string[];
  messages: string[];
  holdingForLater: string[];
  momCheckIn: string;
}

const SYSTEM_PROMPT = `You are a warm, supportive assistant for an overwhelmed mom. Your job is to take her messy brain dump and organize it into a calm, clear family plan.

Split the content into these 8 categories:
- doToday: urgent tasks to do today
- thisWeek: tasks that can wait until later this week
- kids: anything related to the kids (school, activities, appointments, etc.)
- home: anything related to the home (cleaning, repairs, household tasks)
- errands: things to buy, pick up, or do outside the house
- meals: anything related to food, cooking, groceries, or meal planning
- messages: texts, calls, or emails to send
- holdingForLater: things mentioned that don't need action soon

IMPORTANT: An item can appear in BOTH a time-based category (doToday or thisWeek) AND a family-life category (kids/home/errands/meals/messages) — those are different lenses on the same item. holdingForLater is for things the mom mentioned but that don't need action soon.

Each item should be a short, clear, friendly action phrase (e.g. "Sign Mina's school form", "Text the babysitter", "Order groceries", "Choose dinner").

Do NOT invent items the mom didn't mention. Stay faithful to her input.

momCheckIn must be kind, validating, and end by gently suggesting ONE concrete next step. NEVER guilt, shame, or use productivity pressure. Examples of tone: "You're carrying a lot of open loops. Start with the school form — it has the clearest finish line.", "You're not behind. You're holding a lot. The babysitter text is a 30-second win — start there."

Return ONLY valid JSON matching this exact schema — no markdown, no commentary, no code fences:
{
  "doToday": [],
  "thisWeek": [],
  "kids": [],
  "home": [],
  "errands": [],
  "meals": [],
  "messages": [],
  "holdingForLater": [],
  "momCheckIn": ""
}`;

function isValidResponse(data: unknown): data is OrganizeResponse {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  return (
    Array.isArray(obj.doToday) &&
    Array.isArray(obj.thisWeek) &&
    Array.isArray(obj.kids) &&
    Array.isArray(obj.home) &&
    Array.isArray(obj.errands) &&
    Array.isArray(obj.meals) &&
    Array.isArray(obj.messages) &&
    Array.isArray(obj.holdingForLater) &&
    typeof obj.momCheckIn === 'string' &&
    obj.momCheckIn.length > 0
  );
}

function createDefaultResponse(): OrganizeResponse {
  return {
    doToday: [],
    thisWeek: [],
    kids: [],
    home: [],
    errands: [],
    meals: [],
    messages: [],
    holdingForLater: [],
    momCheckIn: "You're doing your best. Take a breath. Start with whatever feels most urgent.",
  };
}

async function callAI(text: string, app: App): Promise<OrganizeResponse> {
  try {
    app.logger.info({ textLength: text.length }, 'Calling AI for organization');

    const { text: responseText } = await generateText({
      model: gateway('openai/gpt-4o-mini'),
      system: SYSTEM_PROMPT,
      prompt: `Please organize this brain dump:\n\n${text}`,
    });

    app.logger.info({ responseLength: responseText.length }, 'AI response received');

    const parsed = JSON.parse(responseText);

    if (!isValidResponse(parsed)) {
      app.logger.warn({ parsed }, 'AI response validation failed, using defaults');
      const result = createDefaultResponse();
      Object.assign(result, parsed);
      return result;
    }

    return parsed;
  } catch (error) {
    app.logger.error({ err: error }, 'AI call failed');
    throw error;
  }
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
              momCheckIn: { type: 'string' },
            },
          },
          400: {
            description: 'Missing or empty text',
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
          500: {
            description: 'AI processing failed',
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: OrganizeRequestBody }>, reply: FastifyReply) => {
      const { text } = request.body;

      app.logger.info({ textLength: text?.length }, 'POST /api/organize');

      if (!text || text.trim().length === 0) {
        app.logger.warn('Text is required but was empty');
        return reply.status(400).send({ error: 'text is required' });
      }

      try {
        let result = await callAI(text.trim(), app);

        if (!isValidResponse(result)) {
          app.logger.warn({ result }, 'First AI attempt produced invalid response, retrying');
          try {
            result = await callAI(text.trim(), app);
          } catch (retryError) {
            app.logger.error({ err: retryError }, 'Retry failed');
            return reply
              .status(500)
              .send({ error: 'Failed to organize. Please try again.' });
          }

          if (!isValidResponse(result)) {
            app.logger.warn('Second AI attempt also produced invalid response');
            result = createDefaultResponse();
          }
        }

        app.logger.info(
          {
            doTodayCount: result.doToday.length,
            thisWeekCount: result.thisWeek.length,
            kidsCount: result.kids.length,
          },
          'Successfully organized brain dump',
        );

        return reply.status(200).send(result);
      } catch (error) {
        app.logger.error({ err: error, text: text.substring(0, 100) }, 'Failed to organize');
        return reply.status(500).send({ error: 'Failed to organize. Please try again.' });
      }
    },
  );
}
