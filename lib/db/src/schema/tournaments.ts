import { pgTable, text, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tournamentsTable = pgTable("tournaments", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  status: text("status").notNull().default("lobby"), // lobby | active | completed
  registrationLocked: boolean("registration_locked").notNull().default(false),
  hostToken: text("host_token").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
});

export const insertTournamentSchema = createInsertSchema(tournamentsTable).omit({ createdAt: true });
export type InsertTournament = z.infer<typeof insertTournamentSchema>;
export type Tournament = typeof tournamentsTable.$inferSelect;
