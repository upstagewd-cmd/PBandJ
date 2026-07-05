import { Router } from "express";
import { db } from "@workspace/db";
import { rankTiersTable, playersTable } from "@workspace/db/schema";
import { eq, gte, lt, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { RANKS } from "../../lib/ranks.js";

export const adminRanksRouter = Router();

async function ensureSeeded() {
  const existing = await db.select().from(rankTiersTable);
  if (existing.length > 0) return;
  for (let i = 0; i < RANKS.length; i++) {
    const r = RANKS[i];
    await db.insert(rankTiersTable).values({
      id: nanoid(8),
      title: r.title,
      emoji: r.emoji,
      minElo: r.minElo,
      displayOrder: i,
    });
  }
}

adminRanksRouter.get("/", async (req, res) => {
  await ensureSeeded();
  const tiers = await db
    .select()
    .from(rankTiersTable)
    .orderBy(rankTiersTable.displayOrder);

  const tiersWithCounts = await Promise.all(
    tiers.map(async (tier, idx) => {
      const nextMinElo = tiers[idx + 1]?.minElo;
      const condition = nextMinElo !== undefined
        ? and(gte(playersTable.eloRating, tier.minElo), lt(playersTable.eloRating, nextMinElo))
        : gte(playersTable.eloRating, tier.minElo);
      const rows = await db.select().from(playersTable).where(condition);
      return { ...tier, playerCount: rows.length };
    }),
  );

  res.json(tiersWithCounts);
});

adminRanksRouter.post("/", async (req, res) => {
  const { title, emoji, minElo, displayOrder } = req.body as {
    title: string; emoji: string; minElo: number; displayOrder: number;
  };
  const [created] = await db
    .insert(rankTiersTable)
    .values({ id: nanoid(8), title, emoji, minElo, displayOrder })
    .returning();
  res.status(201).json(created);
});

adminRanksRouter.patch("/:rankId", async (req, res) => {
  const { rankId } = req.params;
  const { title, emoji, minElo, displayOrder } = req.body as Record<string, unknown>;

  const updates: Record<string, unknown> = {};
  if (title !== undefined) updates.title = title;
  if (emoji !== undefined) updates.emoji = emoji;
  if (minElo !== undefined) updates.minElo = Number(minElo);
  if (displayOrder !== undefined) updates.displayOrder = Number(displayOrder);

  const [updated] = await db
    .update(rankTiersTable)
    .set(updates)
    .where(eq(rankTiersTable.id, rankId))
    .returning();

  if (!updated) { res.status(404).json({ error: "Rank not found" }); return; }
  res.json(updated);
});

adminRanksRouter.delete("/:rankId", async (req, res) => {
  const { rankId } = req.params;
  const [deleted] = await db
    .delete(rankTiersTable)
    .where(eq(rankTiersTable.id, rankId))
    .returning();
  if (!deleted) { res.status(404).json({ error: "Rank not found" }); return; }
  res.json({ ok: true });
});
