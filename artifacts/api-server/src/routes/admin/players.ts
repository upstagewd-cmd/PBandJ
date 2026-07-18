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
import { isNicknameTakenGlobal } from "../../lib/user-display.js";

export const adminPlayersRouter = Router();

adminPlayersRouter.get("/", async (req, res) => {
  const players = await db
    .select()
    .from(playersTable)
    .orderBy(playersTable.joinedAt);

  const withRank = await Promise.all(players.map(async (p) => ({
    ...p,
    rank: await getRank(p.eloRating),
  })));
  res.json(withRank);
});

adminPlayersRouter.patch("/:playerId", async (req, res) => {
  const { playerId } = req.params;
  const { firstName, lastName, partnerName, teamName, eloRating, avatarUrl, skillLevel } =
    req.body as Record<string, unknown>;

  const [existing] = await db
    .select()
    .from(playersTable)
    .where(eq(playersTable.id, playerId));
  if (!existing) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  const updates: Record<string, unknown> = {};
  if (firstName !== undefined) {
    if (typeof firstName !== "string" || !firstName.trim()) {
      res.status(400).json({ error: "firstName must be a non-empty string" });
      return;
    }
    updates.firstName = firstName.trim();
  }

  if (lastName !== undefined) {
    if (typeof lastName !== "string" || !lastName.trim()) {
      res.status(400).json({ error: "lastName must be a non-empty string" });
      return;
    }
    updates.lastName = lastName.trim();
  }

  if (partnerName !== undefined) {
    updates.partnerName = typeof partnerName === "string" ? (partnerName.trim() || null) : null;
  }

  if (teamName !== undefined) {
    if (teamName !== null && typeof teamName !== "string") {
      res.status(400).json({ error: "teamName must be a string or null" });
      return;
    }

    const normalizedTeamName = typeof teamName === "string" ? teamName.trim() : "";
    if (normalizedTeamName) {
      const taken = await isNicknameTakenGlobal(normalizedTeamName, {
        excludeClerkUserId: existing.clerkUserId ?? null,
        excludePlayerId: existing.id,
      });
      if (taken) {
        res.status(409).json({ error: "nickname_taken", message: "That nickname is already taken. Try another one." });
        return;
      }
    }

    updates.teamName = normalizedTeamName || null;
  }

  if (avatarUrl !== undefined) {
    if (avatarUrl !== null && typeof avatarUrl !== "string") {
      res.status(400).json({ error: "avatarUrl must be a string or null" });
      return;
    }
    updates.avatarUrl = typeof avatarUrl === "string" ? (avatarUrl.trim() || null) : null;
  }

  if (eloRating !== undefined) {
    const parsed = Number(eloRating);
    if (!Number.isFinite(parsed)) {
      res.status(400).json({ error: "eloRating must be a valid number" });
      return;
    }
    updates.eloRating = parsed;
  }

  if (skillLevel !== undefined) updates.skillLevel = skillLevel;

  if (Object.keys(updates).length === 0) {
    res.json({ ...existing, rank: await getRank(existing.eloRating) });
    return;
  }

  const [updated] = await db
    .update(playersTable)
    .set(updates)
    .where(eq(playersTable.id, playerId))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  // Keep avatar consistent across all rows for the same signed-in user identity.
  if (avatarUrl !== undefined && updated.clerkUserId) {
    await db
      .update(playersTable)
      .set({ avatarUrl: updated.avatarUrl ?? null })
      .where(eq(playersTable.clerkUserId, updated.clerkUserId));
  }

  res.json({ ...updated, rank: await getRank(updated.eloRating) });
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
