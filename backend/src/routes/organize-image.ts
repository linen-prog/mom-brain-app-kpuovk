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
              noActionableContent: { type: 'boolean', nullable: true },
              message: { type: 'string', nullable: true },
              doToday: { type: 'array', items: { type: 'string' } },
              thisWeek: { type: 'array', items: { type: 'string' } },
              kids: { type: 'array', items: { type: 'string' } },
              home: { type: 'array', items: { type: 'string' } },
              errands: { type: 'array', items: { type: 'string' } },
              meals: { type: 'array', items: { type: 'string' } },
              messages: { type: 'array', items: { type: 'string' } },
              holdingForLater: { type: 'array', items: { type: 'string' } },
              work: { type: 'array', items: { type: 'string' } },
              momCheckIn: { type: 'string' },
              source: { type: 'string' },
              taskMeta: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    taskText: { type: 'string' },
                    category: { type: 'string', enum: ['doToday', 'thisWeek', 'kids', 'home', 'errands', 'meals', 'messages', 'work', 'holdingForLater'] },
                    childName: { type: 'string', nullable: true },
                    delegation: { type: 'string', enum: ['me', 'partner', 'coparent', 'kid'] },
                    isPartnerTask: { type: 'boolean' },
                  },
                },
              },
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
              rhythmInsights: {
                type: 'object',
                properties: {
                  topCategories: { type: 'array', items: { type: 'string' } },
                  recurringThemes: { type: 'array', items: { type: 'string' } },
                  momCheckIn: { type: 'string' },
                },
              },
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

      // Validate each image has required fields and valid format
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        if (!img.base64 || typeof img.base64 !== 'string') {
          return reply.status(400).send({ error: 'Each image must have a base64 field' });
        }
        if (!img.mimeType || typeof img.mimeType !== 'string') {
          return reply.status(400).send({ error: 'Each image must have a mimeType field' });
        }
        if (img.base64.length === 0) {
          return reply.status(400).send({ error: 'base64 data cannot be empty' });
        }
        // Validate base64 format - must contain only valid base64 characters
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(img.base64)) {
          return reply.status(400).send({ error: 'base64 data is invalid' });
        }
        // Validate mimeType is an image type
        if (!img.mimeType.startsWith('image/')) {
          return reply.status(400).send({ error: 'mimeType must be an image type (image/png, image/jpeg, etc.)' });
        }
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
          work: [],
          momCheckIn: 'Found actionable content in the screenshot.',
          taskMeta: [],
          trackingItems: [],
          rhythmInsights: {
            topCategories: [],
            recurringThemes: [],
            momCheckIn: 'Found actionable content in the screenshot.',
          },
          source: 'screenshot',
        };
        reply.code(200);
        return mockResponse;
      }

      try {
        const apiKey = process.env.OPENROUTER_API_KEY;

        // Step 1: Vision extraction
        const visionSystemPrompt = `You are a vision assistant for Mom Brain, an app that helps busy parents organize their mental load. Your job is to read screenshots and extract actionable content.

RULES:
- Only extract text that is literally visible in the image
- Extract only actionable items: tasks, deadlines, requests, reminders, things to buy/do/remember
- Each distinct item should be on a separate line
- Mark unclear or ambiguous details with [confirm]
- Ignore: casual conversation, reactions, ads, decorative text, UI chrome
- If the image is blank, a photo, a selfie, a meme, or contains NO readable text → respond with exactly: NO_ACTIONABLE_CONTENT
- If text exists but none is actionable (jokes, news, unrelated chat) → respond with exactly: NO_ACTIONABLE_CONTENT
- Do NOT invent, imagine, or guess content not visibly present
- Do NOT add tasks based on what a parent "might" need to do`;

        let extractedText: string | null = null;
        let lastError: unknown;

        for (let attempt = 0; attempt < 5; attempt++) {
          try {
            const contentParts: any[] = [];

            for (const image of images) {
              contentParts.push({
                type: 'image_url',
                image_url: {
                  url: `data:${image.mimeType};base64,${image.base64}`,
                },
              });
            }

            contentParts.push({
              type: 'text',
              text: 'Extract actionable items from this image. If there is no readable text or no actionable content, respond with exactly: NO_ACTIONABLE_CONTENT',
            });

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
                    role: 'system',
                    content: visionSystemPrompt,
                  },
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

        // Check if no actionable content (case-insensitive and prefix match)
        const trimmedUpper = extractedText.trim().toUpperCase();
        if (trimmedUpper === 'NO_ACTIONABLE_CONTENT' || trimmedUpper.startsWith('NO_ACTIONABLE_CONTENT')) {
          app.logger.info({}, 'organize_image_no_actionable_content');
          reply.code(200);
          return {
            noActionableContent: true,
            message: 'Nothing actionable found in this image.',
          } as NoActionableContentResponse;
        }

        // Secondary validation to prevent hallucination artifacts
        const wordCount = extractedText.split(/\s+/).length;
        const longWords = extractedText.split(/\s+/).filter(word => word.length > 3).length;

        if (extractedText.length < 15 || longWords < 2) {
          app.logger.info({ extractedText, length: extractedText.length, longWordsCount: longWords }, 'organize_image_insufficient_content');
          reply.code(200);
          return {
            noActionableContent: true,
            message: 'Nothing actionable found in this image.',
          } as NoActionableContentResponse;
        }

        // Step 2: Organization via callOrganizeAI
        const organized = await callOrganizeAI(extractedText, kids, partnerName);

        const result: OrganizeResponse & { source: string } = {
          ...organized,
          source: 'screenshot',
        };

        app.logger.info({ categoriesCount: Object.keys(result).length }, 'organize_image_success');
        reply.code(200);
        return result;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        if (isRateLimitError(error)) {
          app.logger.warn({ errorMsg }, 'organize_image_rate_limited');
          reply.code(429);
          return {
            error: 'rate_limited',
            message: 'Mom Brain needs a minute to catch up. Try again shortly.',
          };
        }
        app.logger.error({ err: error, errorMsg }, 'organize_image_failed');
        reply.code(500);
        return {
          error: 'server_error',
          message: 'Failed to process image. Try again.',
        };
      }
    }
  );
}
