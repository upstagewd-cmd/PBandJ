import { Router } from "express";
import { db } from "@workspace/db";
import {
  playersTable,
  matchesTable,
  openPlayMatchesTable,
} from "@workspace/db/schema";
import { eq, or, desc, inArray } from "drizzle-orm";
import { computeElo, INITIAL_ELO } from "../../lib/elo.js";
import { getRank } from "../../lib/ranks.js";
import { getSystemSettingNumber } from "../../lib/settings.js";

export const adminRatingsRouter = Router();

function getIdentityKey(player: {
  clerkUserId: string | null;
  firstName: string;
  lastName: string;
}) {
  if (player.clerkUserId) return `clerk:${player.clerkUserId}`;
  return `name:${player.firstName.trim().toLowerCase()} ${player.lastName.trim().toLowerCase()}`;
}

async function updateIdentityElo(playerId: string, eloRating: number) {
  const [target] = await db.select().from(playersTable).where(eq(playersTable.id, playerId));
  if (!target) return null;

  const allPlayers = await db.select().from(playersTable);
  const targetKey = getIdentityKey(target);
  const identityIds = allPlayers
    .filter((player) => getIdentityKey(player) === targetKey)
    .map((player) => player.id);

  if (identityIds.length > 0) {
    await db
      .update(playersTable)
      .set({ eloRating })
      .where(inArray(playersTable.id, identityIds));
  }

  const [updated] = await db.select().from(playersTable).where(eq(playersTable.id, playerId));
  return updated ?? null;
}

adminRatingsRouter.get("/", async (req, res) => {
  const players = await db
    .select()
    .from(playersTable)
    .orderBy(desc(playersTable.eloRating), desc(playersTable.joinedAt));

  const seen = new Set<string>();
  const uniquePlayers = players.filter((player) => {
    const key = getIdentityKey(player);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const ranked = await Promise.all(uniquePlayers.map(async (p) => ({
    ...p,
    rank: await getRank(p.eloRating),
  })));

  res.json(ranked);
});

adminRatingsRouter.patch("/:playerId", async (req, res) => {
  const { playerId } = req.params;
  const { eloRating } = req.body as { eloRating: number };

  if (typeof eloRating !== "number" || isNaN(eloRating)) {
    res.status(400).json({ error: "eloRating must be a number" });
    return;
  }

  const updated = await updateIdentityElo(playerId, eloRating);

  if (!updated) {
    res.status(404).json({ error: "Player not found" });
    return;
  }
  res.json({ ...updated, rank: await getRank(updated.eloRating) });
});

adminRatingsRouter.post("/reset/:playerId", async (req, res) => {
  const { playerId } = req.params;
  const initialElo = await getSystemSettingNumber("elo_initial", INITIAL_ELO);
  const updated = await updateIdentityElo(playerId, initialElo);

  if (!updated) {
    res.status(404).json({ error: "Player not found" });
    return;
  }
  res.json({ ...updated, rank: await getRank(updated.eloRating) });
});

adminRatingsRouter.post("/recalculate", async (req, res) => {
  const allPlayers = await db.select().from(playersTable);
  const allMatches = await db
    .select()
    .from(matchesTable)
    .orderBy(matchesTable.completedAt);
  const allOpenPlay = await db
    .select()
    .from(openPlayMatchesTable)
    .orderBy(openPlayMatchesTable.playedAt);

  const ratings = new Map<string, number>(
    allPlayers.map((p) => [p.id, INITIAL_ELO]),
  );

  for (const match of allMatches) {
    if (match.status !== "completed" || !match.winnerId || !match.playerOneId || !match.playerTwoId) continue;
    const loserId = match.winnerId === match.playerOneId ? match.playerTwoId : match.playerOneId;
    const winnerRating = ratings.get(match.winnerId) ?? INITIAL_ELO;
    const loserRating = ratings.get(loserId) ?? INITIAL_ELO;
    const { winnerDelta, loserDelta } = computeElo(winnerRating, loserRating);
    ratings.set(match.winnerId, Math.max(800, winnerRating + winnerDelta));
    ratings.set(loserId, Math.max(800, loserRating + loserDelta));
  }

  for (const match of allOpenPlay) {
    const team1 = [match.teamOnePOneId, match.teamOnePTwoId].filter(Boolean) as string[];
    const team2 = [match.teamTwoPOneId, match.teamTwoPTwoId].filter(Boolean) as string[];
    const avgT1 = team1.reduce((s, id) => s + (ratings.get(id) ?? INITIAL_ELO), 0) / team1.length;
    const avgT2 = team2.reduce((s, id) => s + (ratings.get(id) ?? INITIAL_ELO), 0) / team2.length;
    const winners = match.winnerTeam === 1 ? team1 : team2;
    const losers = match.winnerTeam === 1 ? team2 : team1;
    const winAvg = match.winnerTeam === 1 ? avgT1 : avgT2;
    const loseAvg = match.winnerTeam === 1 ? avgT2 : avgT1;
    const { winnerDelta, loserDelta } = computeElo(winAvg, loseAvg);
    for (const id of winners) ratings.set(id, Math.max(800, (ratings.get(id) ?? INITIAL_ELO) + winnerDelta));
    for (const id of losers) ratings.set(id, Math.max(800, (ratings.get(id) ?? INITIAL_ELO) + loserDelta));
  }

  for (const [playerId, eloRating] of ratings.entries()) {
    await db.update(playersTable).set({ eloRating }).where(eq(playersTable.id, playerId));
  }

  res.json({ ok: true, updated: ratings.size });
});
