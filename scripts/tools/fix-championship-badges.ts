// One-off cleanup: remove championship_holder badges that were incorrectly
// auto-granted to every player due to a badge-awards.ts threshold bug.
import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set.");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const { rows: championshipBadges } = await pool.query(
    `SELECT id, name FROM badges WHERE rule_type = 'championship_holder'`
  );

  if (championshipBadges.length === 0) {
    console.log("No championship_holder badges found.");
    return;
  }

  let totalRemoved = 0;

  for (const badge of championshipBadges) {
    const championshipId = badge.id.replace(/^championship-/, "");
    const { rows: championshipRows } = await pool.query(
      `SELECT current_player1_id, current_player2_id FROM championships WHERE id = $1`,
      [championshipId]
    );
    const championship = championshipRows[0];

    const validPlayerIds = [championship?.current_player1_id, championship?.current_player2_id].filter(
      (id): id is string => !!id
    );

    const { rows: existingGrants } = await pool.query(
      `SELECT id, player_id FROM player_badges WHERE badge_id = $1`,
      [badge.id]
    );

    const invalidGrants = existingGrants.filter((grant) => !validPlayerIds.includes(grant.player_id));
    if (invalidGrants.length === 0) continue;

    await pool.query(`DELETE FROM player_badges WHERE id = ANY($1)`, [
      invalidGrants.map((grant) => grant.id),
    ]);

    totalRemoved += invalidGrants.length;
    console.log(`Removed ${invalidGrants.length} incorrect grant(s) for badge "${badge.name}" (${badge.id}).`);
  }

  console.log(`Done. Removed ${totalRemoved} incorrect championship badge grant(s) total.`);
}

main()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
