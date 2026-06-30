import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { generateText } from 'ai';
import { gateway } from '@specific-dev/framework';
import type { App } from '../index.js';

interface TrackingItem { id: string; text: string; dueDate: string | null; category?: string; }
interface RhythmRecapRequestBody { completedTasks: string[]; pendingTasks: string[]; trackingItems: TrackingItem[]; daysUntilSunday: number; }

export function register(app: App, fastify: FastifyInstance) {
  fastify.post<{ Body: RhythmRecapRequestBody }>(
    '/api/rhythm/recap',
    {
      schema: {
        body: { type: 'object', required: ['completedTasks','pendingTasks','trackingItems'], properties: { completedTasks: { type: 'array', items: { type: 'string' } }, pendingTasks: { type: 'array', items: { type: 'string' } }, trackingItems: { type: 'array', items: { type: 'object' } }, daysUntilSunday: { type: 'number' } } },
      },
    },
    async (request: FastifyRequest<{ Body: RhythmRecapRequestBody }>, reply: FastifyReply) => {
      const { completedTasks, pendingTasks, trackingItems, daysUntilSunday } = request.body;
      app.logger.info({ completedCount: completedTasks.length, pendingCount: pendingTasks.length }, 'rhythm_recap_start');

      try {
        const today = new Date();
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay());
        const weekLabel = `Week of ${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
        const trackingText = trackingItems.map((i) => `- ${i.text}${i.dueDate ? ` (due: ${i.dueDate})` : ''}`).join('\n');

        const { text: responseText } = await generateText({
          model: gateway('google/gemini-2.5-flash'),
          messages: [
            {
              role: 'system',
              content: 'You are helping a busy mom review her week. Frame rollover items as continuity, NOT failure. Use "Still on your list" not "Overdue". Keep tone calm, warm, validating. momMessage 1-2 sentences max. Return ONLY valid JSON: { doneThisWeek: string[], rollingOver: string[], comingUp: string[], momMessage: string, weekLabel: string }. If rollover list has 5+ items, do NOT use false cheer. Acknowledge honestly. Never say "Great job!" for heavy weeks. Scale momMessage: light week = warm celebration, heavy week = honest acknowledgment + one grounding sentence.',
            },
            {
              role: 'user',
              content: `Week: ${weekLabel}\nDays until Sunday: ${daysUntilSunday || 0}\n\nCompleted:\n${completedTasks.map(t => `- ${t}`).join('\n')}\n\nPending:\n${pendingTasks.map(t => `- ${t}`).join('\n')}\n\nTracking:\n${trackingText}`,
            },
          ],
        });

        let parsed: any;
        const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        parsed = JSON.parse(jsonMatch ? jsonMatch[1] : responseText);

        app.logger.info({ weekLabel }, 'rhythm_recap_ok');
        return reply.status(200).send({
          doneThisWeek: parsed.doneThisWeek || completedTasks,
          rollingOver: parsed.rollingOver || pendingTasks,
          comingUp: parsed.comingUp || trackingItems.map(i => i.text),
          momMessage: parsed.momMessage || 'You showed up this week.',
          weekLabel: parsed.weekLabel || weekLabel,
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        app.logger.error({ error, errorMsg }, 'rhythm_recap_failed');
        return reply.status(500).send({ error: 'server_error', message: 'Failed to generate weekly recap. Try again.' });
      }
    },
  );
}
