import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema/schema.js';
import type { App } from '../index.js';

export function register(app: App, fastify: FastifyInstance) {
  fastify.delete(
    '/api/user',
    {
      schema: {
        description: 'Permanently delete the authenticated user account and all associated data',
        tags: ['user'],
        response: {
          200: {
            description: 'Account deleted successfully',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' },
            },
          },
          401: {
            description: 'Unauthorized',
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
          500: {
            description: 'Internal server error',
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest,
      reply: FastifyReply
    ): Promise<{ success: boolean; message: string } | void> => {
      app.logger.info({}, 'DELETE /api/user - account deletion request');

      // Check authentication
      const requireAuth = app.requireAuth();
      const session = await requireAuth(request, reply);
      if (!session) return;

      const userId = session.user.id;
      app.logger.info({ userId }, 'Deleting user account and associated data');

      try {
        // Delete all user data in a single transaction, respecting FK constraints
        // Order: tasks -> dumps -> kids -> user_profile
        await app.db.transaction(async (tx) => {
          // 1. Delete tasks
          await tx.delete(schema.tasks).where(eq(schema.tasks.userId, userId));
          app.logger.debug({ userId }, 'Tasks deleted');

          // 2. Delete dumps
          await tx.delete(schema.dumps).where(eq(schema.dumps.userId, userId));
          app.logger.debug({ userId }, 'Dumps deleted');

          // 3. Delete kids
          await tx.delete(schema.kids).where(eq(schema.kids.userId, userId));
          app.logger.debug({ userId }, 'Kids deleted');

          // 4. Delete user profile
          await tx.delete(schema.userProfile).where(eq(schema.userProfile.userId, userId));
          app.logger.debug({ userId }, 'User profile deleted');
        });

        app.logger.info({ userId }, 'User account permanently deleted');

        return reply.status(200).send({
          success: true,
          message: 'Account deleted',
        });
      } catch (error) {
        app.logger.error(
          { err: error, userId },
          'Failed to delete user account'
        );
        return reply.status(500).send({
          error: 'Failed to delete account',
        });
      }
    }
  );
}
