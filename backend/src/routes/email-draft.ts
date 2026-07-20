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

const SYSTEM_PROMPT = `You are helping a busy parent draft a clear, polite, brief email. Tone: confident busy parent, NOT apologetic, NOT overly formal. Use recipientName in salutation if provided. Context: teacher=school, pediatrician=medical, activity=camp/daycare, other_parent=logistics, work=manager, admin=billing. Return ONLY valid JSON: { subject: string, body: string, recipientName: string|null }. CRITICAL: Never invent or fabricate any date, time, name, reason, or detail not in the task text. Use [date], [time], [reason] placeholders for missing info. If vague, write open-ended without committing to specifics.`;

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

      // Validate required fields
      if (!taskText || typeof taskText !== 'string' || taskText.trim().length === 0) {
        app.logger.warn({ taskText }, 'Missing or invalid taskText');
        reply.code(400);
        return {
          error: 'taskText is required and must be non-empty',
        };
      }

      if (!context || typeof context !== 'string') {
        app.logger.warn({ context }, 'Missing or invalid context');
        reply.code(400);
        return {
          error: 'context is required',
        };
      }

      // Validate context enum
      const validContexts = ['teacher', 'pediatrician', 'activity', 'other_parent', 'work', 'admin'];
      if (!validContexts.includes(context)) {
        app.logger.warn({ context }, 'Invalid context value');
        reply.code(400);
        return {
          error: `context must be one of: ${validContexts.join(', ')}`,
        };
      }

      app.logger.info(
        { context, hasRecipientName: !!recipientName, hasChildName: !!childName },
        'email_draft_start'
      );

      if (!process.env.OPENROUTER_API_KEY) {
        const mockResponse: EmailDraftResponse = {
          subject: 'Question about classroom',
          body: `Dear ${recipientName || 'there'},\n\nRegarding: ${taskText}\n\nThank you for your time.\n\nBest regards`,
          recipientName: recipientName || null,
        };
        reply.code(200);
        return mockResponse;
      }

      try {
        const apiKey = process.env.OPENROUTER_API_KEY;
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
              { role: 'system', content: SYSTEM_PROMPT },
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
        reply.code(200);
        return result;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        app.logger.error(
          { err: error, errorMsg, stack: error instanceof Error ? error.stack : undefined },
          'email_draft_failed'
        );
        reply.code(500);
        return {
          error: 'server_error',
          message: 'Failed to generate email draft. Try again.',
        };
      }
    }
  );
}
