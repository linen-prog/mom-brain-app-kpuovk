import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { App } from '../index.js';

interface TrackingItem {
  id: string;
  text: string;
  dueDate: string | null;
  category?: string;
}

interface RhythmRecapRequestBody {
  completedTasks: string[];
  pendingTasks: string[];
  trackingItems: TrackingItem[];
  daysUntilSunday: number;
}

interface RhythmRecapResponse {
  doneThisWeek: string[];
  rollingOver: string[];
  comingUp: string[];
  momMessage: string;
  weekLabel: string;
}

export function register(app: App, fastify: FastifyInstance) {
  fastify.post<{ Body: RhythmRecapRequestBody }>(
    '/api/rhythm/recap',
    {
      schema: {
        description: 'Generate a weekly rhythm recap',
        tags: ['rhythm'],
        body: {
          type: 'object',
          required: ['completedTasks', 'pendingTasks', 'trackingItems', 'daysUntilSunday'],
          properties: {
            completedTasks: { type: 'array', items: { type: 'string' } },
            pendingTasks: { type: 'array', items: { type: 'string' } },
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
            daysUntilSunday: { type: 'number' },
          },
        },
        response: {
          200: {
            description: 'Weekly recap generated successfully',
            type: 'object',
            required: ['doneThisWeek', 'rollingOver', 'comingUp', 'momMessage', 'weekLabel'],
            properties: {
              doneThisWeek: { type: 'array', items: { type: 'string' } },
              rollingOver: { type: 'array', items: { type: 'string' } },
              comingUp: { type: 'array', items: { type: 'string' } },
              momMessage: { type: 'string' },
              weekLabel: { type: 'string' },
            },
          },
          500: {
            description: 'Recap generation failed',
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: RhythmRecapRequestBody }>, reply: FastifyReply) => {
      const { completedTasks, pendingTasks, trackingItems, daysUntilSunday } = request.body;

      app.logger.info(
        {
          completedCount: completedTasks.length,
          pendingCount: pendingTasks.length,
          trackingCount: trackingItems.length,
        },
        'rhythm_recap_start',
      );

      try {
        const apiKey = process.env.OPENROUTER_API_KEY;
        const isTestMode = !apiKey;

        app.logger.debug({ hasKey: !!apiKey, keyLength: apiKey?.length || 0 }, 'openrouter_key_check');

        // Generate week label
        const today = new Date();
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay());
        const weekLabel = `Week of ${weekStart.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        })}`;

        if (isTestMode) {
          app.logger.info({}, 'rhythm_recap_test_mode');

          return reply.status(200).send({
            doneThisWeek: completedTasks,
            rollingOver: pendingTasks,
            comingUp: trackingItems.map((item) => item.text),
            momMessage: 'You showed up this week. That matters.',
            weekLabel,
          });
        }

        const trackingText = trackingItems
          .map((item) => `- ${item.text}${item.dueDate ? ` (due: ${item.dueDate})` : ''}`)
          .join('\n');

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
              {
                role: 'system',
                content:
                  'You are helping a busy mom review her week. Frame rollover items as continuity, NOT failure. Use "Still on your list" not "Overdue". Keep tone calm, warm, validating. momMessage should be 1-2 sentences max. Return ONLY valid JSON with: doneThisWeek (array of completed tasks), rollingOver (array of pending tasks), comingUp (array of upcoming tracking items), momMessage (1-2 warm sentences), weekLabel (string). If the rollover list is long (5 or more items), do NOT use ironic cheerfulness or false positivity. Acknowledge the weight briefly and honestly, e.g. "That\'s a full list — and you carried it." Never say "Great job!" or similar when the list is heavy. Scale the momMessage to match reality: light week = warm celebration, heavy week = honest acknowledgment plus one grounding sentence.',
              },
              {
                role: 'user',
                content: `Week: ${weekLabel}\nDays until Sunday: ${daysUntilSunday || 0}\n\nCompleted this week:\n${completedTasks.map((t) => `- ${t}`).join('\n')}\n\nPending tasks:\n${pendingTasks.map((t) => `- ${t}`).join('\n')}\n\nTracking items:\n${trackingText}`,
              },
            ],
          }),
        });

        const responseText = await response.text();

        if (!response.ok) {
          app.logger.error({ status: response.status, body: responseText.slice(0, 500) }, 'openrouter_error');
          throw new Error(`OpenRouter error: ${response.status}`);
        }

        const data = JSON.parse(responseText);
        const content = data.choices?.[0]?.message?.content;

        if (!content) {
          throw new Error('No content in response');
        }

        let parsed: any;
        try {
          parsed = JSON.parse(content);
        } catch (parseErr) {
          const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
          if (jsonMatch) {
            parsed = JSON.parse(jsonMatch[1]);
          } else {
            throw parseErr;
          }
        }

        const result: RhythmRecapResponse = {
          doneThisWeek: parsed.doneThisWeek || completedTasks,
          rollingOver: parsed.rollingOver || pendingTasks,
          comingUp: parsed.comingUp || trackingItems.map((item) => item.text),
          momMessage: parsed.momMessage || 'You made it through another week.',
          weekLabel,
        };

        app.logger.info(
          {
            completedCount: result.doneThisWeek.length,
            rollingCount: result.rollingOver.length,
            upcomingCount: result.comingUp.length,
          },
          'rhythm_recap_ok',
        );

        return reply.status(200).send(result);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        app.logger.error(
          { error, errorMsg, stack: error instanceof Error ? error.stack : undefined },
          'rhythm_recap_failed',
        );
        return reply.status(500).send({
          error: 'server_error',
          message: 'Failed to generate weekly recap. Try again.',
        });
      }
    },
  );
}
