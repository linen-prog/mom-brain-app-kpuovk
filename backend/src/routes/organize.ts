import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { App } from '../index.js';

interface OrganizeRequestBody {
  text: string;
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
  momCheckIn: z.string().min(1),
});

type OrganizeResponse = z.infer<typeof OrganizeSchema>;

const SYSTEM_PROMPT = `You are organizing a brain dump into these categories: doToday (for today/tomorrow), thisWeek (later this week), kids (child-related), home (household tasks), errands (shopping/outside tasks), meals (food/cooking), messages (texts/calls/emails), holdingForLater (not urgent), and momCheckIn (1-3 calm sentences with a next step).

Use her exact words. Keep it simple and faithful to what she said. momCheckIn should be warm but never use exclamation marks or productivity language like "You've got this".`;

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
      const { text } = request.body;

      app.logger.info({ textLength: text?.length }, 'POST /api/organize');

      if (!text || text.trim().length === 0) {
        app.logger.warn('Text is required but was empty');
        return reply.status(400).send({ error: 'text is required' });
      }

      const startTime = Date.now();
      const trimmedText = text.trim();

      // Retry logic for rate limits with exponential backoff
      let lastError: unknown;
      for (let attempt = 0; attempt < 5; attempt++) {
        app.logger.debug({ attempt }, 'organize_attempt_start');
        try {
          const apiKey = process.env.OPENROUTER_API_KEY;
          const isTestMode = !apiKey;

          if (isTestMode) {
            // In test mode without API key, return a mock response
            app.logger.info({ textLength: trimmedText.length }, 'organize_test_mode_mock_response');

            const mockResult = {
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

            const result = OrganizeSchema.parse(mockResult);
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
                testMode: true,
              },
              'Successfully organized brain dump',
            );

            return reply.status(200).send(result);
          }

          const requestBody = {
            model: 'openai/gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: SYSTEM_PROMPT,
              },
              {
                role: 'user',
                content: `Please organize this brain dump into JSON format:\n\n${trimmedText}\n\nReturn ONLY valid JSON with these exact keys: doToday, thisWeek, kids, home, errands, meals, messages, holdingForLater, momCheckIn. Each array should contain strings, momCheckIn should be a non-empty string.`,
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
    },
  );
}
