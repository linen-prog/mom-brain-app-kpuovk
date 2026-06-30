// recompile trigger — no functional change
import { createApplication } from "@specific-dev/framework";
import * as schema from './db/schema/schema.js';
import * as organizeRoutes from './routes/organize.js';
import * as transcribeRoutes from './routes/transcribe.js';
import * as emailDraftRoutes from './routes/email-draft.js';
import * as rhythmRecapRoutes from './routes/rhythm-recap.js';

// Create application with schema for full database type support
export const app = await createApplication(schema);

// Export App type for use in route files
export type App = typeof app;

// Register routes - add your route modules here
// IMPORTANT: Always use registration functions to avoid circular dependency issues
organizeRoutes.register(app, app.fastify);
transcribeRoutes.register(app, app.fastify);
emailDraftRoutes.register(app, app.fastify);
rhythmRecapRoutes.register(app, app.fastify);

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
