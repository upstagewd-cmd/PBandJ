import { Router, Request } from "express";
import { randomUUID } from "crypto";
import { db, tournamentsTable, playersTable, openPlayPoolTable, openPlayMatchesTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { LogOpenPlayMatchBody } from "@workspace/api-zod";
import { computeElo } from "../lib/elo";
import { getRank } from "../lib/ranks";
import { broadcastBadgeUnlocked, broadcastTournamentUpdate } from "../lib/ws";
import { getTournamentFull } from "../lib/tournament-helpers";
import { getNicknameMap, getClerkImageMap } from "../lib/user-display";
import { autoAwardBadgesForPlayers } from "../lib/badge-awards";
import { getEloKFactor, getStartingEloForSkill } from "../lib/settings";

export const openPlayRouter = Router({ mergeParams: true });

async function serializePlayer(
  p: typeof playersTable.$inferSelect,
  nickname?: string | null,
  clerkImageUrl?: string | null
) {
  const rank = await getRank(p.eloRating ?? 1200);
  return {
    id: p.id,
    tournamentId: p.tournamentId,
    firstName: p.firstName,
    lastName: p.lastName,
    clerkUserId: p.clerkUserId ?? null,
    nickname: nickname ?? null,
    partnerName: p.partnerName ?? null,
    teamName: p.teamName ?? null,
    avatarUrl: p.avatarUrl ?? clerkImageUrl ?? null,
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
  const nicknameMap = await getNicknameMap(players.map((player) => player.clerkUserId));
  const clerkImageMap = await getClerkImageMap(players.map((player) => player.clerkUserId));
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
  const allPlayerImageMap = await getClerkImageMap(allPlayers.map((player) => player.clerkUserId));
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
        .map((player) => serializePlayer(
          player!,
          nicknameMap.get(player!.clerkUserId ?? "") ?? null,
          allPlayerImageMap.get(player!.clerkUserId ?? "") ?? null
        ))),
      teamTwoPlayers: await Promise.all([m.teamTwoPOneId, m.teamTwoPTwoId]
        .filter(Boolean)
        .map((id) => allPlayerMap.get(id!))
        .filter(Boolean)
        .map((player) => serializePlayer(
          player!,
          nicknameMap.get(player!.clerkUserId ?? "") ?? null,
          allPlayerImageMap.get(player!.clerkUserId ?? "") ?? null
        ))),
      playedAt: m.playedAt.toISOString(),
    })));

  return {
    pool: await Promise.all(pool
      .map(async (e) => {
        const p = playerMap.get(e.playerId);
        if (!p) return null;
        return {
          ...(await serializePlayer(
            p,
            nicknameMap.get(p.clerkUserId ?? "") ?? null,
            clerkImageMap.get(p.clerkUserId ?? "") ?? null
          )),
          partnerId: e.partnerId ?? null,
        };
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

// POST /api/tournaments/:tournamentId/open-play/players
openPlayRouter.post("/players", async (req: Request<{ tournamentId: string }>, res) => {
  try {
    const body = req.body as {
      hostToken?: string;
      firstName?: string;
      lastName?: string;
      teamName?: string | null;
      skillLevel?: string | null;
      clerkUserId?: string | null;
    };

    if (!body.hostToken || !body.firstName?.trim() || !body.lastName?.trim()) {
      res.status(400).json({ error: "Invalid player payload" });
      return;
    }

    const { tournamentId } = req.params;

    const [tournament] = await db.select().from(tournamentsTable).where(eq(tournamentsTable.id, tournamentId));
    if (!tournament) { res.status(404).json({ error: "Tournament not found" }); return; }
    if (body.hostToken !== tournament.hostToken) { res.status(403).json({ error: "Invalid host token" }); return; }

    const firstName = body.firstName.trim();
    const lastName = body.lastName.trim();
    const teamName = body.teamName?.trim() || null;
    if (teamName && teamName.length > 15) {
      res.status(400).json({ error: "nickname_too_long", message: "Nickname must be 15 characters or fewer." });
      return;
    }

    const clerkUserId = body.clerkUserId ?? null;
    if (clerkUserId) {
      const [existingPlayer] = await db
        .select({ id: playersTable.id })
        .from(playersTable)
        .where(and(eq(playersTable.tournamentId, tournamentId), eq(playersTable.clerkUserId, clerkUserId)));
      if (existingPlayer) { res.status(409).json({ error: "already_added" }); return; }
    }
    const seedCount = await db.select().from(playersTable).where(eq(playersTable.tournamentId, tournamentId));
    const startingElo = clerkUserId
      ? await db.select({ eloRating: playersTable.eloRating }).from(playersTable).where(eq(playersTable.clerkUserId, clerkUserId)).then((rows) => {
          if (rows.length === 0) return getStartingEloForSkill(body.skillLevel ?? null);
          return Math.round(rows.reduce((sum, row) => sum + (row.eloRating ?? 1200), 0) / rows.length);
        })
      : await getStartingEloForSkill(body.skillLevel ?? null);

    const id = randomUUID();
    await db.insert(playersTable).values({
      id,
      tournamentId,
      firstName,
      lastName,
      partnerName: null,
      teamName,
      playerToken: randomUUID(),
      avatarUrl: null,
      clerkUserId,
      skillLevel: body.skillLevel ?? null,
      eloRating: startingElo,
      seed: seedCount.length + 1,
    });

    await db.insert(openPlayPoolTable).values({
      id: randomUUID(),
      tournamentId,
      playerId: id,
      partnerId: null,
      status: "available",
    });

    const state = await getOpenPlayState(tournamentId);
    res.status(201).json(state);
  } catch (err) {
    req.log.error({ err }, "Failed to add player to open play pool");
    res.status(500).json({ error: "Failed to add player" });
  }
});

// PATCH /api/tournaments/:tournamentId/open-play/pair
openPlayRouter.patch("/pair", async (req: Request<{ tournamentId: string }>, res) => {
  try {
    const body = req.body as { hostToken?: string; player1Id?: string; player2Id?: string };
    if (!body.hostToken || !body.player1Id || !body.player2Id) {
      res.status(400).json({ error: "Invalid pair payload" });
      return;
    }
    const { tournamentId } = req.params;

    const [tournament] = await db.select().from(tournamentsTable).where(eq(tournamentsTable.id, tournamentId));
    if (!tournament) { res.status(404).json({ error: "Tournament not found" }); return; }
    if (body.hostToken !== tournament.hostToken) { res.status(403).json({ error: "Invalid host token" }); return; }

    const [p1] = await db.select().from(openPlayPoolTable).where(and(eq(openPlayPoolTable.tournamentId, tournamentId), eq(openPlayPoolTable.playerId, body.player1Id)));
    const [p2] = await db.select().from(openPlayPoolTable).where(and(eq(openPlayPoolTable.tournamentId, tournamentId), eq(openPlayPoolTable.playerId, body.player2Id)));
    if (!p1 || !p2) { res.status(404).json({ error: "Player not found in open play pool" }); return; }

    if (p1.partnerId) {
      await db.update(openPlayPoolTable)
        .set({ partnerId: null })
        .where(and(eq(openPlayPoolTable.tournamentId, tournamentId), eq(openPlayPoolTable.playerId, p1.partnerId)));
    }
    if (p2.partnerId) {
      await db.update(openPlayPoolTable)
        .set({ partnerId: null })
        .where(and(eq(openPlayPoolTable.tournamentId, tournamentId), eq(openPlayPoolTable.playerId, p2.partnerId)));
    }

    await db.update(openPlayPoolTable)
      .set({ partnerId: body.player2Id })
      .where(and(eq(openPlayPoolTable.tournamentId, tournamentId), eq(openPlayPoolTable.playerId, body.player1Id)));
    await db.update(openPlayPoolTable)
      .set({ partnerId: body.player1Id })
      .where(and(eq(openPlayPoolTable.tournamentId, tournamentId), eq(openPlayPoolTable.playerId, body.player2Id)));

    const state = await getOpenPlayState(tournamentId);
    res.json(state);
  } catch (err) {
    req.log.error({ err }, "Failed to pair open play players");
    res.status(500).json({ error: "Failed to pair players" });
  }
});

// DELETE /api/tournaments/:tournamentId/open-play/pair
openPlayRouter.delete("/pair", async (req: Request<{ tournamentId: string }>, res) => {
  try {
    const body = req.body as { hostToken?: string; playerId?: string };
    if (!body.hostToken || !body.playerId) {
      res.status(400).json({ error: "Invalid unpair payload" });
      return;
    }
    const { tournamentId } = req.params;

    const [tournament] = await db.select().from(tournamentsTable).where(eq(tournamentsTable.id, tournamentId));
    if (!tournament) { res.status(404).json({ error: "Tournament not found" }); return; }
    if (body.hostToken !== tournament.hostToken) { res.status(403).json({ error: "Invalid host token" }); return; }

    const [player] = await db.select().from(openPlayPoolTable).where(and(eq(openPlayPoolTable.tournamentId, tournamentId), eq(openPlayPoolTable.playerId, body.playerId)));
    if (!player) { res.status(404).json({ error: "Player not found in open play pool" }); return; }

    if (player.partnerId) {
      await db.update(openPlayPoolTable)
        .set({ partnerId: null })
        .where(and(eq(openPlayPoolTable.tournamentId, tournamentId), eq(openPlayPoolTable.playerId, player.partnerId)));
    }
    await db.update(openPlayPoolTable)
      .set({ partnerId: null })
      .where(and(eq(openPlayPoolTable.tournamentId, tournamentId), eq(openPlayPoolTable.playerId, body.playerId)));

    const state = await getOpenPlayState(tournamentId);
    res.json(state);
  } catch (err) {
    req.log.error({ err }, "Failed to unpair open play player");
    res.status(500).json({ error: "Failed to unpair player" });
  }
});

// POST /api/tournaments/:tournamentId/open-play/auto-pair
openPlayRouter.post("/auto-pair", async (req: Request<{ tournamentId: string }>, res) => {
  try {
    const body = req.body as { hostToken?: string };
    if (!body.hostToken) {
      res.status(400).json({ error: "Missing host token" });
      return;
    }
    const { tournamentId } = req.params;

    const [tournament] = await db.select().from(tournamentsTable).where(eq(tournamentsTable.id, tournamentId));
    if (!tournament) { res.status(404).json({ error: "Tournament not found" }); return; }
    if (body.hostToken !== tournament.hostToken) { res.status(403).json({ error: "Invalid host token" }); return; }

    await db.update(openPlayPoolTable).set({ partnerId: null }).where(eq(openPlayPoolTable.tournamentId, tournamentId));

    const players = await db.select().from(openPlayPoolTable).where(and(eq(openPlayPoolTable.tournamentId, tournamentId), eq(openPlayPoolTable.status, "available")));
    const playerIds = [...new Set(players.map((entry) => entry.playerId))];
    const playerMap = new Map<string, typeof playersTable.$inferSelect>();
    if (playerIds.length) {
      const rows = await db.select().from(playersTable).where(inArray(playersTable.id, playerIds));
      rows.forEach((row) => playerMap.set(row.id, row));
    }

    const sorted = [...players].sort((a, b) => {
      const aRating = playerMap.get(a.playerId)?.eloRating ?? 1200;
      const bRating = playerMap.get(b.playerId)?.eloRating ?? 1200;
      return bRating - aRating;
    });

    const numPairs = Math.floor(sorted.length / 2);
    for (let i = 0; i < numPairs; i++) {
      const p1 = sorted[i];
      const p2 = sorted[sorted.length - 1 - i];
      await db.update(openPlayPoolTable)
        .set({ partnerId: p2.playerId })
        .where(and(eq(openPlayPoolTable.tournamentId, tournamentId), eq(openPlayPoolTable.playerId, p1.playerId)));
      await db.update(openPlayPoolTable)
        .set({ partnerId: p1.playerId })
        .where(and(eq(openPlayPoolTable.tournamentId, tournamentId), eq(openPlayPoolTable.playerId, p2.playerId)));
    }

    const state = await getOpenPlayState(tournamentId);
    res.json(state);
  } catch (err) {
    req.log.error({ err }, "Failed to auto-pair open play pool");
    res.status(500).json({ error: "Failed to auto-pair players" });
  }
});

// POST /api/tournaments/:tournamentId/open-play/matches
openPlayRouter.post("/matches", async (req: Request<{ tournamentId: string }>, res) => {
  try {
    const body = LogOpenPlayMatchBody.parse(req.body);
    const { tournamentId } = req.params;
    const kFactor = await getEloKFactor();

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

    const { winnerDelta, loserDelta } = computeElo(winnerAvg, loserAvg, kFactor);

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

    const awards = await autoAwardBadgesForPlayers(allIds);
    broadcastBadgeUnlocked(tournamentId, awards);

    const state = await getOpenPlayState(tournamentId);
    res.status(201).json(state);
  } catch (err) {
    req.log.error({ err }, "Failed to log open play match");
    res.status(500).json({ error: "Failed to log open play match" });
  }
});
