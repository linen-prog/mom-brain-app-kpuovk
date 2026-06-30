import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { generateText } from 'ai';
import { gateway } from '@specific-dev/framework';
import type { App } from '../index.js';

interface EmailDraftRequestBody {
  taskText: string;
  context: 'teacher' | 'pediatrician' | 'activity' | 'other_parent' | 'work' | 'admin';
  recipientName?: string;
  childName?: string;
  additionalNotes?: string;
}

export function register(app: App, fastify: FastifyInstance) {
  fastify.post<{ Body: EmailDraftRequestBody }>(
    '/api/email-draft',
    {
      schema: {
        body: { type: 'object', required: ['taskText', 'context'], properties: { taskText: { type: 'string' }, context: { type: 'string' }, recipientName: { type: 'string' }, childName: { type: 'string' }, additionalNotes: { type: 'string' } } },
      },
    },
    async (request: FastifyRequest<{ Body: EmailDraftRequestBody }>, reply: FastifyReply) => {
      const { taskText, context, recipientName, childName, additionalNotes } = request.body;

      if (!taskText || taskText.trim().length === 0 || !context) {
        return reply.status(400).send({ error: 'taskText and context are required' });
      }

      app.logger.info({ context, hasRecipientName: !!recipientName }, 'email_draft_start');

      try {
        const prompt = `Task: ${taskText}${childName ? `\nChild: ${childName}` : ''}${additionalNotes ? `\nNotes: ${additionalNotes}` : ''}`;

        const { text: content } = await generateText({
          model: gateway('google/gemini-2.5-flash'),
          messages: [
            {
              role: 'system',
              content: 'You are helping a busy parent draft a clear, polite, brief email. Tone: confident busy parent, NOT apologetic, NOT overly formal. Use recipientName in salutation if provided. Context: teacher=school, pediatrician=medical, activity=camp/daycare, other_parent=logistics, work=manager, admin=billing. Return ONLY valid JSON: { subject: string, body: string, recipientName: string|null }. CRITICAL: Never invent or fabricate any date, time, name, reason, or detail not in the task text. Use [date], [time], [reason] placeholders for missing info. If vague, write open-ended without committing to specifics.',
            },
            { role: 'user', content: `Context: ${context}\nRecipient: ${recipientName || 'Not specified'}\n${prompt}` },
          ],
        });

        let parsed: any;
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        parsed = JSON.parse(jsonMatch ? jsonMatch[1] : content);

        app.logger.info({ contextType: context }, 'email_draft_ok');
        return reply.status(200).send({ subject: parsed.subject || 'Message', body: parsed.body || '', recipientName: parsed.recipientName || null });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        app.logger.error({ error, errorMsg }, 'email_draft_failed');
        return reply.status(500).send({ error: 'server_error', message: 'Failed to generate email draft. Try again.' });
      }
    },
  );
}
