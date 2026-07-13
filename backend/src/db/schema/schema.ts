import { pgTable, uuid, text, timestamp, integer, boolean, jsonb, pgEnum } from 'drizzle-orm/pg-core';
import { user } from './auth-schema.js';

// Enums
export const planEnum = pgEnum('plan', ['free', 'pro']);
export const inputSourceEnum = pgEnum('input_source', ['voice', 'text']);
export const taskCategoryEnum = pgEnum('task_category', ['school', 'health', 'household', 'social', 'self_care', 'work', 'errands', 'other']);
export const delegationEnum = pgEnum('delegation', ['self', 'partner', 'shared', 'unassigned']);

// User Profile Table
export const userProfile = pgTable('user_profile', {
  userId: text('user_id').primaryKey().references(() => user.id, { onDelete: 'cascade' }),
  plan: planEnum('plan').notNull().default('free'),
  localOnly: boolean('local_only').notNull().default(false),
  partnerName: text('partner_name'),
  onboardingDone: boolean('onboarding_done').notNull().default(false),
  voiceDumpsUsedThisPeriod: integer('voice_dumps_used_this_period').notNull().default(0),
  periodResetAt: timestamp('period_reset_at', { withTimezone: true }),
  historyRetentionDays: integer('history_retention_days').notNull().default(30),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Kids Table
export const kids = pgTable('kids', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().references(() => userProfile.userId, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  age: integer('age'),
  grade: text('grade'),
  nicknames: jsonb('nicknames').default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Dumps Table
export const dumps = pgTable('dumps', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().references(() => userProfile.userId, { onDelete: 'cascade' }),
  originalText: text('original_text').notNull(),
  inputSource: inputSourceEnum('input_source').notNull().default('text'),
  momCheckIn: text('mom_check_in'),
  rhythmInsights: jsonb('rhythm_insights').default({}),
  isLatest: boolean('is_latest').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Tasks Table
export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().references(() => userProfile.userId, { onDelete: 'cascade' }),
  dumpId: uuid('dump_id').notNull().references(() => dumps.id, { onDelete: 'cascade' }),
  taskText: text('task_text').notNull(),
  category: taskCategoryEnum('category').notNull().default('other'),
  childName: text('child_name'),
  delegation: delegationEnum('delegation').notNull().default('unassigned'),
  isPartnerTask: boolean('is_partner_task').notNull().default(false),
  completed: boolean('completed').notNull().default(false),
  dueDate: timestamp('due_date', { withTimezone: true }),
  carriedFromTaskId: uuid('carried_from_task_id').references(() => tasks.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
