import { Router } from "express";
import { db } from "@workspace/db";
import {
  playersTable,
  matchesTable,
  openPlayMatchesTable,
  playerBadgesTable,
  tournamentsTable,
} from "@workspace/db/schema";
import { eq, or, sql } from "drizzle-orm";
import { getRank } from "../../lib/ranks.js";
import { isNicknameTakenGlobal } from "../../lib/user-display.js";
import { USER_REGISTRY_TOURNAMENT_ID } from "../../lib/player-bootstrap.js";

export const adminPlayersRouter = Router();

adminPlayersRouter.get("/", async (req, res) => {
  const [players, tournaments, bracketMatches, openPlayMatches, badgeRows] = await Promise.all([
    db.select().from(playersTable).orderBy(sql`${playersTable.joinedAt} desc`),
    db.select({ id: tournamentsTable.id, name: tournamentsTable.name }).from(tournamentsTable),
    db.select().from(matchesTable),
    db.select().from(openPlayMatchesTable),
    db.select({ playerId: playerBadgesTable.playerId }).from(playerBadgesTable),
  ]);

  const tournamentNames = new Map(tournaments.map((tournament) => [tournament.id, tournament.name]));
  const badgeCounts = new Map<string, number>();
  for (const row of badgeRows) {
    badgeCounts.set(row.playerId, (badgeCounts.get(row.playerId) ?? 0) + 1);
  }

  const identityCounts = new Map<string, number>();
  for (const player of players) {
    const identityKey = player.clerkUserId
      ? `clerk:${player.clerkUserId}`
      : `guest:${player.firstName.trim().toLowerCase()} ${player.lastName.trim().toLowerCase()}`;
    identityCounts.set(identityKey, (identityCounts.get(identityKey) ?? 0) + 1);
  }

  const withRank = await Promise.all(players.map(async (p) => {
    const identityKey = p.clerkUserId
      ? `clerk:${p.clerkUserId}`
      : `guest:${p.firstName.trim().toLowerCase()} ${p.lastName.trim().toLowerCase()}`;

    const bracketMatchCount = bracketMatches.filter((match) =>
      match.playerOneId === p.id || match.playerTwoId === p.id || match.winnerId === p.id
    ).length;
    const openPlayMatchCount = openPlayMatches.filter((match) =>
      match.teamOnePOneId === p.id ||
      match.teamOnePTwoId === p.id ||
      match.teamTwoPOneId === p.id ||
      match.teamTwoPTwoId === p.id
    ).length;

    return {
    ...p,
    rank: await getRank(p.eloRating),
      metadata: {
        recordType: p.tournamentId === USER_REGISTRY_TOURNAMENT_ID ? "registry" : "tournament",
        tournamentName:
          p.tournamentId === USER_REGISTRY_TOURNAMENT_ID
            ? "User Registry"
            : (tournamentNames.get(p.tournamentId) ?? "Unknown tournament"),
        isSignedIn: !!p.clerkUserId,
        bracketMatchCount,
        openPlayMatchCount,
        badgeCount: badgeCounts.get(p.id) ?? 0,
        identityRecordCount: identityCounts.get(identityKey) ?? 1,
      },
    };
  }));
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
