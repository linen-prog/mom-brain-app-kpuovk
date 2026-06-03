import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { gateway } from '@specific-dev/framework';
import { generateText } from 'ai';
import type { App } from '../index.js';

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
  fastify.post(
    '/api/transcribe',
    {
      schema: {
        description: 'Transcribe an audio file using Google Gemini Flash',
        tags: ['transcribe'],
        response: {
          200: {
            description: 'Successfully transcribed audio',
            type: 'object',
            properties: {
              text: { type: 'string' },
            },
          },
          400: {
            description: 'Missing or empty audio file',
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
          413: {
            description: 'Audio file too large',
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' },
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
            description: 'Transcription failed',
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      app.logger.info('POST /api/transcribe');

      const data = await request.file({ limits: { fileSize: 25 * 1024 * 1024 } });

      if (!data) {
        app.logger.warn('Audio file is required');
        return reply.status(400).send({
          error: 'audio_empty',
          message: "I didn't catch any words. Try once more, or type it in.",
        });
      }

      let buffer: Buffer;
      try {
        buffer = await data.toBuffer();
      } catch (err) {
        app.logger.warn({ err }, 'Audio file too large');
        return reply.status(413).send({
          error: 'audio_too_large',
          message: 'That recording is too long. Try a shorter one.',
        });
      }

      if (buffer.length === 0) {
        app.logger.warn('Audio file is empty');
        return reply.status(400).send({
          error: 'audio_empty',
          message: "I didn't catch any words. Try once more, or type it in.",
        });
      }

      const fileSize = buffer.length;
      const mimeType = data.mimetype;
      const startTime = Date.now();

      app.logger.info(
        { fileSize, mimeType },
        'Transcribing audio with Gemini Flash',
      );

      // Convert audio buffer to base64 data URL for Gemini
      const base64Audio = buffer.toString('base64');

      // Retry logic for rate limits with exponential backoff
      let lastError: unknown;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const { text } = await generateText({
            model: gateway('google/gemini-flash'),
            system: 'Transcribe this audio exactly as spoken. Return only the transcription text, no commentary, no punctuation corrections, no formatting. If the audio is silent or contains no speech, return an empty string.',
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'file',
                    mediaType: mimeType,
                    data: base64Audio,
                  },
                ],
              },
            ],
          });

          const elapsedMs = Date.now() - startTime;

          app.logger.info(
            { elapsedMs, textLength: text.length, fileSize, mimeType, attempts: attempt + 1 },
            'Successfully transcribed audio',
          );

          return reply.status(200).send({ text });
        } catch (error) {
          lastError = error;

          if (isRateLimitError(error)) {
            if (attempt < 4) {
              // Wait before retrying with longer delays: 2s, 4s, 6s, 8s
              const delayMs = (attempt + 1) * 2000;
              app.logger.warn(
                { attempt: attempt + 1, delayMs, err: error },
                'Rate limited during transcription, retrying',
              );
              await new Promise(resolve => setTimeout(resolve, delayMs));
              continue;
            } else {
              // Out of retries
              app.logger.warn(
                { attempts: attempt + 1, err: error, fileSize },
                'Rate limit exceeded after retries',
              );
              return reply.status(429).send({
                error: 'rate_limited',
                message: 'Mom Brain needs a minute to catch up. Try again shortly.',
              });
            }
          }

          // Not a rate limit error, fail immediately
          break;
        }
      }

      // Check if it's an invalid audio format error
      const errMsg = (lastError as any)?.message?.toLowerCase?.() || '';
      if (errMsg.includes('invalid') || (errMsg.includes('audio') && errMsg.includes('format'))) {
        app.logger.warn(
          { err: lastError, fileSize, mimeType },
          'Invalid audio format or file',
        );
        return reply.status(400).send({
          error: 'audio_invalid',
          message: "I didn't catch any words. Try once more, or type it in.",
        });
      }

      app.logger.error(
        { err: lastError, fileSize, mimeType },
        'Failed to transcribe audio',
      );
      return reply.status(500).send({
        error: 'server_error',
        message: 'Something got tangled while listening. Try again.',
      });
    },
  );
}
