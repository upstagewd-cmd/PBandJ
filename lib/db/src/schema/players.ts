import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const playersTable = pgTable("players", {
  id: text("id").primaryKey(),
  tournamentId: text("tournament_id").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  seed: integer("seed").notNull().default(0),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
});

export const insertPlayerSchema = createInsertSchema(playersTable).omit({ joinedAt: true });
export type InsertPlayer = z.infer<typeof insertPlayerSchema>;
export type Player = typeof playersTable.$inferSelect;
