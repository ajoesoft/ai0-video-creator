import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const videoProjects = sqliteTable('video_projects', {
  projectUuid: text('project_uuid').primaryKey(),
  projectName: text('project_name').notNull(),
  projectPrompt: text('project_prompt'),
  coverImagePath: text('cover_image_path'),
  createTime: integer('create_time').notNull(),
  updateTime: integer('update_time').notNull(),
  projectStatus: integer('project_status').default(0).notNull(),
});
