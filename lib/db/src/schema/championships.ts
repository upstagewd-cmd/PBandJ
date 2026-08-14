import { boolean, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const championshipsTable = pgTable("championships", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  imageUrl: text("image_url").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  currentPlayer1Id: text("current_player1_id"),
  currentPlayer2Id: text("current_player2_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const championshipLineageTable = pgTable(
  "championship_lineage",
  {
    id: text("id").primaryKey(),
    championshipId: text("championship_id").notNull(),
    tournamentId: text("tournament_id"),
    player1Id: text("player1_id").notNull(),
    player2Id: text("player2_id").notNull(),
    eventType: text("event_type").notNull().default("tournament_win"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    tournamentUnique: uniqueIndex("championship_lineage_tournament_idx").on(table.championshipId, table.tournamentId),
  }),
);

export const insertChampionshipSchema = createInsertSchema(championshipsTable).omit({ createdAt: true, updatedAt: true });
export const insertChampionshipLineageSchema = createInsertSchema(championshipLineageTable).omit({ createdAt: true });

export type Championship = typeof championshipsTable.$inferSelect;
export type ChampionshipLineage = typeof championshipLineageTable.$inferSelect;
export type InsertChampionship = z.infer<typeof insertChampionshipSchema>;
export type InsertChampionshipLineage = z.infer<typeof insertChampionshipLineageSchema>;