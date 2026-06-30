import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { App } from '../index.js';
import { callOrganizeAI, ORGANIZE_SYSTEM_PROMPT } from './organize.js';
import type { OrganizeResponse } from './organize.js';

interface ImageData {
  base64: string;
  mimeType: string;
}

interface OrganizeImageRequestBody {
  images: ImageData[];
  kids?: Array<{ name: string; age?: number; grade?: string; nicknames?: string[] }>;
  partnerName?: string;
}

interface NoActionableContentResponse {
  noActionableContent: true;
  message: string;
}

function isRateLimitError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as any;
  if (e.statusCode === 429 || e.status === 429) return true;
  if (typeof e.message === 'string' && (e.message.includes('rate') || e.message.includes('429'))) return true;
  return false;
}

const VISION_SYSTEM_PROMPT = `You are analyzing screenshot images to extract actionable content for a busy parent. Extract ONLY tasks, deadlines, requests, reminders, things to buy/do/remember. Return each distinct task separately. Mark unclear details with [confirm]. Ignore casual conversation, ads, irrelevant UI elements.

If the image contains NO actionable content (only casual chat, news, ads, or general content), respond with exactly: "NO_ACTIONABLE_CONTENT"

Otherwise, return a plain text list of actionable items found.`;

export function register(app: App, fastify: FastifyInstance) {
  fastify.post<{ Body: OrganizeImageRequestBody }>(
    '/api/organize-image',
    {
      schema: {
        description: 'Extract and organize tasks from screenshot images',
        tags: ['organize'],
        body: {
          type: 'object',
          required: ['images'],
          properties: {
            images: {
              type: 'array',
              description: 'Array of images (max 3)',
              items: {
                type: 'object',
                required: ['base64', 'mimeType'],
                properties: {
                  base64: { type: 'string', description: 'Base64 encoded image data' },
                  mimeType: { type: 'string', description: 'MIME type (e.g. image/png, image/jpeg)' },
                },
              },
            },
            kids: {
              type: 'array',
              description: 'Optional array of child information',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  age: { type: 'number' },
                  grade: { type: 'string' },
                  nicknames: { type: 'array', items: { type: 'string' } },
                },
              },
            },
            partnerName: { type: 'string', description: 'Optional partner/spouse name' },
          },
        },
        response: {
          200: {
            description: 'Tasks extracted and organized from image',
            type: 'object',
            properties: {
              noActionableContent: { type: 'boolean' },
              message: { type: 'string' },
              source: { type: 'string' },
            },
          },
          400: {
            description: 'Invalid request',
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
            description: 'Processing failed',
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: OrganizeImageRequestBody }>, reply: FastifyReply) => {
      const { images, kids, partnerName } = request.body;

      if (!images || images.length === 0) {
        return reply.status(400).send({ error: 'images array is required and cannot be empty' });
      }

      if (images.length > 3) {
        return reply.status(400).send({ error: 'Maximum 3 images allowed' });
      }

      app.logger.info({ imageCount: images.length, hasKids: !!kids, hasPartner: !!partnerName }, 'POST /api/organize-image');

      if (!process.env.OPENROUTER_API_KEY) {
        const mockResponse: OrganizeResponse & { source: string } = {
          doToday: ['Task from screenshot'],
          thisWeek: [],
          kids: [],
          home: [],
          errands: [],
          meals: [],
          messages: [],
          holdingForLater: [],
          momCheckIn: 'Found actionable content in the screenshot.',
          source: 'screenshot',
        };
        return reply.send(mockResponse);
      }

      try {
        const apiKey = process.env.OPENROUTER_API_KEY;

        // Step 1: Vision extraction
        let extractedText: string | null = null;
        let lastError: unknown;

        for (let attempt = 0; attempt < 5; attempt++) {
          try {
            const contentParts: any[] = [{ type: 'text', text: VISION_SYSTEM_PROMPT }];

            for (const image of images) {
              contentParts.push({
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: image.mimeType,
                  data: image.base64,
                },
              });
            }

            const visionResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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
                    role: 'user',
                    content: contentParts,
                  },
                ],
              }),
            });

            if (visionResponse.status === 429) {
              const error = new Error('Rate limited');
              (error as any).statusCode = 429;
              throw error;
            }

            if (!visionResponse.ok) {
              throw new Error(`Vision API error ${visionResponse.status}`);
            }

            const visionData = await visionResponse.json() as any;
            extractedText = visionData.choices?.[0]?.message?.content;

            if (!extractedText) {
              throw new Error('No content from vision API');
            }

            break;
          } catch (error) {
            lastError = error;
            if (!isRateLimitError(error)) {
              break;
            }
            if (attempt < 4) {
              await new Promise((resolve) => setTimeout(resolve, Math.pow(3, attempt + 1) * 1000));
            } else {
              throw error;
            }
          }
        }

        if (!extractedText) {
          throw lastError || new Error('Failed to extract text from images');
        }

        // Check if no actionable content
        if (extractedText.trim() === 'NO_ACTIONABLE_CONTENT') {
          app.logger.info({}, 'organize_image_no_actionable_content');
          return reply.send({
            noActionableContent: true,
            message: 'Nothing actionable found in this image.',
          } as NoActionableContentResponse);
        }

        // Step 2: Organization via callOrganizeAI
        const organized = await callOrganizeAI(extractedText, kids, partnerName);

        const result: OrganizeResponse & { source: string } = {
          ...organized,
          source: 'screenshot',
        };

        app.logger.info({ categoriesCount: Object.keys(result).length }, 'organize_image_success');
        return reply.send(result);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        if (isRateLimitError(error)) {
          app.logger.warn({ errorMsg }, 'organize_image_rate_limited');
          return reply.code(429).send({
            error: 'rate_limited',
            message: 'Mom Brain needs a minute to catch up. Try again shortly.',
          });
        }
        app.logger.error({ err: error, errorMsg }, 'organize_image_failed');
        return reply.code(500).send({
          error: 'server_error',
          message: 'Failed to process image. Try again.',
        });
      }
    }
  );
}
