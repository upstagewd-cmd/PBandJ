import { Router } from "express";
import { db } from "@workspace/db";
import {
  playersTable,
  matchesTable,
  openPlayMatchesTable,
  playerBadgesTable,
} from "@workspace/db/schema";
import { eq, or, sql } from "drizzle-orm";
import { getRank } from "../../lib/ranks.js";

export const adminPlayersRouter = Router();

adminPlayersRouter.get("/", async (req, res) => {
  const players = await db
    .select()
    .from(playersTable)
    .orderBy(playersTable.joinedAt);

  const withRank = players.map((p) => ({
    ...p,
    rank: getRank(p.eloRating),
  }));
  res.json(withRank);
});

adminPlayersRouter.patch("/:playerId", async (req, res) => {
  const { playerId } = req.params;
  const { firstName, lastName, partnerName, teamName, eloRating, avatarUrl } =
    req.body as Record<string, unknown>;

  const updates: Record<string, unknown> = {};
  if (firstName !== undefined) updates.firstName = firstName;
  if (lastName !== undefined) updates.lastName = lastName;
  if (partnerName !== undefined) updates.partnerName = partnerName;
  if (teamName !== undefined) updates.teamName = teamName;
  if (avatarUrl !== undefined) updates.avatarUrl = avatarUrl;
  if (eloRating !== undefined) updates.eloRating = Number(eloRating);

  const [updated] = await db
    .update(playersTable)
    .set(updates)
    .where(eq(playersTable.id, playerId))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Player not found" });
    return;
  }
  res.json({ ...updated, rank: getRank(updated.eloRating) });
});

adminPlayersRouter.delete("/:playerId", async (req, res) => {
  const { playerId } = req.params;
  await db.delete(playerBadgesTable).where(eq(playerBadgesTable.playerId, playerId));
  const [deleted] = await db
    .delete(playersTable)
    .where(eq(playersTable.id, playerId))
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "Player not found" });
    return;
  }
  res.json({ ok: true });
});

adminPlayersRouter.post("/merge", async (req, res) => {
  const { keepId, mergeId } = req.body as { keepId: string; mergeId: string };
  if (!keepId || !mergeId || keepId === mergeId) {
    res.status(400).json({ error: "Provide distinct keepId and mergeId" });
    return;
  }

  await db
    .update(matchesTable)
    .set({ playerOneId: keepId })
    .where(eq(matchesTable.playerOneId, mergeId));
  await db
    .update(matchesTable)
    .set({ playerTwoId: keepId })
    .where(eq(matchesTable.playerTwoId, mergeId));
  await db
    .update(matchesTable)
    .set({ winnerId: keepId })
    .where(eq(matchesTable.winnerId, mergeId));

  await db
    .update(openPlayMatchesTable)
    .set({ teamOnePOneId: keepId })
    .where(eq(openPlayMatchesTable.teamOnePOneId, mergeId));
  await db
    .update(openPlayMatchesTable)
    .set({ teamOnePTwoId: keepId })
    .where(eq(openPlayMatchesTable.teamOnePTwoId, mergeId));
  await db
    .update(openPlayMatchesTable)
    .set({ teamTwoPOneId: keepId })
    .where(eq(openPlayMatchesTable.teamTwoPOneId, mergeId));
  await db
    .update(openPlayMatchesTable)
    .set({ teamTwoPTwoId: keepId })
    .where(eq(openPlayMatchesTable.teamTwoPTwoId, mergeId));

  await db.delete(playerBadgesTable).where(eq(playerBadgesTable.playerId, mergeId));
  await db.delete(playersTable).where(eq(playersTable.id, mergeId));

  res.json({ ok: true });
});

adminPlayersRouter.get("/:playerId/matches", async (req, res) => {
  const { playerId } = req.params;
  const bracketMatches = await db
    .select()
    .from(matchesTable)
    .where(
      or(
        eq(matchesTable.playerOneId, playerId),
        eq(matchesTable.playerTwoId, playerId),
      ),
    )
    .orderBy(sql`${matchesTable.completedAt} desc nulls last`);

  const openMatches = await db
    .select()
    .from(openPlayMatchesTable)
    .where(
      or(
        eq(openPlayMatchesTable.teamOnePOneId, playerId),
        eq(openPlayMatchesTable.teamOnePTwoId, playerId),
        eq(openPlayMatchesTable.teamTwoPOneId, playerId),
        eq(openPlayMatchesTable.teamTwoPTwoId, playerId),
      ),
    )
    .orderBy(sql`${openPlayMatchesTable.playedAt} desc`);

  res.json({ bracketMatches, openMatches });
});
