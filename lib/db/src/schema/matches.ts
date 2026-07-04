import { pgTable, text, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const matchesTable = pgTable("matches", {
  id: text("id").primaryKey(),
  tournamentId: text("tournament_id").notNull(),
  round: integer("round").notNull(),
  matchNumber: integer("match_number").notNull(),
  bracket: text("bracket").notNull().default("winner"),
  playerOneId: text("player_one_id"),
  playerTwoId: text("player_two_id"),
  winnerId: text("winner_id"),
  scoreOne: integer("score_one"),
  scoreTwo: integer("score_two"),
  status: text("status").notNull().default("pending"),
  isBye: boolean("is_bye").notNull().default(false),
  nextWinnerMatchId: text("next_winner_match_id"),
  nextWinnerSlot: text("next_winner_slot"),
  nextLoserMatchId: text("next_loser_match_id"),
  nextLoserSlot: text("next_loser_slot"),
});

export const insertMatchSchema = createInsertSchema(matchesTable);
export type InsertMatch = z.infer<typeof insertMatchSchema>;
export type Match = typeof matchesTable.$inferSelect;
