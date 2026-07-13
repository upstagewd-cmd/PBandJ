import { Router, Request } from "express";
import { db, playersTable, matchesTable, tournamentsTable } from "@workspace/db";
import { playerBadgesTable, badgesTable } from "@workspace/db/schema";
import { eq, or, and, desc } from "drizzle-orm";
import { getRank } from "../lib/ranks";

export const playerStatsRouter = Router();

// GET /api/players/known — all players, deduplicated by clerkUserId (signed-in) or full name (guests)
playerStatsRouter.get("/known", async (_req, res) => {
  try {
    const allPlayers = await db
      .select()
      .from(playersTable)
      .orderBy(desc(playersTable.joinedAt));

    const seenClerk = new Set<string>();
    const seenName = new Set<string>();
    const known = allPlayers.filter((p) => {
      if (p.clerkUserId) {
        if (seenClerk.has(p.clerkUserId)) return false;
        seenClerk.add(p.clerkUserId);
        return true;
      }
      const nameKey = `${p.firstName.toLowerCase()} ${p.lastName.toLowerCase()}`;
      if (seenName.has(nameKey)) return false;
      seenName.add(nameKey);
      return true;
    });

    res.json(
      known.map((p) => ({
        id: p.id,
        clerkUserId: p.clerkUserId ?? null,
        firstName: p.firstName,
        lastName: p.lastName,
        avatarUrl: p.avatarUrl ?? null,
        eloRating: p.eloRating ?? 1200,
      }))
    );
  } catch (err) {
    _req.log.error({ err }, "Failed to get known players");
    res.status(500).json({ error: "Failed to get known players" });
  }
});

playerStatsRouter.get("/", async (_req, res) => {
  try {
    const allPlayers = await db
      .select()
      .from(playersTable)
      .orderBy(desc(playersTable.eloRating));

    const summaries = await Promise.all(
      allPlayers.map(async (player) => {
        const allMatches = await db
          .select()
          .from(matchesTable)
          .where(or(eq(matchesTable.playerOneId, player.id), eq(matchesTable.playerTwoId, player.id)));

        const completedMatches = allMatches.filter((m) => m.status === "completed" && !m.isBye);
        const wins = completedMatches.filter((m) => m.winnerId === player.id).length;
        const losses = completedMatches.length - wins;
        const winPct = completedMatches.length > 0 ? Math.round((wins / completedMatches.length) * 100) : 0;

        const badgeRows = await db
          .select({ badge: badgesTable })
          .from(playerBadgesTable)
          .innerJoin(badgesTable, eq(playerBadgesTable.badgeId, badgesTable.id))
          .where(and(eq(playerBadgesTable.playerId, player.id), eq(badgesTable.enabled, true)));

        const rank = getRank(player.eloRating ?? 1200);

        return {
          id: player.id,
          firstName: player.firstName,
          lastName: player.lastName,
          teamName: player.teamName ?? null,
          avatarUrl: player.avatarUrl ?? null,
          eloRating: player.eloRating ?? 1200,
          rankTitle: rank.title,
          rankEmoji: rank.emoji,
          skillLevel: player.skillLevel ?? null,
          wins,
          losses,
          matchesPlayed: completedMatches.length,
          winPct,
          badgeCount: badgeRows.length,
          joinedAt: player.joinedAt.toISOString(),
        };
      })
    );

    res.json(summaries);
  } catch (err) {
    _req.log.error({ err }, "Failed to get players list");
    res.status(500).json({ error: "Failed to get players list" });
  }
});

playerStatsRouter.get("/:playerId", async (req: Request<{ playerId: string }>, res) => {
  try {
    const { playerId } = req.params;

    const [player] = await db.select().from(playersTable).where(eq(playersTable.id, playerId));
    if (!player) { res.status(404).json({ error: "Player not found" }); return; }

    const allMatches = await db
      .select()
      .from(matchesTable)
      .where(or(eq(matchesTable.playerOneId, playerId), eq(matchesTable.playerTwoId, playerId)));

    const completedMatches = allMatches.filter((m) => m.status === "completed" && !m.isBye);
    const wins = completedMatches.filter((m) => m.winnerId === playerId).length;
    const losses = completedMatches.length - wins;
    const winPct = completedMatches.length > 0 ? Math.round((wins / completedMatches.length) * 100) : 0;

    const tournamentWins = completedMatches.filter(
      (m) => m.winnerId === playerId && (m.bracket === "grand_finals" || m.bracket === "grand_finals_reset")
    ).length;

    const recentCompleted = completedMatches
      .filter((m) => m.completedAt)
      .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime())
      .slice(0, 20);

    const tournamentIds = [...new Set(recentCompleted.map((m) => m.tournamentId))];
    const opponentIds = recentCompleted.map((m) =>
      m.playerOneId === playerId ? m.playerTwoId : m.playerOneId
    ).filter(Boolean) as string[];

    const [tournaments, opponentPlayers, badgeRows] = await Promise.all([
      tournamentIds.length
        ? db.select().from(tournamentsTable).where(
            tournamentIds.length === 1
              ? eq(tournamentsTable.id, tournamentIds[0])
              : or(...tournamentIds.map((id) => eq(tournamentsTable.id, id)))
          )
        : Promise.resolve([]),
      opponentIds.length
        ? db.select().from(playersTable).where(
            opponentIds.length === 1
              ? eq(playersTable.id, opponentIds[0])
              : or(...opponentIds.map((id) => eq(playersTable.id, id)))
          )
        : Promise.resolve([]),
      db
        .select({ badge: badgesTable })
        .from(playerBadgesTable)
        .innerJoin(badgesTable, eq(playerBadgesTable.badgeId, badgesTable.id))
        .where(and(eq(playerBadgesTable.playerId, playerId), eq(badgesTable.enabled, true))),
    ]);

    const tourneyMap = new Map(tournaments.map((t) => [t.id, t]));
    const oppMap = new Map<string, { firstName: string; lastName: string; teamName: string | null }>(
      opponentPlayers.map((p: any) => [p.id, p])
    );

    const recentMatchesResult = recentCompleted.map((m) => {
      const opp = oppMap.get(m.playerOneId === playerId ? (m.playerTwoId ?? "") : (m.playerOneId ?? ""));
      const tourney = tourneyMap.get(m.tournamentId);
      return {
        matchId: m.id,
        tournamentId: m.tournamentId,
        tournamentName: tourney?.name ?? "Unknown",
        bracket: m.bracket,
        round: m.round,
        opponentName: opp ? `${opp.teamName ?? `${opp.firstName} ${opp.lastName}`}` : "Unknown",
        won: m.winnerId === playerId,
        scoreOne: m.scoreOne ?? null,
        scoreTwo: m.scoreTwo ?? null,
        completedAt: m.completedAt ? new Date(m.completedAt).toISOString() : new Date().toISOString(),
      };
    });

    const rank = getRank(player.eloRating ?? 1200);

    res.json({
      player: {
        id: player.id,
        tournamentId: player.tournamentId,
        firstName: player.firstName,
        lastName: player.lastName,
        partnerName: player.partnerName ?? null,
        teamName: player.teamName ?? null,
        avatarUrl: player.avatarUrl ?? null,
        eloRating: player.eloRating ?? 1200,
        rankTitle: rank.title,
        rankEmoji: rank.emoji,
        seed: player.seed,
        joinedAt: player.joinedAt.toISOString(),
      },
      wins,
      losses,
      matchesPlayed: completedMatches.length,
      winPct,
      tournamentWins,
      recentMatches: recentMatchesResult,
      badges: badgeRows.map((r: any) => ({
        id: r.badge.id,
        name: r.badge.name,
        icon: r.badge.icon,
        description: r.badge.description,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get player stats");
    res.status(500).json({ error: "Failed to get player stats" });
  }
});
