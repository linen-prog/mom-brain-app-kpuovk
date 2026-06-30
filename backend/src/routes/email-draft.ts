import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { App } from '../index.js';

interface EmailDraftRequestBody {
  taskText: string;
  context: 'teacher' | 'pediatrician' | 'activity' | 'other_parent' | 'work' | 'admin';
  recipientName?: string;
  childName?: string;
  additionalNotes?: string;
}

interface EmailDraftResponse {
  subject: string;
  body: string;
  recipientName: string | null;
}

export function register(app: App, fastify: FastifyInstance) {
  fastify.post<{ Body: EmailDraftRequestBody }>(
    '/api/email-draft',
    {
      schema: {
        description: 'Draft an email based on a task',
        tags: ['email-draft'],
        body: {
          type: 'object',
          required: ['taskText', 'context'],
          properties: {
            taskText: { type: 'string', description: 'Task text to draft email from' },
            context: {
              type: 'string',
              enum: ['teacher', 'pediatrician', 'activity', 'other_parent', 'work', 'admin'],
              description: 'Email context/recipient type',
            },
            recipientName: { type: 'string', description: 'Optional recipient name' },
            childName: { type: 'string', description: 'Optional child name for context' },
            additionalNotes: { type: 'string', description: 'Optional additional notes' },
          },
        },
        response: {
          200: {
            description: 'Email draft generated successfully',
            type: 'object',
            required: ['subject', 'body', 'recipientName'],
            properties: {
              subject: { type: 'string' },
              body: { type: 'string' },
              recipientName: { type: 'string', nullable: true },
            },
          },
          400: {
            description: 'Missing or invalid request',
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
          500: {
            description: 'Email generation failed',
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: EmailDraftRequestBody }>, reply: FastifyReply) => {
      const { taskText, context, recipientName, childName, additionalNotes } = request.body;

      if (!taskText || taskText.trim().length === 0 || !context) {
        app.logger.warn({ taskText, context }, 'Missing required fields');
        return reply.status(400).send({
          error: 'taskText and context are required',
        });
      }

      app.logger.info(
        { context, hasRecipientName: !!recipientName, hasChildName: !!childName },
        'email_draft_start',
      );

      try {
        const apiKey = process.env.OPENROUTER_API_KEY;
        const isTestMode = !apiKey;

        app.logger.debug({ hasKey: !!apiKey, keyLength: apiKey?.length || 0 }, 'openrouter_key_check');

        if (isTestMode) {
          app.logger.info({ context }, 'email_draft_test_mode');
          const mockSubjects: Record<string, string> = {
            teacher: 'Question about classroom',
            pediatrician: 'Appointment request',
            activity: 'Schedule update',
            other_parent: 'Carpool coordination',
            work: 'Schedule flexibility request',
            admin: 'Account inquiry',
          };

          const mockBody =
            `Dear ${recipientName || 'there'},\n\nRegarding: ${taskText}\n\nThank you for your time.\n\nBest regards`;

          return reply.status(200).send({
            subject: mockSubjects[context] || 'Message',
            body: mockBody,
            recipientName: recipientName || null,
          });
        }

        const prompt = `Task: ${taskText}${childName ? `\nChild: ${childName}` : ''}${additionalNotes ? `\nNotes: ${additionalNotes}` : ''}`;

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
                  'You are helping a busy parent draft a clear, polite, brief email. Tone: confident busy parent — NOT apologetic, NOT overly formal. Mirror how a real parent would write. Use recipientName in salutation if provided. Use childName for context if provided. Context mapping: teacher=school-related, pediatrician=medical, activity=camp/daycare, other_parent=logistics, work=manager message, admin=insurance/billing. Return ONLY valid JSON with: subject (string), body (string), recipientName (string or null). CRITICAL: Never invent, assume, or fabricate any specific date, time, name, reason, or detail not present in the task text. If a detail is needed but missing (e.g. no date given for an absence), use a bracketed placeholder like [date], [time], [reason] instead of guessing. If the task is vague, write a brief open-ended email that does not commit to specifics.',
              },
              {
                role: 'user',
                content: `Context: ${context}\nRecipient: ${recipientName || 'Not specified'}\n${prompt}`,
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

        const result: EmailDraftResponse = {
          subject: parsed.subject || 'Message',
          body: parsed.body || '',
          recipientName: parsed.recipientName || null,
        };

        app.logger.info({ contextType: context }, 'email_draft_ok');

        return reply.status(200).send(result);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        app.logger.error(
          { error, errorMsg, stack: error instanceof Error ? error.stack : undefined },
          'email_draft_failed',
        );
        return reply.status(500).send({
          error: 'server_error',
          message: 'Failed to generate email draft. Try again.',
        });
      }
    },
  );
}
