import { Router, Request } from "express";
import { db, playersTable, matchesTable, tournamentsTable, teamsTable, openPlayMatchesTable, sessionsTable, sessionPlayersTable, sessionMatchesTable } from "@workspace/db";
import { playerBadgesTable, badgesTable } from "@workspace/db/schema";
import { eq, or, and, desc } from "drizzle-orm";
import { getRank } from "../lib/ranks";
import { getNicknameMap, getClerkImageMap } from "../lib/user-display";
import { USER_REGISTRY_TOURNAMENT_ID } from "../lib/player-bootstrap";

export const playerStatsRouter = Router();

type DbPlayer = typeof playersTable.$inferSelect;
type DbTeam = typeof teamsTable.$inferSelect;
type DbMatch = typeof matchesTable.$inferSelect;
type DbOpenPlayMatch = typeof openPlayMatchesTable.$inferSelect;
type DbSession = typeof sessionsTable.$inferSelect;
type DbSessionPlayer = typeof sessionPlayersTable.$inferSelect;
type DbSessionMatch = typeof sessionMatchesTable.$inferSelect;

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

function getOpenPlayMatchesForIdentity(allMatches: DbOpenPlayMatch[], playerIds: Set<string>): DbOpenPlayMatch[] {
  return allMatches.filter((m) =>
    [m.teamOnePOneId, m.teamOnePTwoId, m.teamTwoPOneId, m.teamTwoPTwoId].some((id) => id && playerIds.has(id))
  );
}

function getSessionPlayersForIdentity(allSessionPlayers: DbSessionPlayer[], identityPlayers: DbPlayer[]): DbSessionPlayer[] {
  const clerkIds = new Set(identityPlayers.map((player) => player.clerkUserId).filter((id): id is string => !!id));
  const guestNames = new Set(
    identityPlayers
      .filter((player) => !player.clerkUserId)
      .map((player) => `${player.firstName.trim().toLowerCase()} ${player.lastName.trim().toLowerCase()}`)
  );

  return allSessionPlayers.filter((sessionPlayer) => {
    if (sessionPlayer.clerkUserId && clerkIds.has(sessionPlayer.clerkUserId)) return true;
    const nameKey = `${sessionPlayer.firstName.trim().toLowerCase()} ${sessionPlayer.lastName.trim().toLowerCase()}`;
    return !sessionPlayer.clerkUserId && guestNames.has(nameKey);
  });
}

function getSessionMatchesForIdentity(allSessionMatches: DbSessionMatch[], sessionPlayerIds: Set<string>): DbSessionMatch[] {
  return allSessionMatches.filter((match) =>
    [match.team1P1Id, match.team1P2Id, match.team2P1Id, match.team2P2Id].some((id) => id && sessionPlayerIds.has(id))
  );
}

function countTournamentTitles(
  completedMatches: Array<typeof matchesTable.$inferSelect>,
  winnerIds: Set<string>
): number {
  const byTournament = new Map<string, Array<typeof matchesTable.$inferSelect>>();
  for (const match of completedMatches) {
    const list = byTournament.get(match.tournamentId) ?? [];
    list.push(match);
    byTournament.set(match.tournamentId, list);
  }

  let titles = 0;

  for (const tournamentMatches of byTournament.values()) {
    const gfReset = tournamentMatches.find((m) => m.bracket === "grand_finals_reset");
    const gf = tournamentMatches.find((m) => m.bracket === "grand_finals");
    const seFinal = tournamentMatches
      .filter((m) => m.bracket === "winner")
      .sort((a, b) => b.round - a.round || b.matchNumber - a.matchNumber)[0];

    const championship = gfReset ?? gf ?? seFinal;
    if (championship?.winnerId && winnerIds.has(championship.winnerId)) {
      titles++;
    }
  }

  return titles;
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
    const [allPlayers, allMatches, allTeams, allSessionPlayers, allSessionMatches] = await Promise.all([
      db.select().from(playersTable).orderBy(desc(playersTable.eloRating)),
      db.select().from(matchesTable),
      db.select().from(teamsTable),
      db.select().from(sessionPlayersTable),
      db.select().from(sessionMatchesTable),
    ]);
    const allOpenPlayMatches = await db.select().from(openPlayMatchesTable);
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
      const identitySessionPlayers = getSessionPlayersForIdentity(allSessionPlayers, identityPlayers);
      const identitySessionPlayerIds = new Set(identitySessionPlayers.map((sessionPlayer) => sessionPlayer.id));
      const openPlayIdentityMatches = getOpenPlayMatchesForIdentity(allOpenPlayMatches, identityPlayerIds);
      const sessionIdentityMatches = getSessionMatchesForIdentity(allSessionMatches, identitySessionPlayerIds);

      const identityMatches = getMatchesForIdentity(allMatches, identityIds);
      const completedMatches = identityMatches.filter((m) => m.status === "completed" && !m.isBye);
        const tournamentWins = countTournamentTitles(completedMatches, identityIds);
      const openPlayWins = openPlayIdentityMatches.filter((m) =>
        (m.winnerTeam === 1
          ? [m.teamOnePOneId, m.teamOnePTwoId]
          : [m.teamTwoPOneId, m.teamTwoPTwoId]
        ).some((id) => id && identityPlayerIds.has(id))
      ).length;
      const sessionWins = sessionIdentityMatches.filter((match) =>
        (match.winnerTeam === 1
          ? [match.team1P1Id, match.team1P2Id]
          : [match.team2P1Id, match.team2P2Id]
        ).some((id) => id && identitySessionPlayerIds.has(id))
      ).length;
      const wins = tournamentWins + openPlayWins + sessionWins;
      const matchesPlayed = completedMatches.length + openPlayIdentityMatches.length + sessionIdentityMatches.length;
      const losses = matchesPlayed - wins;
      const winPct = matchesPlayed > 0 ? Math.round((wins / matchesPlayed) * 100) : 0;

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
        matchesPlayed,
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

    const [player, allPlayers, allTeams, allMatches, allSessionPlayers, allSessionMatches, allSessions] = await Promise.all([
      db.select().from(playersTable).where(eq(playersTable.id, playerId)).then((rows) => rows[0]),
      db.select().from(playersTable),
      db.select().from(teamsTable),
      db.select().from(matchesTable),
      db.select().from(sessionPlayersTable),
      db.select().from(sessionMatchesTable),
      db.select().from(sessionsTable),
    ]);
    const allOpenPlayMatches = await db.select().from(openPlayMatchesTable);
    if (!player) { res.status(404).json({ error: "Player not found" }); return; }

    const identityPlayers = getIdentityPlayers(allPlayers, player);
    const identityPlayerIds = new Set(identityPlayers.map((p) => p.id));
    const identityTeamIds = getTeamIdsForPlayers(allTeams, identityPlayerIds);
    const identityIds = new Set<string>([...identityPlayerIds, ...identityTeamIds]);
    const identitySessionPlayers = getSessionPlayersForIdentity(allSessionPlayers, identityPlayers);
    const identitySessionPlayerIds = new Set(identitySessionPlayers.map((sessionPlayer) => sessionPlayer.id));
    const openPlayIdentityMatches = getOpenPlayMatchesForIdentity(allOpenPlayMatches, identityPlayerIds);
    const sessionIdentityMatches = getSessionMatchesForIdentity(allSessionMatches, identitySessionPlayerIds);

    const identityMatches = getMatchesForIdentity(allMatches, identityIds);
    const completedMatches = identityMatches.filter((m) => m.status === "completed" && !m.isBye);
    const competitiveIdentityPlayers = identityPlayers.filter(
      (candidate) => candidate.tournamentId !== USER_REGISTRY_TOURNAMENT_ID
    );
    const tournamentWins = completedMatches.filter((m) => identityIds.has(m.winnerId ?? "")).length;
    const openPlayWins = openPlayIdentityMatches.filter((m) =>
      (m.winnerTeam === 1
        ? [m.teamOnePOneId, m.teamOnePTwoId]
        : [m.teamTwoPOneId, m.teamTwoPTwoId]
      ).some((id) => id && identityPlayerIds.has(id))
    ).length;
    const sessionWins = sessionIdentityMatches.filter((match) =>
      (match.winnerTeam === 1
        ? [match.team1P1Id, match.team1P2Id]
        : [match.team2P1Id, match.team2P2Id]
      ).some((id) => id && identitySessionPlayerIds.has(id))
    ).length;
    const wins = tournamentWins + openPlayWins + sessionWins;
    const matchesPlayed = completedMatches.length + openPlayIdentityMatches.length + sessionIdentityMatches.length;
    const losses = matchesPlayed - wins;
    const winPct = matchesPlayed > 0 ? Math.round((wins / matchesPlayed) * 100) : 0;

    const tournamentWinsDisplay = countTournamentTitles(completedMatches, identityIds);
    const tournamentsPlayed = new Set(competitiveIdentityPlayers.map((candidate) => candidate.tournamentId)).size;

    const recentCompleted = completedMatches
      .filter((m) => m.completedAt)
      .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime())
      .slice(0, 20);
    const recentOpenPlay = openPlayIdentityMatches
      .sort((a, b) => b.playedAt.getTime() - a.playedAt.getTime())
      .slice(0, 20);
    const recentSessionMatches = sessionIdentityMatches
      .sort((a, b) => b.playedAt.getTime() - a.playedAt.getTime())
      .slice(0, 20);

    const tournamentIds = [...new Set(recentCompleted.map((m) => m.tournamentId))];
    const sessionIds = [...new Set(recentSessionMatches.map((m) => m.sessionId))];
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
        .select({
          badge: badgesTable,
          grantId: playerBadgesTable.id,
          grantedAt: playerBadgesTable.grantedAt,
        })
        .from(playerBadgesTable)
        .innerJoin(badgesTable, eq(playerBadgesTable.badgeId, badgesTable.id))
        .where(
          and(
            or(...identityPlayers.map((candidate) => eq(playerBadgesTable.playerId, candidate.id))),
            eq(badgesTable.enabled, true)
          )
        ),
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

    const allPlayersMap = new Map(allPlayers.map((p) => [p.id, p]));

    const recentTournamentMatches = recentCompleted.map((m) => {
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

    const recentOpenPlayMatches = recentOpenPlay.map((m) => {
      const myOnSideOne = [m.teamOnePOneId, m.teamOnePTwoId].some((id) => id && identityPlayerIds.has(id));
      const opponentIds = myOnSideOne ? [m.teamTwoPOneId, m.teamTwoPTwoId] : [m.teamOnePOneId, m.teamOnePTwoId];
      const opponentPlayersResolved = opponentIds.map((id) => allPlayersMap.get(id!)).filter(Boolean);
      const opponentName = opponentPlayersResolved.length > 0
        ? opponentPlayersResolved.map((op) => op!.teamName || `${op!.firstName} ${op!.lastName}`).join(" & ")
        : "Unknown";
      const won = (m.winnerTeam === 1)
        ? [m.teamOnePOneId, m.teamOnePTwoId].some((id) => id && identityPlayerIds.has(id))
        : [m.teamTwoPOneId, m.teamTwoPTwoId].some((id) => id && identityPlayerIds.has(id));

      return {
        matchId: m.id,
        tournamentId: m.tournamentId,
        tournamentName: "Open Play",
        bracket: "open_play",
        round: 0,
        opponentName,
        opponentPlayers: opponentPlayersResolved.map((op) => ({
          id: op!.id,
          firstName: op!.firstName,
          lastName: op!.lastName,
          avatarUrl: op!.avatarUrl ?? null,
        })),
        won,
        scoreOne: m.scoreOne ?? null,
        scoreTwo: m.scoreTwo ?? null,
        completedAt: m.playedAt ? new Date(m.playedAt).toISOString() : new Date().toISOString(),
      };
    });

    const sessionMap = new Map(allSessions.map((session) => [session.id, session]));
    const sessionOpponentPlayers = sessionIds.length
      ? allSessionPlayers.filter((sessionPlayer) => sessionIds.some((sessionId) => sessionPlayer.sessionId === sessionId))
      : [];

    const recentSessionMatchesResult = recentSessionMatches.map((match) => {
      const mySideOne = [match.team1P1Id, match.team1P2Id].some((id) => id && identitySessionPlayerIds.has(id));
      const opponentIds = mySideOne ? [match.team2P1Id, match.team2P2Id] : [match.team1P1Id, match.team1P2Id];
      const opponentPlayersResolved = opponentIds
        .map((id) => sessionOpponentPlayers.find((sessionPlayer) => sessionPlayer.id === id))
        .filter(Boolean);
      const opponentName = opponentPlayersResolved.length > 0
        ? opponentPlayersResolved.map((opponent) => `${opponent!.firstName} ${opponent!.lastName}`.trim()).join(" & ")
        : "Unknown";
      const won = (match.winnerTeam === 1)
        ? [match.team1P1Id, match.team1P2Id].some((id) => id && identitySessionPlayerIds.has(id))
        : [match.team2P1Id, match.team2P2Id].some((id) => id && identitySessionPlayerIds.has(id));

      return {
        matchId: match.id,
        tournamentId: match.sessionId,
        tournamentName: sessionMap.get(match.sessionId)?.name ?? "Open Play",
        bracket: "open_play",
        round: 0,
        opponentName,
        opponentPlayers: opponentPlayersResolved.map((opponent) => ({
          id: opponent!.id,
          firstName: opponent!.firstName,
          lastName: opponent!.lastName,
          nickname: null,
          avatarUrl: null,
        })),
        partnerName: "—",
        won,
        scoreOne: match.scoreOne ?? null,
        scoreTwo: match.scoreTwo ?? null,
        completedAt: match.playedAt ? new Date(match.playedAt).toISOString() : new Date().toISOString(),
      };
    });

    const recentMatchesResult = [...recentTournamentMatches, ...recentOpenPlayMatches, ...recentSessionMatchesResult]
      .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
      .slice(0, 20);

    const latestBadgeGrantByBadgeId = new Map<string, (typeof badgeRows)[number]>();
    for (const row of badgeRows) {
      const current = latestBadgeGrantByBadgeId.get(row.badge.id);
      if (!current || row.grantedAt.getTime() > current.grantedAt.getTime()) {
        latestBadgeGrantByBadgeId.set(row.badge.id, row);
      }
    }

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
      matchesPlayed,
      winPct,
      tournamentWins: tournamentWinsDisplay,
      tournamentsPlayed,
      recentMatches: recentMatchesResult,
      badges: [...latestBadgeGrantByBadgeId.values()].map((r: any) => ({
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
