import { Router, Request } from "express";
import { db, playersTable, matchesTable, tournamentsTable, teamsTable } from "@workspace/db";
import { playerBadgesTable, badgesTable } from "@workspace/db/schema";
import { eq, or, and, desc } from "drizzle-orm";
import { getRank } from "../lib/ranks";
import { getNicknameMap, getClerkImageMap } from "../lib/user-display";

export const playerStatsRouter = Router();

type DbPlayer = typeof playersTable.$inferSelect;
type DbTeam = typeof teamsTable.$inferSelect;
type DbMatch = typeof matchesTable.$inferSelect;

function getIdentityPlayers(allPlayers: DbPlayer[], player: DbPlayer): DbPlayer[] {
  if (!player.clerkUserId) return [player];
  return allPlayers.filter((p) => p.clerkUserId === player.clerkUserId);
}

function getTeamIdsForPlayers(allTeams: DbTeam[], playerIds: Set<string>): Set<string> {
  const teamIds = new Set<string>();
  for (const team of allTeams) {
    if ((team.player1Id && playerIds.has(team.player1Id)) || (team.player2Id && playerIds.has(team.player2Id))) {
      teamIds.add(team.id);
    }
  }
  return teamIds;
}

function getMatchesForIdentity(allMatches: DbMatch[], idSet: Set<string>): DbMatch[] {
  return allMatches.filter((m) => idSet.has(m.playerOneId ?? "") || idSet.has(m.playerTwoId ?? ""));
}

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

    const nicknameMap = await getNicknameMap(known.map((player) => player.clerkUserId));

    res.json(
      known.map((p) => ({
        id: p.id,
        clerkUserId: p.clerkUserId ?? null,
        firstName: p.firstName,
        lastName: p.lastName,
        nickname: nicknameMap.get(p.clerkUserId ?? "") ?? null,
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
    const [allPlayers, allMatches, allTeams] = await Promise.all([
      db.select().from(playersTable).orderBy(desc(playersTable.eloRating)),
      db.select().from(matchesTable),
      db.select().from(teamsTable),
    ]);
    // Only compute one leaderboard row per signed-in identity.
    const seenClerk = new Set<string>();
    const uniquePlayers = allPlayers.filter((player) => {
      if (!player.clerkUserId) return true;
      if (seenClerk.has(player.clerkUserId)) return false;
      seenClerk.add(player.clerkUserId);
      return true;
    });

    const nicknameMap = await getNicknameMap(uniquePlayers.map((p) => p.clerkUserId));
    const clerkImageMap = await getClerkImageMap(uniquePlayers.map((p) => p.clerkUserId));

    const summaries = await Promise.all(uniquePlayers.map(async (player) => {
      const identityPlayers = getIdentityPlayers(allPlayers, player);
      const identityPlayerIds = new Set(identityPlayers.map((p) => p.id));
      const identityTeamIds = getTeamIdsForPlayers(allTeams, identityPlayerIds);
      const identityIds = new Set<string>([...identityPlayerIds, ...identityTeamIds]);

      const identityMatches = getMatchesForIdentity(allMatches, identityIds);
      const completedMatches = identityMatches.filter((m) => m.status === "completed" && !m.isBye);
      const wins = completedMatches.filter((m) => identityIds.has(m.winnerId ?? "")).length;
      const losses = completedMatches.length - wins;
      const winPct = completedMatches.length > 0 ? Math.round((wins / completedMatches.length) * 100) : 0;

      const badgeRows = await db
        .select({ badge: badgesTable })
        .from(playerBadgesTable)
        .innerJoin(badgesTable, eq(playerBadgesTable.badgeId, badgesTable.id))
        .where(
          and(
            or(...identityPlayers.map((p) => eq(playerBadgesTable.playerId, p.id))),
            eq(badgesTable.enabled, true)
          )
        );
      const badgeCount = new Set(badgeRows.map((r) => r.badge.id)).size;

      const eloRating = Math.max(...identityPlayers.map((p) => p.eloRating ?? 1200));
      const rank = await getRank(eloRating);
      const primary = identityPlayers[0] ?? player;

      return {
        id: primary.id,
        firstName: primary.firstName,
        lastName: primary.lastName,
        nickname: nicknameMap.get(primary.clerkUserId ?? "") ?? null,
        teamName: primary.teamName ?? null,
        avatarUrl: primary.avatarUrl ?? clerkImageMap.get(primary.clerkUserId ?? "") ?? null,
        eloRating,
        rankTitle: rank.title,
        rankEmoji: rank.emoji,
        skillLevel: primary.skillLevel ?? null,
        wins,
        losses,
        matchesPlayed: completedMatches.length,
        winPct,
        badgeCount,
        joinedAt: primary.joinedAt.toISOString(),
      };
    }));

    res.json(summaries);
  } catch (err) {
    _req.log.error({ err }, "Failed to get players list");
    res.status(500).json({ error: "Failed to get players list" });
  }
});

playerStatsRouter.get("/:playerId/stats", async (req: Request<{ playerId: string }>, res) => {
  res.redirect(307, `/api/players/${req.params.playerId}`);
});

playerStatsRouter.get("/:playerId", async (req: Request<{ playerId: string }>, res) => {
  try {
    const { playerId } = req.params;

    const [player, allPlayers, allTeams, allMatches] = await Promise.all([
      db.select().from(playersTable).where(eq(playersTable.id, playerId)).then((rows) => rows[0]),
      db.select().from(playersTable),
      db.select().from(teamsTable),
      db.select().from(matchesTable),
    ]);
    if (!player) { res.status(404).json({ error: "Player not found" }); return; }

    const identityPlayers = getIdentityPlayers(allPlayers, player);
    const identityPlayerIds = new Set(identityPlayers.map((p) => p.id));
    const identityTeamIds = getTeamIdsForPlayers(allTeams, identityPlayerIds);
    const identityIds = new Set<string>([...identityPlayerIds, ...identityTeamIds]);

    const identityMatches = getMatchesForIdentity(allMatches, identityIds);
    const completedMatches = identityMatches.filter((m) => m.status === "completed" && !m.isBye);
    const wins = completedMatches.filter((m) => identityIds.has(m.winnerId ?? "")).length;
    const losses = completedMatches.length - wins;
    const winPct = completedMatches.length > 0 ? Math.round((wins / completedMatches.length) * 100) : 0;

    const tournamentWins = completedMatches.filter(
      (m) => identityIds.has(m.winnerId ?? "") && (m.bracket === "grand_finals" || m.bracket === "grand_finals_reset")
    ).length;

    const recentCompleted = completedMatches
      .filter((m) => m.completedAt)
      .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime())
      .slice(0, 20);

    const tournamentIds = [...new Set(recentCompleted.map((m) => m.tournamentId))];
    const opponentSideIds = recentCompleted.map((m) => {
      const myOnSideOne = identityIds.has(m.playerOneId ?? "");
      return myOnSideOne ? m.playerTwoId : m.playerOneId;
    }).filter(Boolean) as string[];

    const opponentTeams = allTeams.filter((team) => opponentSideIds.includes(team.id));
    const opponentPlayerIds = new Set<string>();
    for (const team of opponentTeams) {
      if (team.player1Id) opponentPlayerIds.add(team.player1Id);
      if (team.player2Id) opponentPlayerIds.add(team.player2Id);
    }
    for (const sideId of opponentSideIds) {
      if (!opponentTeams.some((team) => team.id === sideId)) opponentPlayerIds.add(sideId);
    }

    const [tournaments, opponentPlayers, badgeRows] = await Promise.all([
      tournamentIds.length
        ? db.select().from(tournamentsTable).where(
            tournamentIds.length === 1
              ? eq(tournamentsTable.id, tournamentIds[0])
              : or(...tournamentIds.map((id) => eq(tournamentsTable.id, id)))
          )
        : Promise.resolve([]),
      opponentPlayerIds.size
        ? db.select().from(playersTable).where(
            opponentPlayerIds.size === 1
              ? eq(playersTable.id, [...opponentPlayerIds][0])
              : or(...[...opponentPlayerIds].map((id) => eq(playersTable.id, id)))
          )
        : Promise.resolve([]),
      db
        .select({ badge: badgesTable })
        .from(playerBadgesTable)
        .innerJoin(badgesTable, eq(playerBadgesTable.badgeId, badgesTable.id))
        .where(and(eq(playerBadgesTable.playerId, playerId), eq(badgesTable.enabled, true))),
    ]);

    const playerNicknameMap = await getNicknameMap([player.clerkUserId]);
    const opponentImageMap = await getClerkImageMap(opponentPlayers.map((p) => p.clerkUserId));
    const playerImageMap = await getClerkImageMap([player.clerkUserId]);
    const opponentNicknameMap = await getNicknameMap(opponentPlayers.map((opponent) => opponent.clerkUserId));

    const tourneyMap = new Map(tournaments.map((t) => [t.id, t]));
    const oppMap = new Map<string, { id: string; firstName: string; lastName: string; teamName: string | null; avatarUrl: string | null; clerkUserId: string | null }>(
      opponentPlayers.map((p) => [p.id, p])
    );
    const teamMap = new Map(opponentTeams.map((team) => [team.id, team]));

    const recentMatchesResult = recentCompleted.map((m) => {
      const myOnSideOne = identityIds.has(m.playerOneId ?? "");
      const oppId = myOnSideOne ? (m.playerTwoId ?? "") : (m.playerOneId ?? "");
      const oppTeam = teamMap.get(oppId);
      const opponentPlayersResolved = oppTeam
        ? [oppTeam.player1Id, oppTeam.player2Id].filter(Boolean).map((id) => oppMap.get(id!)).filter(Boolean)
        : [oppMap.get(oppId)].filter(Boolean);
      const tourney = tourneyMap.get(m.tournamentId);
      const opponentName = opponentPlayersResolved.length > 0
        ? opponentPlayersResolved.map((op) => {
            const nickname = opponentNicknameMap.get(op!.clerkUserId ?? "");
            return nickname || op!.teamName || `${op!.firstName} ${op!.lastName}`;
          }).join(" & ")
        : "Unknown";
      return {
        matchId: m.id,
        tournamentId: m.tournamentId,
        tournamentName: tourney?.name ?? "Unknown",
        bracket: m.bracket,
        round: m.round,
        opponentName,
        opponentPlayers: opponentPlayersResolved.map((op) => ({
          id: op!.id,
          firstName: op!.firstName,
          lastName: op!.lastName,
          nickname: opponentNicknameMap.get(op!.clerkUserId ?? "") ?? null,
          avatarUrl: op!.avatarUrl ?? opponentImageMap.get(op!.clerkUserId ?? "") ?? null,
        })),
        won: identityIds.has(m.winnerId ?? ""),
        scoreOne: m.scoreOne ?? null,
        scoreTwo: m.scoreTwo ?? null,
        completedAt: m.completedAt ? new Date(m.completedAt).toISOString() : new Date().toISOString(),
      };
    });

    const eloRating = Math.max(...identityPlayers.map((p) => p.eloRating ?? 1200));
    const rank = await getRank(eloRating);
    const primary = identityPlayers[0] ?? player;

    res.json({
      player: {
        id: primary.id,
        tournamentId: primary.tournamentId,
        firstName: primary.firstName,
        lastName: primary.lastName,
        nickname: playerNicknameMap.get(primary.clerkUserId ?? "") ?? null,
        partnerName: primary.partnerName ?? null,
        teamName: primary.teamName ?? null,
        avatarUrl: primary.avatarUrl ?? playerImageMap.get(primary.clerkUserId ?? "") ?? null,
        eloRating,
        rankTitle: rank.title,
        rankEmoji: rank.emoji,
        seed: primary.seed,
        joinedAt: primary.joinedAt.toISOString(),
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
