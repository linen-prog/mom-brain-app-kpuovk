import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { gateway } from '@specific-dev/framework';
import { generateText } from 'ai';
import type { App } from '../index.js';

function isRateLimitError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as any;
  if (e.statusCode === 429 || e.status === 429) return true;
  if (e.name === 'GatewayRateLimitError') return true;
  if (typeof e.message === 'string') {
    const msg = e.message.toLowerCase();
    return msg.includes('rate') || msg.includes('429');
  }
  return false;
}

const REFUSAL_PREFIXES = [
  'i cannot',
  "i can't",
  'i could not',
  'i am unable',
  'i am sorry',
  'sorry, i',
  'there is',
  "there isn't",
  'there are no',
  'no speech',
  'no audio',
  'no words',
  'no content',
  'unable to',
  'the audio contains',
  'the audio has',
  'the audio is',
  'this audio',
];

function isRefusal(text: string): boolean {
  const lower = text.trim().toLowerCase();
  return REFUSAL_PREFIXES.some(prefix => lower.startsWith(prefix));
}

export function register(app: App, fastify: FastifyInstance) {
  fastify.post(
    '/api/transcribe',
    {
      schema: {
        description: 'Transcribe speech from an audio file using Google Gemini',
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
      const data = await request.file({ limits: { fileSize: 10 * 1024 * 1024 } });

      if (!data) {
        app.logger.warn('Audio file is required');
        return reply.status(400).send({
          error: 'audio is required',
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
        { bytes: fileSize, mimeType },
        'transcribe_start',
      );

      // Convert audio buffer to base64
      const base64Audio = buffer.toString('base64');

      // Retry logic for rate limits
      let lastError: unknown;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const { text } = await generateText({
            model: gateway('google/gemini-2.5-flash'),
            system:
              'Transcribe the speech in this audio. Output ONLY the transcribed words exactly as spoken — no commentary, no formatting, no quotation marks, no introductory phrases. If the audio contains no speech (silence, noise, music with no words), output an empty string and nothing else.',
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

          const rawLength = text.length;
          const suppressedAsRefusal = isRefusal(text);
          const finalText = suppressedAsRefusal ? '' : text.trim();
          const elapsedMs = Date.now() - startTime;

          app.logger.info(
            {
              bytes: fileSize,
              raw_text_length: rawLength,
              final_text_length: finalText.length,
              duration_ms: elapsedMs,
              suppressed_as_refusal: suppressedAsRefusal,
            },
            'transcribe_ok',
          );

          return reply.status(200).send({ text: finalText });
        } catch (error) {
          lastError = error;

          if (isRateLimitError(error)) {
            if (attempt < 4) {
              // Exponential backoff: 3s, 6s, 12s, 24s
              const delayMs = Math.pow(3, attempt + 1) * 1000;
              app.logger.warn(
                { attempt: attempt + 1, delayMs_ms: delayMs },
                'rate_limited',
              );
              await new Promise(resolve => setTimeout(resolve, delayMs));
              continue;
            } else {
              app.logger.warn(
                { attempts: attempt + 1 },
                'rate_limited',
              );
              return reply.status(429).send({
                error: 'rate_limited',
                message: 'Mom Brain needs a minute to catch up. Try again shortly.',
              });
            }
          }

          // Non-rate-limit error, fail immediately
          break;
        }
      }

      app.logger.error(
        { err: lastError, bytes: fileSize, mimeType },
        'transcribe_failed',
      );
      return reply.status(500).send({
        error: 'server_error',
        message: 'Something got tangled while listening. Try again.',
      });
    },
  );
}
