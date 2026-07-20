import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema/schema.js';
import type { App } from '../index.js';

interface TaskMeta {
  taskText: string;
  category: string;
  childName: string | null;
  delegation: 'me' | 'partner' | 'coparent' | 'kid';
  isPartnerTask: boolean;
}

interface DumpData {
  id: string;
  originalText: string;
  inputSource: 'voice' | 'typed' | 'screenshot';
  momCheckIn: string | null;
  rhythmInsights: object | null;
  isLatest: boolean;
  createdAt: string;
  taskMeta: TaskMeta[];
}

interface KidData {
  id: string;
  name: string;
  age: number | null;
  grade: string | null;
  nicknames: string[] | null;
}

interface MigrateLocalDataBody {
  dumps: DumpData[];
  kids: KidData[];
  partnerName: string | null;
  onboardingDone: boolean;
}

// Category mapping: local names to DB enum values
const categoryMapping: Record<string, string> = {
  doToday: 'school',
  thisWeek: 'health',
  kids: 'household',
  home: 'social',
  errands: 'self_care',
  meals: 'work',
  messages: 'errands',
  holdingForLater: 'other',
  work: 'work',
};

// Delegation mapping: local names to DB enum values
const delegationMapping: Record<string, string> = {
  me: 'self',
  partner: 'partner',
  coparent: 'partner',
  kid: 'shared',
};

function mapInputSource(source: string): 'voice' | 'text' {
  if (source === 'voice') return 'voice';
  return 'text';
}

function mapCategory(category: string): string {
  return categoryMapping[category] || 'other';
}

function mapDelegation(delegation: string): string {
  return delegationMapping[delegation] || 'unassigned';
}

export function register(app: App, fastify: FastifyInstance) {
  fastify.post<{ Body: MigrateLocalDataBody }>(
    '/api/migrate/local-data',
    {
      schema: {
        description: 'Migrate local data to cloud (one-time endpoint)',
        tags: ['migrate'],
        body: {
          type: 'object',
          required: ['dumps', 'kids', 'onboardingDone'],
          properties: {
            dumps: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  originalText: { type: 'string' },
                  inputSource: { type: 'string', enum: ['voice', 'typed', 'screenshot'] },
                  momCheckIn: { type: 'string', nullable: true },
                  rhythmInsights: { type: 'object', nullable: true },
                  isLatest: { type: 'boolean' },
                  createdAt: { type: 'string', format: 'date-time' },
                  taskMeta: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        taskText: { type: 'string' },
                        category: { type: 'string' },
                        childName: { type: 'string', nullable: true },
                        delegation: { type: 'string', enum: ['me', 'partner', 'coparent', 'kid'] },
                        isPartnerTask: { type: 'boolean' },
                      },
                    },
                  },
                },
              },
            },
            kids: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  age: { type: 'number', nullable: true },
                  grade: { type: 'string', nullable: true },
                  nicknames: { type: 'array', items: { type: 'string' }, nullable: true },
                },
              },
            },
            partnerName: { type: 'string', nullable: true },
            onboardingDone: { type: 'boolean' },
          },
        },
        response: {
          200: {
            description: 'Migration result',
            type: 'object',
            properties: {
              migrated: { type: 'boolean' },
              dumpsInserted: { type: 'number' },
              tasksInserted: { type: 'number' },
              kidsInserted: { type: 'number' },
              reason: { type: 'string' },
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
            description: 'Server error',
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: MigrateLocalDataBody }>, reply: FastifyReply) => {
      const requireAuth = app.requireAuth();
      const session = await requireAuth(request, reply);
      if (!session) return;

      const userId = session.user.id;
      const { dumps, kids, partnerName, onboardingDone } = request.body;

      app.logger.info({ userId, dumpsCount: dumps.length, kidsCount: kids.length }, 'migrate_local_data_start');

      try {
        // Idempotency guard: check user_profile.has_migrated_local_data
        const userProfileRow = await app.db
          .select()
          .from(schema.userProfile)
          .where(eq(schema.userProfile.userId, userId))
          .limit(1);

        const userProf = Array.isArray(userProfileRow) && userProfileRow.length > 0 ? userProfileRow[0] : null;

        if (userProf && userProf.hasMigratedLocalData) {
          app.logger.info({ userId }, 'migrate_already_migrated');
          return reply.status(200).send({
            migrated: false,
            reason: 'already_migrated',
          });
        }

        // Use transaction for atomicity
        let dumpsInserted = 0;
        let tasksInserted = 0;
        let kidsInserted = 0;

        await app.db.transaction(async (tx) => {
          // Insert dumps
          if (dumps && Array.isArray(dumps) && dumps.length > 0) {
            const dumpRows = dumps.map((d) => ({
              id: d.id,
              userId,
              originalText: d.originalText,
              inputSource: mapInputSource(d.inputSource),
              momCheckIn: d.momCheckIn,
              rhythmInsights: d.rhythmInsights,
              isLatest: d.isLatest,
              createdAt: new Date(d.createdAt),
            }));

            const inserted = await tx
              .insert(schema.dumps)
              .values(dumpRows)
              .returning();

            dumpsInserted = Array.isArray(inserted) ? inserted.length : 0;

            app.logger.info({ userId, dumpsInserted }, 'migrate_dumps_inserted');

            // Insert tasks for each dump
            for (const dump of dumps) {
              if (dump.taskMeta && Array.isArray(dump.taskMeta) && dump.taskMeta.length > 0) {
                const taskRows = dump.taskMeta.map((tm) => ({
                  id: randomUUID(),
                  userId,
                  dumpId: dump.id,
                  taskText: tm.taskText,
                  category: mapCategory(tm.category),
                  childName: tm.childName,
                  delegation: mapDelegation(tm.delegation),
                  isPartnerTask: tm.isPartnerTask,
                  completed: false,
                  dueDate: null,
                  carriedFromTaskId: null,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                }));

                const insertedTasks = await tx
                  .insert(schema.tasks)
                  .values(taskRows)
                  .returning();

                tasksInserted += Array.isArray(insertedTasks) ? insertedTasks.length : 0;
              }
            }

            app.logger.info({ userId, tasksInserted }, 'migrate_tasks_inserted');
          }

          // Insert kids with conflict handling
          if (kids && Array.isArray(kids) && kids.length > 0) {
            const kidRows = kids.map((k) => ({
              id: k.id,
              userId,
              name: k.name,
              age: k.age,
              grade: k.grade,
              nicknames: k.nicknames,
              createdAt: new Date(),
            }));

            // Use INSERT ... ON CONFLICT DO NOTHING
            const inserted = await tx
              .insert(schema.kids)
              .values(kidRows)
              .onConflictDoNothing()
              .returning();

            kidsInserted = Array.isArray(inserted) ? inserted.length : 0;

            app.logger.info({ userId, kidsInserted }, 'migrate_kids_inserted');
          }

          // Upsert user_profile with has_migrated_local_data = true
          await tx
            .insert(schema.userProfile)
            .values({
              userId,
              plan: 'free',
              localOnly: false,
              partnerName,
              onboardingDone,
              voiceDumpsUsedThisPeriod: 0,
              historyRetentionDays: 30,
              hasMigratedLocalData: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: schema.userProfile.userId,
              set: {
                partnerName,
                onboardingDone,
                hasMigratedLocalData: true,
                updatedAt: new Date(),
              },
            });

            app.logger.info({ userId }, 'migrate_user_profile_upserted');
        });

        app.logger.info(
          { userId, dumpsInserted, tasksInserted, kidsInserted },
          'migrate_local_data_success',
        );

        return reply.status(200).send({
          migrated: true,
          dumpsInserted,
          tasksInserted,
          kidsInserted,
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        app.logger.error({ err: error, errorMsg, userId }, 'migrate_local_data_failed');
        return reply.status(500).send({
          error: 'migration_failed',
          message: 'Failed to migrate local data',
        });
      }
    },
  );
}
