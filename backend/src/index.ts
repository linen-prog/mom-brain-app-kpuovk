// recompile trigger — no functional change
import { createApplication } from "@specific-dev/framework";
import * as appSchema from './db/schema/schema.js';
import * as authSchema from './db/schema/auth-schema.js';
import * as organizeRoutes from './routes/organize.js';
import * as transcribeRoutes from './routes/transcribe.js';
import * as emailDraftRoutes from './routes/email-draft.js';
import * as rhythmRecapRoutes from './routes/rhythm-recap.js';
import * as organizeImageRoutes from './routes/organize-image.js';

// Merge app and auth schemas
const schema = { ...appSchema, ...authSchema };

// Create application with schema for full database type support
export const app = await createApplication(schema);

// Export App type for use in route files
export type App = typeof app;

// Enable authentication with email/password and OAuth providers
app.withAuth();

// Register routes - add your route modules here
// IMPORTANT: Always use registration functions to avoid circular dependency issues
organizeRoutes.register(app, app.fastify);
transcribeRoutes.register(app, app.fastify);
emailDraftRoutes.register(app, app.fastify);
rhythmRecapRoutes.register(app, app.fastify);
organizeImageRoutes.register(app, app.fastify);

console.log('[STARTUP] OPENROUTER_API_KEY present:', !!process.env.OPENROUTER_API_KEY, '| length:', process.env.OPENROUTER_API_KEY?.length ?? 0);
await app.run();
app.logger.info('Application running');

const apiKey = process.env.OPENROUTER_API_KEY;
app.logger.info(
  {
    hasKey: !!apiKey,
    keyPrefix: apiKey ? apiKey.substring(0, 8) : 'MISSING',
  },
  'startup_env_check',
);
