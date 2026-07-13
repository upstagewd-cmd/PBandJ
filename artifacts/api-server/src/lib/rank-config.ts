import { db, rankTiersTable } from "@workspace/db";
import { asc } from "drizzle-orm";

export async function getRankTierForElo(elo: number) {
  const tiers = await db.select().from(rankTiersTable).orderBy(asc(rankTiersTable.displayOrder));
  const sorted = [...tiers].sort((a, b) => a.minElo - b.minElo);
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (elo >= sorted[i].minElo) {
      return {
        id: sorted[i].id,
        title: sorted[i].title,
        emoji: sorted[i].emoji,
        minElo: sorted[i].minElo,
      };
    }
  }
  return tiers[0]
    ? { id: tiers[0].id, title: tiers[0].title, emoji: tiers[0].emoji, minElo: tiers[0].minElo }
    : { id: "default", title: "New Seed", emoji: "🌱", minElo: 0 };
}
