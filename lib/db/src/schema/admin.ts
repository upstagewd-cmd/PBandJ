import { pgTable, text, integer, boolean, timestamp, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const rankTiersTable = pgTable("rank_tiers", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  emoji: text("emoji").notNull(),
  minElo: real("min_elo").notNull(),
  displayOrder: integer("display_order").notNull(),
});

export const badgesTable = pgTable("badges", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  ruleType: text("rule_type").notNull(),
  threshold: integer("threshold").notNull(),
  icon: text("icon").notNull().default("🏅"),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const playerBadgesTable = pgTable("player_badges", {
  id: text("id").primaryKey(),
  playerId: text("player_id").notNull(),
  badgeId: text("badge_id").notNull(),
  grantedAt: timestamp("granted_at").notNull().defaultNow(),
  grantedBy: text("granted_by").notNull().default("system"),
});

export const systemSettingsTable = pgTable("system_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertRankTierSchema = createInsertSchema(rankTiersTable);
export const insertBadgeSchema = createInsertSchema(badgesTable).omit({ createdAt: true });
export const insertPlayerBadgeSchema = createInsertSchema(playerBadgesTable).omit({ grantedAt: true });
export const insertSystemSettingSchema = createInsertSchema(systemSettingsTable).omit({ updatedAt: true });

export type RankTier = typeof rankTiersTable.$inferSelect;
export type Badge = typeof badgesTable.$inferSelect;
export type PlayerBadge = typeof playerBadgesTable.$inferSelect;
export type SystemSetting = typeof systemSettingsTable.$inferSelect;
export type InsertRankTier = z.infer<typeof insertRankTierSchema>;
export type InsertBadge = z.infer<typeof insertBadgeSchema>;
export type InsertPlayerBadge = z.infer<typeof insertPlayerBadgeSchema>;
