import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const openPlayPoolTable = pgTable("open_play_pool", {
  id: text("id").primaryKey(),
  tournamentId: text("tournament_id").notNull(),
  playerId: text("player_id").notNull(),
  addedAt: timestamp("added_at").notNull().defaultNow(),
  status: text("status").notNull().default("available"),
});

export const openPlayMatchesTable = pgTable("open_play_matches", {
  id: text("id").primaryKey(),
  tournamentId: text("tournament_id").notNull(),
  teamOnePOneId: text("team_one_p_one_id").notNull(),
  teamOnePTwoId: text("team_one_p_two_id"),
  teamTwoPOneId: text("team_two_p_one_id").notNull(),
  teamTwoPTwoId: text("team_two_p_two_id"),
  winnerTeam: integer("winner_team").notNull(),
  scoreOne: integer("score_one"),
  scoreTwo: integer("score_two"),
  playedAt: timestamp("played_at").notNull().defaultNow(),
});

export const insertOpenPlayPoolSchema = createInsertSchema(openPlayPoolTable).omit({ addedAt: true });
export const insertOpenPlayMatchSchema = createInsertSchema(openPlayMatchesTable).omit({ playedAt: true });
export type InsertOpenPlayPool = z.infer<typeof insertOpenPlayPoolSchema>;
export type InsertOpenPlayMatch = z.infer<typeof insertOpenPlayMatchSchema>;
export type OpenPlayPool = typeof openPlayPoolTable.$inferSelect;
export type OpenPlayMatch = typeof openPlayMatchesTable.$inferSelect;
