import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const teamsTable = pgTable("teams", {
  id: text("id").primaryKey(),
  tournamentId: text("tournament_id").notNull(),
  player1Id: text("player1_id"),
  player2Id: text("player2_id"),
  teamName: text("team_name"),
  seed: integer("seed").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertTeamSchema = createInsertSchema(teamsTable).omit({ createdAt: true });
export type InsertTeam = z.infer<typeof insertTeamSchema>;
export type Team = typeof teamsTable.$inferSelect;
