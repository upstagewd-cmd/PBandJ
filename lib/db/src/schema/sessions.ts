import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const sessionsTable = pgTable("open_play_sessions", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  hostToken: text("host_token").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const sessionPlayersTable = pgTable("session_players", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  teamName: text("team_name"),
  eloRating: integer("elo_rating").notNull().default(1200),
  partnerId: text("partner_id"),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
});

export const sessionMatchesTable = pgTable("session_matches", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  team1P1Id: text("team1_p1_id").notNull(),
  team1P2Id: text("team1_p2_id"),
  team2P1Id: text("team2_p1_id").notNull(),
  team2P2Id: text("team2_p2_id"),
  winnerTeam: integer("winner_team").notNull(),
  scoreOne: integer("score_one"),
  scoreTwo: integer("score_two"),
  playedAt: timestamp("played_at").notNull().defaultNow(),
});

export const insertSessionSchema = createInsertSchema(sessionsTable).omit({ createdAt: true });
export const insertSessionPlayerSchema = createInsertSchema(sessionPlayersTable).omit({ joinedAt: true });
export const insertSessionMatchSchema = createInsertSchema(sessionMatchesTable).omit({ playedAt: true });

export type Session = typeof sessionsTable.$inferSelect;
export type SessionPlayer = typeof sessionPlayersTable.$inferSelect;
export type SessionMatch = typeof sessionMatchesTable.$inferSelect;
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type InsertSessionPlayer = z.infer<typeof insertSessionPlayerSchema>;
export type InsertSessionMatch = z.infer<typeof insertSessionMatchSchema>;
