import { Router, Request } from "express";
import { randomUUID } from "crypto";
import { db, tournamentsTable, playersTable, openPlayPoolTable, openPlayMatchesTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { LogOpenPlayMatchBody } from "@workspace/api-zod";
import { computeElo } from "../lib/elo";
import { getRank } from "../lib/ranks";
import { broadcastTournamentUpdate } from "../lib/ws";
import { getTournamentFull } from "../lib/tournament-helpers";

export const openPlayRouter = Router({ mergeParams: true });

async function serializePlayer(p: typeof playersTable.$inferSelect) {
  const rank = await getRank(p.eloRating ?? 1200);
  return {
    id: p.id,
    tournamentId: p.tournamentId,
    firstName: p.firstName,
    lastName: p.lastName,
    partnerName: p.partnerName ?? null,
    teamName: p.teamName ?? null,
    avatarUrl: p.avatarUrl ?? null,
    eloRating: p.eloRating ?? 1200,
    rankTitle: rank.title,
    rankEmoji: rank.emoji,
    seed: p.seed,
    joinedAt: p.joinedAt.toISOString(),
  };
}

async function getOpenPlayState(tournamentId: string) {
  const pool = await db
    .select()
    .from(openPlayPoolTable)
    .where(and(eq(openPlayPoolTable.tournamentId, tournamentId), eq(openPlayPoolTable.status, "available")));

  const playerIds = [...new Set(pool.map((e) => e.playerId))];
  const players = playerIds.length
    ? await db.select().from(playersTable).where(inArray(playersTable.id, playerIds))
    : [];
  const playerMap = new Map(players.map((p) => [p.id, p]));

  const recentMatchRows = await db
    .select()
    .from(openPlayMatchesTable)
    .where(eq(openPlayMatchesTable.tournamentId, tournamentId));

  const allPlayerIds = new Set<string>();
  recentMatchRows.forEach((m) => {
    [m.teamOnePOneId, m.teamOnePTwoId, m.teamTwoPOneId, m.teamTwoPTwoId]
      .filter(Boolean)
      .forEach((id) => allPlayerIds.add(id!));
  });
  const allPlayers = allPlayerIds.size
    ? await db.select().from(playersTable).where(inArray(playersTable.id, [...allPlayerIds]))
    : [];
  const allPlayerMap = new Map(allPlayers.map((p) => [p.id, p]));

  const recentMatches = await Promise.all(recentMatchRows
    .sort((a, b) => b.playedAt.getTime() - a.playedAt.getTime())
    .slice(0, 10)
    .map(async (m) => ({
      id: m.id,
      winnerTeam: m.winnerTeam,
      scoreOne: m.scoreOne,
      scoreTwo: m.scoreTwo,
      teamOnePlayers: await Promise.all([m.teamOnePOneId, m.teamOnePTwoId]
        .filter(Boolean)
        .map((id) => allPlayerMap.get(id!))
        .filter(Boolean)
        .map((player) => serializePlayer(player!))),
      teamTwoPlayers: await Promise.all([m.teamTwoPOneId, m.teamTwoPTwoId]
        .filter(Boolean)
        .map((id) => allPlayerMap.get(id!))
        .filter(Boolean)
        .map((player) => serializePlayer(player!))),
      playedAt: m.playedAt.toISOString(),
    })));

  return {
    pool: await Promise.all(pool
      .map(async (e) => {
        const p = playerMap.get(e.playerId);
        if (!p) return null;
        return { ...(await serializePlayer(p)), partnerId: e.partnerId ?? null };
      })
      .filter(Boolean)),
    recentMatches,
  };
}

// GET /api/tournaments/:tournamentId/open-play
openPlayRouter.get("/", async (req: Request<{ tournamentId: string }>, res) => {
  try {
    const { tournamentId } = req.params;
    const state = await getOpenPlayState(tournamentId);
    res.json(state);
  } catch (err) {
    req.log.error({ err }, "Failed to get open play pool");
    res.status(500).json({ error: "Failed to get open play pool" });
  }
});

// POST /api/tournaments/:tournamentId/open-play/matches
openPlayRouter.post("/matches", async (req: Request<{ tournamentId: string }>, res) => {
  try {
    const body = LogOpenPlayMatchBody.parse(req.body);
    const { tournamentId } = req.params;

    const [tournament] = await db.select().from(tournamentsTable).where(eq(tournamentsTable.id, tournamentId));
    if (!tournament) { res.status(404).json({ error: "Tournament not found" }); return; }
    if (body.hostToken !== tournament.hostToken) { res.status(403).json({ error: "Invalid host token" }); return; }

    // Record the match
    const matchId = randomUUID();
    await db.insert(openPlayMatchesTable).values({
      id: matchId,
      tournamentId,
      teamOnePOneId: body.teamOnePOneId,
      teamOnePTwoId: body.teamOnePTwoId ?? null,
      teamTwoPOneId: body.teamTwoPOneId,
      teamTwoPTwoId: body.teamTwoPTwoId ?? null,
      winnerTeam: body.winnerTeam,
      scoreOne: body.scoreOne ?? null,
      scoreTwo: body.scoreTwo ?? null,
    });

    // Update ELO for all participants
    const teamOneIds = [body.teamOnePOneId, body.teamOnePTwoId].filter(Boolean) as string[];
    const teamTwoIds = [body.teamTwoPOneId, body.teamTwoPTwoId].filter(Boolean) as string[];
    const allIds = [...teamOneIds, ...teamTwoIds];

    const players = await db.select().from(playersTable).where(inArray(playersTable.id, allIds));
    const playerMap = new Map(players.map((p) => [p.id, p]));

    const teamOneAvg = teamOneIds.reduce((s, id) => s + (playerMap.get(id)?.eloRating ?? 1200), 0) / teamOneIds.length;
    const teamTwoAvg = teamTwoIds.reduce((s, id) => s + (playerMap.get(id)?.eloRating ?? 1200), 0) / teamTwoIds.length;

    const winnerIds = body.winnerTeam === 1 ? teamOneIds : teamTwoIds;
    const loserIds = body.winnerTeam === 1 ? teamTwoIds : teamOneIds;
    const winnerAvg = body.winnerTeam === 1 ? teamOneAvg : teamTwoAvg;
    const loserAvg = body.winnerTeam === 1 ? teamTwoAvg : teamOneAvg;

    const { winnerDelta, loserDelta } = computeElo(winnerAvg, loserAvg);

    for (const id of winnerIds) {
      const p = playerMap.get(id);
      if (p) {
        await db.update(playersTable).set({ eloRating: (p.eloRating ?? 1200) + winnerDelta }).where(eq(playersTable.id, id));
      }
    }
    for (const id of loserIds) {
      const p = playerMap.get(id);
      if (p) {
        await db.update(playersTable).set({ eloRating: Math.max(800, (p.eloRating ?? 1200) + loserDelta) }).where(eq(playersTable.id, id));
      }
    }

    const state = await getOpenPlayState(tournamentId);
    res.status(201).json(state);
  } catch (err) {
    req.log.error({ err }, "Failed to log open play match");
    res.status(500).json({ error: "Failed to log open play match" });
  }
});
