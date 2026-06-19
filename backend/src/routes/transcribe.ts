import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
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

      // Determine audio format from mimetype
      const audioFormat = mimeType.includes('mp4') || mimeType.includes('m4a') ? 'mp4' : 'wav';

      // Retry logic for rate limits
      let lastError: unknown;
      for (let attempt = 0; attempt < 5; attempt++) {
        app.logger.debug({ attempt }, 'transcribe_attempt_start');
        try {
          const apiKey = process.env.OPENROUTER_API_KEY;
          const isTestMode = !apiKey;

          if (isTestMode) {
            // In test mode without API key, return a mock response
            app.logger.info({ bytes: fileSize, mimeType }, 'transcribe_test_mode_mock_response');

            const mockText = 'This is a test transcription of the audio file.';
            const elapsedMs = Date.now() - startTime;

            app.logger.info(
              {
                bytes: fileSize,
                raw_text_length: mockText.length,
                final_text_length: mockText.length,
                duration_ms: elapsedMs,
                suppressed_as_refusal: false,
                testMode: true,
              },
              'transcribe_ok',
            );

            return reply.status(200).send({ text: mockText });
          }

          const requestBody = {
            model: 'google/gemini-2.5-flash',
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: 'Transcribe the speech in this audio. Output ONLY the transcribed words exactly as spoken — no commentary, no formatting, no quotation marks, no introductory phrases. If the audio contains no speech (silence, noise, music with no words), output an empty string and nothing else.',
                  },
                  {
                    type: 'input_audio',
                    input_audio: {
                      data: base64Audio,
                      format: audioFormat,
                    },
                  },
                ],
              },
            ],
          };

          app.logger.debug({ model: requestBody.model, audioFormat, audioBytes: fileSize }, 'calling_openrouter');

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

          const text = data.choices?.[0]?.message?.content;
          if (text === undefined) {
            app.logger.error({ data }, 'No content in OpenRouter response');
            throw new Error('No content in OpenRouter response');
          }

          const rawLength = (text as string).length;
          const suppressedAsRefusal = isRefusal(text as string);
          const finalText = suppressedAsRefusal ? '' : (text as string).trim();
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
            'transcribe_call_failed',
          );

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

      const errorMessage = lastError instanceof Error ? lastError.message : String(lastError);
      const errorStack = lastError instanceof Error ? lastError.stack : undefined;
      const errorName = lastError instanceof Error ? lastError.name : undefined;
      app.logger.error(
        { err: lastError, errorMessage, errorName, errorStack, bytes: fileSize, mimeType },
        'transcribe_failed',
      );
      return reply.status(500).send({
        error: 'server_error',
        message: 'Something got tangled while listening. Try again.',
      });
    },
  );
}
