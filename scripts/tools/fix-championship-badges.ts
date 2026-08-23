// One-off cleanup: remove championship_holder badges that were incorrectly
// auto-granted to every player due to a badge-awards.ts threshold bug.
import { db, badgesTable, playerBadgesTable, championshipsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

async function main() {
  const championshipBadges = await db
    .select()
    .from(badgesTable)
    .where(eq(badgesTable.ruleType, "championship_holder"));

  if (championshipBadges.length === 0) {
    console.log("No championship_holder badges found.");
    return;
  }

  let totalRemoved = 0;

  for (const badge of championshipBadges) {
    const championshipId = badge.id.replace(/^championship-/, "");
    const [championship] = await db
      .select()
      .from(championshipsTable)
      .where(eq(championshipsTable.id, championshipId));

    const validPlayerIds = [championship?.currentPlayer1Id, championship?.currentPlayer2Id].filter(
      (id): id is string => !!id
    );

    const existingGrants = await db
      .select()
      .from(playerBadgesTable)
      .where(eq(playerBadgesTable.badgeId, badge.id));

    const invalidGrants = existingGrants.filter((grant) => !validPlayerIds.includes(grant.playerId));
    if (invalidGrants.length === 0) continue;

    await db.delete(playerBadgesTable).where(
      inArray(
        playerBadgesTable.id,
        invalidGrants.map((grant) => grant.id)
      )
    );

    totalRemoved += invalidGrants.length;
    console.log(`Removed ${invalidGrants.length} incorrect grant(s) for badge "${badge.name}" (${badge.id}).`);
  }

  console.log(`Done. Removed ${totalRemoved} incorrect championship badge grant(s) total.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
