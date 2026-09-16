import { integer, sqliteTable, text, index } from 'drizzle-orm/sqlite-core';

export const timeEntries = sqliteTable('time_entries', {
  id: integer('id').primaryKey({ autoIncrement: true }), userId: text('user_id').notNull(), workItemId: integer('work_item_id').notNull(), workDate: text('work_date').notNull(), startedAt: text('started_at').notNull(), endedAt: text('ended_at'), seconds: integer('seconds').notNull().default(0), status: text('status', { enum: ['running','paused','stopped'] }).notNull(),
}, table => [index('idx_time_entries_user_date').on(table.userId, table.workDate)]);
