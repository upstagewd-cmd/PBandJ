import { pgTable, text, integer, timestamp, primaryKey } from "drizzle-orm/pg-core";

export const tournamentPodiumAwardsTable = pgTable(
  "tournament_podium_awards",
  {
    tournamentId: text("tournament_id").notNull(),
    playerId: text("player_id").notNull(),
    place: integer("place").notNull(), // 1, 2, or 3
    awardedAt: timestamp("awarded_at").notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.tournamentId, table.playerId, table.place] }),
  })
);
