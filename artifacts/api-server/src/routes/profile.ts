import { Router } from "express";
import { randomUUID } from "crypto";
import { getAuth, clerkClient } from "@clerk/express";
import { db, playersTable, matchesTable, tournamentsTable, userProfilesTable, openPlayMatchesTable, sessionsTable, sessionPlayersTable, sessionMatchesTable } from "@workspace/db";
import { playerBadgesTable, badgesTable, teamsTable } from "@workspace/db/schema";
import { eq, or, and, inArray } from "drizzle-orm";
import { getRank } from "../lib/ranks";
import { USER_REGISTRY_TOURNAMENT_ID } from "../lib/player-bootstrap";
import { getStartingEloForSkill } from "../lib/settings";
import { getNicknameMap, isNicknameTakenGlobal } from "../lib/user-display";

export const profileRouter = Router();

type DbSessionPlayer = typeof sessionPlayersTable.$inferSelect;
type DbSessionMatch = typeof sessionMatchesTable.$inferSelect;

function getSessionPlayersForIdentity(allSessionPlayers: DbSessionPlayer[], identityPlayers: typeof playersTable.$inferSelect[]) {
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

function getSessionMatchesForIdentity(allSessionMatches: DbSessionMatch[], sessionPlayerIds: Set<string>) {
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

profileRouter.get("/me", async (req, res) => {
  try {
    const auth = getAuth(req);
    const clerkUserId = auth?.userId;
    if (!clerkUserId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const players = await db
      .select()
      .from(playersTable)
      .where(eq(playersTable.clerkUserId, clerkUserId));
    const allPlayers = await db.select().from(playersTable);
    const allSessionPlayers = await db.select().from(sessionPlayersTable);
    const allSessionMatches = await db.select().from(sessionMatchesTable);
    const allSessions = await db.select().from(sessionsTable);

    const allPlayerIds = players.map((p) => p.id);

    const competitivePlayers = players.filter(
      (player) => player.tournamentId !== USER_REGISTRY_TOURNAMENT_ID
    );

    // Fetch stored skill preference
    const [userProfile] = await db
      .select()
      .from(userProfilesTable)
      .where(eq(userProfilesTable.clerkUserId, clerkUserId));
    const nickname = userProfile?.nickname ?? null;
    const skillLevel = userProfile?.skillLevel ?? null;

    const allBadgeRows = allPlayerIds.length
      ? await db
          .select({
            badge: badgesTable,
            playerId: playerBadgesTable.playerId,
            grantId: playerBadgesTable.id,
            grantedAt: playerBadgesTable.grantedAt,
            grantedBy: playerBadgesTable.grantedBy,
          })
          .from(playerBadgesTable)
          .innerJoin(badgesTable, eq(playerBadgesTable.badgeId, badgesTable.id))
          .where(
            and(
              or(...allPlayerIds.map((pid) => eq(playerBadgesTable.playerId, pid))),
              eq(badgesTable.enabled, true)
            )
          )
      : [];

    const latestBadgeGrantByBadgeId = new Map<string, (typeof allBadgeRows)[number]>();
    for (const row of allBadgeRows) {
      const current = latestBadgeGrantByBadgeId.get(row.badge.id);
      if (!current || row.grantedAt.getTime() > current.grantedAt.getTime()) {
        latestBadgeGrantByBadgeId.set(row.badge.id, row);
      }
    }
    const badges = [...latestBadgeGrantByBadgeId.values()].map((row) => ({
      id: row.badge.id,
      name: row.badge.name,
      icon: row.badge.icon,
      description: row.badge.description,
      grantId: row.grantId,
      grantedAt: row.grantedAt.toISOString(),
      grantedBy: row.grantedBy,
    }));

    if (competitivePlayers.length === 0) {
      res.json({
        eloRating: 1200,
        rankTitle: "New Seed",
        rankEmoji: "🌱",
        nickname,
        skillLevel,
        totalWins: 0,
        totalLosses: 0,
        matchesPlayed: 0,
        winPct: 0,
        tournamentWins: 0,
        tournamentsPlayed: 0,
        recentMatches: [],
        partnerStats: [],
        badges,
      });
      return;
    }

    const playerIds = competitivePlayers.map((p) => p.id);
    const identityPlayers = players;

    // Fetch all teams this user belongs to (need team IDs for match lookup)
    const userTeamsEarly = playerIds.length
      ? await db.select().from(teamsTable).where(
          or(
            ...playerIds.flatMap((pid) => [
              eq(teamsTable.player1Id, pid),
              eq(teamsTable.player2Id, pid),
            ])
          )
        )
      : [];
    const teamIds = userTeamsEarly.map((t) => t.id);

    // Matches may store player IDs (old single-player) or team IDs (doubles)
    const matchIdSet = [...playerIds, ...teamIds];
    const allMatches = matchIdSet.length
      ? await db.select().from(matchesTable).where(
          or(...matchIdSet.flatMap((id) => [
            eq(matchesTable.playerOneId, id),
            eq(matchesTable.playerTwoId, id),
          ]))
        )
      : [];
    const allOpenPlayMatches = await db.select().from(openPlayMatchesTable);

    // A match is "won" if winner_id equals any of the user's player IDs or team IDs
    const winnerIds = new Set([...playerIds, ...teamIds]);

    const completedMatches = allMatches.filter((m) => m.status === "completed" && !m.isBye);
    const identityPlayerIdSet = new Set(playerIds);
    const allPlayersMap = new Map(allPlayers.map((p) => [p.id, p]));
    const sessionPlayersForIdentity = getSessionPlayersForIdentity(allSessionPlayers, identityPlayers);
    const sessionPlayerIdSet = new Set(sessionPlayersForIdentity.map((player) => player.id));

    const openPlayIdentityMatches = allOpenPlayMatches.filter((m) => {
      const sideOneHasIdentity = [m.teamOnePOneId, m.teamOnePTwoId].some((id) => id && identityPlayerIdSet.has(id));
      const sideTwoHasIdentity = [m.teamTwoPOneId, m.teamTwoPTwoId].some((id) => id && identityPlayerIdSet.has(id));
      return sideOneHasIdentity || sideTwoHasIdentity;
    });
    const sessionIdentityMatches = getSessionMatchesForIdentity(allSessionMatches, sessionPlayerIdSet);

    let totalWins = 0;
    for (const m of completedMatches) {
      const isWinner = winnerIds.has(m.winnerId ?? "");
      if (isWinner) {
        totalWins++;
      }
    }
    const tournamentWins = countTournamentTitles(completedMatches, winnerIds);
    for (const m of openPlayIdentityMatches) {
      const winningSide = m.winnerTeam === 1
        ? [m.teamOnePOneId, m.teamOnePTwoId]
        : [m.teamTwoPOneId, m.teamTwoPTwoId];
      const won = winningSide.some((id) => id && identityPlayerIdSet.has(id));
      if (won) totalWins++;
    }
    for (const m of sessionIdentityMatches) {
      const winningSide = m.winnerTeam === 1
        ? [m.team1P1Id, m.team1P2Id]
        : [m.team2P1Id, m.team2P2Id];
      const won = winningSide.some((id) => id && sessionPlayerIdSet.has(id));
      if (won) totalWins++;
    }
    const totalMatchesPlayed = completedMatches.length + openPlayIdentityMatches.length + sessionIdentityMatches.length;
    const totalLosses = totalMatchesPlayed - totalWins;
    const winPct = totalMatchesPlayed > 0 ? Math.round((totalWins / totalMatchesPlayed) * 100) : 0;

    const eloRating = Math.max(...competitivePlayers.map((p) => p.eloRating ?? 1200));
    const rank = await getRank(eloRating);
    const tournamentsPlayed = new Set(competitivePlayers.map((p) => p.tournamentId)).size;

    // Re-use the teams fetched earlier
    const userTeams = userTeamsEarly;

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

    // Opponent is whichever side is NOT the user (could be a team ID or player ID)
    const opponentSideIds = recentCompleted
      .map((m) => {
        const myOnSideOne = winnerIds.has(m.playerOneId ?? "") || playerIds.includes(m.playerOneId ?? "");
        return myOnSideOne ? m.playerTwoId : m.playerOneId;
      })
      .filter(Boolean) as string[];

    const opponentTeams = opponentSideIds.length
      ? await db.select().from(teamsTable).where(
          opponentSideIds.length === 1
            ? eq(teamsTable.id, opponentSideIds[0])
            : or(...opponentSideIds.map((id) => eq(teamsTable.id, id)))
        )
      : [];
    const opponentTeamMap = new Map(opponentTeams.map((t) => [t.id, t]));

    const opponentPlayerIds = new Set<string>();
    for (const sideId of opponentSideIds) {
      const oppTeam = opponentTeamMap.get(sideId);
      if (oppTeam) {
        if (oppTeam.player1Id) opponentPlayerIds.add(oppTeam.player1Id);
        if (oppTeam.player2Id) opponentPlayerIds.add(oppTeam.player2Id);
      } else {
        opponentPlayerIds.add(sideId);
      }
    }

    // Partner IDs from the user's teams
    const partnerIds = userTeams
      .map((t) => {
        const myPid = playerIds.find((pid) => pid === t.player1Id || pid === t.player2Id);
        return myPid === t.player1Id ? t.player2Id : t.player1Id;
      })
      .filter((pid): pid is string => !!pid);

    const [tournaments, opponentPlayers, allPartnerPlayers] = await Promise.all([
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
      partnerIds.length
        ? db.select().from(playersTable).where(
            partnerIds.length === 1
              ? eq(playersTable.id, partnerIds[0])
              : or(...partnerIds.map((id) => eq(playersTable.id, id)))
          )
        : Promise.resolve([]),
    ]);

    const sessionMap = new Map(allSessions.map((session) => [session.id, session]));
    const sessionOpponentPlayers = sessionIds.length
      ? allSessionPlayers.filter((sessionPlayer) => sessionIds.some((sessionId) => sessionPlayer.sessionId === sessionId))
      : [];

    const opponentNicknameMap = await getNicknameMap(opponentPlayers.map((p) => p.clerkUserId));
    const tourneyMap = new Map(tournaments.map((t) => [t.id, t]));
    const oppMap = new Map(opponentPlayers.map((p) => [p.id, p]));
    const partnerPlayerMap = new Map(allPartnerPlayers.map((p) => [p.id, p]));

    // ── Compute partner stats ──
    const partnerStatMap = new Map<string, { playerId: string; name: string; avatarUrl: string | null; wins: number; losses: number; matches: number }>();

    // Helper to resolve display name — always use real name for partner stats
    const displayName = (p: typeof playersTable.$inferSelect | undefined) =>
      p ? `${p.firstName} ${p.lastName}` : "Unknown";

    const recentMatches = [
      ...recentCompleted.map((m) => {
      const won = winnerIds.has(m.winnerId ?? "");
      const tourney = tourneyMap.get(m.tournamentId);

      // Figure out which side the user is on
      const myOnSideOne =
        playerIds.includes(m.playerOneId ?? "") ||
        teamIds.includes(m.playerOneId ?? "");
      const oppTeamId = myOnSideOne ? (m.playerTwoId ?? "") : (m.playerOneId ?? "");

      // Resolve opponent name — could be a team record or a direct player
      const oppTeam = opponentTeamMap.get(oppTeamId);
      const opponentPlayers = oppTeam
        ? [oppTeam.player1Id, oppTeam.player2Id]
            .filter(Boolean)
            .map((id) => oppMap.get(id!))
            .filter(Boolean)
        : [oppMap.get(oppTeamId)].filter(Boolean);
      const opponentName = opponentPlayers.length > 0
        ? opponentPlayers
            .map((p) => {
              const nick = opponentNicknameMap.get(p?.clerkUserId ?? "");
              return nick || p?.teamName || `${p?.firstName} ${p?.lastName}`;
            })
            .join(" & ")
        : "Unknown";

      // Find the user's team for this match → partner
      const myTeam = userTeams.find((t) => t.id === m.playerOneId || t.id === m.playerTwoId);
      let partnerName = "—";
      if (myTeam) {
        const myPid = playerIds.find((pid) => pid === myTeam.player1Id || pid === myTeam.player2Id);
        const partnerId = myPid === myTeam.player1Id ? myTeam.player2Id : myTeam.player1Id;
        if (partnerId) {
          const partner = partnerPlayerMap.get(partnerId);
          partnerName = displayName(partner);

          // Aggregate partner stats
          const existing = partnerStatMap.get(partnerId);
          if (existing) {
            existing.matches++;
            if (won) existing.wins++; else existing.losses++;
          } else {
            partnerStatMap.set(partnerId, {
              playerId: partnerId,
              name: partnerName,
              avatarUrl: partner?.avatarUrl ?? null,
              wins: won ? 1 : 0,
              losses: won ? 0 : 1,
              matches: 1,
            });
          }
        }
      }

      return {
        matchId: m.id,
        tournamentId: m.tournamentId,
        tournamentName: tourney?.name ?? "Unknown",
        bracket: m.bracket,
        round: m.round,
        opponentName,
        opponentPlayers: opponentPlayers.map((p) => ({
          id: p!.id,
          firstName: p!.firstName,
          lastName: p!.lastName,
          avatarUrl: p!.avatarUrl ?? null,
        })),
        partnerName,
        won,
        scoreOne: m.scoreOne ?? null,
        scoreTwo: m.scoreTwo ?? null,
        completedAt: m.completedAt ? new Date(m.completedAt).toISOString() : new Date().toISOString(),
      };
      }),
      ...recentOpenPlay.map((m) => {
        const won = (m.winnerTeam === 1)
          ? [m.teamOnePOneId, m.teamOnePTwoId].some((id) => id && identityPlayerIdSet.has(id))
          : [m.teamTwoPOneId, m.teamTwoPTwoId].some((id) => id && identityPlayerIdSet.has(id));
        const myOnSideOne = [m.teamOnePOneId, m.teamOnePTwoId].some((id) => id && identityPlayerIdSet.has(id));
        const opponentIds = myOnSideOne ? [m.teamTwoPOneId, m.teamTwoPTwoId] : [m.teamOnePOneId, m.teamOnePTwoId];
        const opponentPlayersResolved = opponentIds.map((id) => allPlayersMap.get(id!)).filter(Boolean);
        const opponentName = opponentPlayersResolved.length > 0
          ? opponentPlayersResolved.map((p) => {
              return p?.teamName || `${p?.firstName} ${p?.lastName}`;
            }).join(" & ")
          : "Unknown";
        return {
          matchId: m.id,
          tournamentId: m.tournamentId,
          tournamentName: "Open Play",
          bracket: "open_play",
          round: 0,
          opponentName,
          opponentPlayers: opponentPlayersResolved.map((p) => ({
            id: p!.id,
            firstName: p!.firstName,
            lastName: p!.lastName,
            nickname: null,
            avatarUrl: p!.avatarUrl ?? null,
          })),
          partnerName: "—",
          won,
          scoreOne: m.scoreOne ?? null,
          scoreTwo: m.scoreTwo ?? null,
          completedAt: m.playedAt ? new Date(m.playedAt).toISOString() : new Date().toISOString(),
        };
      }),
      ...recentSessionMatches.map((m) => {
        const mySideOne = [m.team1P1Id, m.team1P2Id].some((id) => id && sessionPlayerIdSet.has(id));
        const opponentIds = mySideOne ? [m.team2P1Id, m.team2P2Id] : [m.team1P1Id, m.team1P2Id];
        const opponentPlayersResolved = opponentIds
          .map((id) => sessionOpponentPlayers.find((sessionPlayer) => sessionPlayer.id === id))
          .filter(Boolean);
        const opponentName = opponentPlayersResolved.length > 0
          ? opponentPlayersResolved.map((op) => `${op!.firstName} ${op!.lastName}`.trim()).join(" & ")
          : "Unknown";
        const won = (m.winnerTeam === 1)
          ? [m.team1P1Id, m.team1P2Id].some((id) => id && sessionPlayerIdSet.has(id))
          : [m.team2P1Id, m.team2P2Id].some((id) => id && sessionPlayerIdSet.has(id));

        return {
          matchId: m.id,
          tournamentId: m.sessionId,
          tournamentName: sessionMap.get(m.sessionId)?.name ?? "Open Play",
          bracket: "open_play",
          round: 0,
          opponentName,
          opponentPlayers: opponentPlayersResolved.map((op) => ({
            id: op!.id,
            firstName: op!.firstName,
            lastName: op!.lastName,
            nickname: null,
            avatarUrl: null,
          })),
          partnerName: "—",
          won,
          scoreOne: m.scoreOne ?? null,
          scoreTwo: m.scoreTwo ?? null,
          completedAt: m.playedAt ? new Date(m.playedAt).toISOString() : new Date().toISOString(),
        };
      }),
    ]
      .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
      .slice(0, 20);

    const partnerStats = Array.from(partnerStatMap.values())
      .map((p) => ({
        playerId: p.playerId,
        name: p.name,
        avatarUrl: p.avatarUrl ?? null,
        wins: p.wins,
        losses: p.losses,
        matches: p.matches,
        winPct: p.matches > 0 ? Math.round((p.wins / p.matches) * 100) : 0,
      }))
      .sort((a, b) => b.winPct - a.winPct || b.matches - a.matches);

    res.json({
      eloRating,
      rankTitle: rank.title,
      rankEmoji: rank.emoji,
      nickname,
      skillLevel,
      totalWins,
      totalLosses,
      matchesPlayed: totalMatchesPlayed,
      winPct,
      tournamentWins,
      tournamentsPlayed,
      recentMatches,
      partnerStats,
      badges,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get profile");
    res.status(500).json({ error: "Failed to get profile" });
  }
});

profileRouter.put("/me/name", async (req, res) => {
  try {
    const auth = getAuth(req);
    const clerkUserId = auth?.userId;
    if (!clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const { firstName, lastName } = req.body ?? {};
    if (!firstName?.trim() || !lastName?.trim()) {
      res.status(400).json({ error: "firstName and lastName are required" });
      return;
    }

    await clerkClient.users.updateUser(clerkUserId, {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
    });

    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to update user name via Clerk");
    res.status(500).json({ error: "Failed to update name" });
  }
});

profileRouter.put("/me/skill", async (req, res) => {
  try {
    const auth = getAuth(req);
    const clerkUserId = auth?.userId;
    if (!clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const skillLevel = req.body?.skillLevel as string | undefined;
    if (!skillLevel || !["beginner", "intermediate", "advanced"].includes(skillLevel)) {
      res.status(400).json({ error: "skillLevel must be beginner, intermediate, or advanced" });
      return;
    }

    const [existing] = await db
      .select()
      .from(userProfilesTable)
      .where(eq(userProfilesTable.clerkUserId, clerkUserId));

    const existingSkillLevel = (existing?.skillLevel ?? "").trim();
    const hasLockedSkillLevel = ["beginner", "intermediate", "advanced"].includes(existingSkillLevel);

    if (hasLockedSkillLevel && existingSkillLevel !== skillLevel) {
      res.status(403).json({ error: "Skill level is locked. Ask an admin to change it." });
      return;
    }

    const startingElo = await getStartingEloForSkill(skillLevel);

    if (existing) {
      await db
        .update(userProfilesTable)
        .set({ skillLevel, updatedAt: new Date() })
        .where(eq(userProfilesTable.clerkUserId, clerkUserId));
    } else {
      await db.insert(userProfilesTable).values({
        id: randomUUID(),
        clerkUserId,
        skillLevel,
        updatedAt: new Date(),
      });
    }

    await db
      .update(playersTable)
      .set({ skillLevel, eloRating: startingElo })
      .where(
        and(
          eq(playersTable.clerkUserId, clerkUserId),
          eq(playersTable.tournamentId, USER_REGISTRY_TOURNAMENT_ID)
        )
      );

    res.json({ skillLevel });
  } catch (err) {
    req.log.error({ err }, "Failed to set skill level");
    res.status(500).json({ error: "Failed to set skill level" });
  }
});

profileRouter.put("/me/nickname", async (req, res) => {
  try {
    const auth = getAuth(req);
    const clerkUserId = auth?.userId;
    if (!clerkUserId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const nicknameInput = req.body?.nickname;
    if (nicknameInput !== undefined && typeof nicknameInput !== "string") {
      res.status(400).json({ error: "invalid_nickname_type", message: "Nickname must be plain text." });
      return;
    }

    const nickname = nicknameInput?.trim() || null;

    if (nickname && nickname.length > 15) {
      res.status(400).json({ error: "nickname_too_long", message: "Nickname must be 15 characters or fewer." });
      return;
    }

    if (nickname) {
      const taken = await isNicknameTakenGlobal(nickname, { excludeClerkUserId: clerkUserId });
      if (taken) {
        res.status(409).json({ error: "nickname_taken", message: "That nickname is already taken. Try another one." });
        return;
      }
    }

    const [existing] = await db
      .select()
      .from(userProfilesTable)
      .where(eq(userProfilesTable.clerkUserId, clerkUserId));

    if (existing) {
      await db
        .update(userProfilesTable)
        .set({ nickname, updatedAt: new Date() })
        .where(eq(userProfilesTable.clerkUserId, clerkUserId));
    } else {
      await db.insert(userProfilesTable).values({
        id: randomUUID(),
        clerkUserId,
        nickname,
        // Leave skill unset until onboarding picks it. This avoids pre-locking a default.
        skillLevel: "",
        updatedAt: new Date(),
      });
    }

    res.json({ nickname });
  } catch (err) {
    req.log.error({ err }, "Failed to set nickname");
    res.status(500).json({ error: "Failed to set nickname" });
  }
});
