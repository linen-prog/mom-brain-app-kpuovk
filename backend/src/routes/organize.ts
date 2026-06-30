// redeploy to pick up OPENROUTER_API_KEY
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { generateText } from 'ai';
import { gateway } from '@specific-dev/framework';
import type { App } from '../index.js';

interface Kid { name: string; age?: number; grade?: string; nicknames?: string[]; }
interface OrganizeRequestBody { text: string; kids?: Kid[]; partnerName?: string; }

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
    category: z.enum(['doToday','thisWeek','kids','home','errands','meals','messages','work','holdingForLater']),
    childName: z.string().nullable(),
    delegation: z.enum(['me','partner','coparent','kid']),
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

export function register(app: App, fastify: FastifyInstance) {
  fastify.post<{ Body: OrganizeRequestBody }>(
    '/api/organize',
    {
      schema: {
        body: { type: 'object', required: ['text'], properties: { text: { type: 'string' }, kids: { type: 'array', items: { type: 'object' } }, partnerName: { type: 'string' } } },
      },
    },
    async (request: FastifyRequest<{ Body: OrganizeRequestBody }>, reply: FastifyReply) => {
      const { text, kids, partnerName } = request.body;
      app.logger.info({ textLength: text?.length, hasKids: !!kids, hasPartner: !!partnerName }, 'POST /api/organize');

      if (!text || text.trim().length === 0) {
        return reply.status(400).send({ error: 'text is required' });
      }

      const startTime = Date.now();
      const trimmedText = text.trim();
      const kidsInfo = kids ? '\n\nChildren:\n' + kids.map((k: Kid) => `- ${k.name}${k.age ? ` (age ${k.age})` : ''}${k.nicknames?.length ? ` (nicknames: ${k.nicknames.join(', ')})` : ''}`).join('\n') : '';
      const partnerInfo = partnerName ? `\n\nPartner name: ${partnerName}` : '';

      let lastError: unknown;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const { text: responseContent } = await generateText({
            model: gateway('google/gemini-2.5-flash'),
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: `Please organize this brain dump into JSON format:\n\n${trimmedText}${kidsInfo}${partnerInfo}\n\nReturn ONLY valid JSON with all fields: doToday, thisWeek, kids, home, errands, meals, messages, holdingForLater, work, momCheckIn, taskMeta, trackingItems, rhythmInsights.` },
            ],
          });

          let parsed: any;
          const jsonMatch = responseContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
          parsed = JSON.parse(jsonMatch ? jsonMatch[1] : responseContent);

          parsed.work = parsed.work || [];
          parsed.taskMeta = parsed.taskMeta || [];
          parsed.trackingItems = parsed.trackingItems || [];
          parsed.rhythmInsights = parsed.rhythmInsights || { topCategories: [], recurringThemes: [], momCheckIn: parsed.momCheckIn || '' };

          const result = OrganizeSchema.parse(parsed);
          app.logger.info({ elapsedMs: Date.now() - startTime, attempts: attempt + 1 }, 'Successfully organized brain dump');
          return reply.status(200).send(result);
        } catch (error) {
          lastError = error;
          app.logger.error({ error, attempt }, 'organize_call_failed');
          if (!isRateLimitError(error)) break;
          if (attempt < 4) {
            await new Promise(resolve => setTimeout(resolve, Math.pow(3, attempt + 1) * 1000));
          } else {
            return reply.status(429).send({ error: 'rate_limited', message: 'Mom Brain needs a minute to catch up. Try again shortly.' });
          }
        }

      app.logger.error({ err: lastError }, 'Failed to organize');
      return reply.status(500).send({ error: 'server_error', message: 'Something got tangled. Try again.' });
    },
  );
}
