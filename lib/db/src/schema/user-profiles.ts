import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const userProfilesTable = pgTable("user_profiles", {
  id: text("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  nickname: text("nickname"),
  skillLevel: text("skill_level").notNull().default("beginner"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type UserProfile = typeof userProfilesTable.$inferSelect;
