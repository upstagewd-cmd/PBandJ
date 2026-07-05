import { Router } from "express";
import { randomUUID } from "crypto";
import { getAuth } from "@clerk/express";
import { db, playersTable, matchesTable, tournamentsTable, userProfilesTable } from "@workspace/db";
import { playerBadgesTable, badgesTable, teamsTable } from "@workspace/db/schema";
import { eq, or, and, inArray } from "drizzle-orm";
import { getRank } from "../lib/ranks";

export const profileRouter = Router();

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

    // Fetch stored skill preference
    const [userProfile] = await db
      .select()
      .from(userProfilesTable)
      .where(eq(userProfilesTable.clerkUserId, clerkUserId));
    const skillLevel = userProfile?.skillLevel ?? null;

    if (players.length === 0) {
      res.json({
        eloRating: 1200,
        rankTitle: "New Seed",
        rankEmoji: "🌱",
        skillLevel,
        totalWins: 0,
        totalLosses: 0,
        matchesPlayed: 0,
        winPct: 0,
        tournamentWins: 0,
        tournamentsPlayed: 0,
        recentMatches: [],
        partnerStats: [],
        badges: [],
      });
      return;
    }

    const playerIds = players.map((p) => p.id);

    const allMatches = playerIds.length
      ? await db.select().from(matchesTable).where(
          or(...playerIds.flatMap((pid) => [
            eq(matchesTable.playerOneId, pid),
            eq(matchesTable.playerTwoId, pid),
          ]))
        )
      : [];

    const completedMatches = allMatches.filter((m) => m.status === "completed" && !m.isBye);

    let totalWins = 0;
    let tournamentWins = 0;
    for (const m of completedMatches) {
      const isWinner = playerIds.includes(m.winnerId ?? "");
      if (isWinner) {
        totalWins++;
        if (m.bracket === "grand_finals" || m.bracket === "grand_finals_reset") {
          tournamentWins++;
        }
      }
    }
    const totalLosses = completedMatches.length - totalWins;
    const winPct = completedMatches.length > 0 ? Math.round((totalWins / completedMatches.length) * 100) : 0;

    const eloRating = Math.max(...players.map((p) => p.eloRating ?? 1200));
    const rank = getRank(eloRating);
    const tournamentsPlayed = new Set(players.map((p) => p.tournamentId)).size;

    // ── Fetch teams the user was on ──
    const userTeams = await db
      .select()
      .from(teamsTable)
      .where(
        or(
          ...playerIds.flatMap((pid) => [
            eq(teamsTable.player1Id, pid),
            eq(teamsTable.player2Id, pid),
          ])
        )
      );
    const teamMap = new Map(userTeams.map((t) => [t.id, t]));

    // Build lookup: which playerId the user is per tournament (someone may have multiple player rows)
    const playerById = new Map(players.map((p) => [p.id, p]));

    const recentCompleted = completedMatches
      .filter((m) => m.completedAt)
      .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime())
      .slice(0, 20);

    const tournamentIds = [...new Set(recentCompleted.map((m) => m.tournamentId))];
    const opponentIds = recentCompleted.map((m) => {
      const myId = playerIds.find((pid) => pid === m.playerOneId || pid === m.playerTwoId);
      return myId === m.playerOneId ? m.playerTwoId : m.playerOneId;
    }).filter(Boolean) as string[];

    // Partner IDs from the user's teams
    const partnerIds = userTeams
      .map((t) => {
        const myPid = playerIds.find((pid) => pid === t.player1Id || pid === t.player2Id);
        return myPid === t.player1Id ? t.player2Id : t.player1Id;
      })
      .filter((pid): pid is string => !!pid);

    const [tournaments, opponentPlayers, allBadgeRows, allPartnerPlayers] = await Promise.all([
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
        .select({ badge: badgesTable, playerId: playerBadgesTable.playerId })
        .from(playerBadgesTable)
        .innerJoin(badgesTable, eq(playerBadgesTable.badgeId, badgesTable.id))
        .where(
          and(
            or(...playerIds.map((pid) => eq(playerBadgesTable.playerId, pid))),
            eq(badgesTable.enabled, true)
          )
        ),
      partnerIds.length
        ? db.select().from(playersTable).where(
            partnerIds.length === 1
              ? eq(playersTable.id, partnerIds[0])
              : or(...partnerIds.map((id) => eq(playersTable.id, id)))
          )
        : Promise.resolve([]),
    ]);

    const tourneyMap = new Map(tournaments.map((t) => [t.id, t]));
    const oppMap = new Map(opponentPlayers.map((p) => [p.id, p]));
    const partnerPlayerMap = new Map(allPartnerPlayers.map((p) => [p.id, p]));

    // Deduplicate badges
    const seenBadgeIds = new Set<string>();
    const badges = allBadgeRows
      .filter((r) => {
        if (seenBadgeIds.has(r.badge.id)) return false;
        seenBadgeIds.add(r.badge.id);
        return true;
      })
      .map((r) => ({
        id: r.badge.id,
        name: r.badge.name,
        icon: r.badge.icon,
        description: r.badge.description,
      }));

    // ── Compute partner stats ──
    const partnerStatMap = new Map<string, { playerId: string; name: string; wins: number; losses: number; matches: number }>();

    // Helper to resolve display name
    const displayName = (p: typeof playersTable.$inferSelect | undefined) =>
      p ? (p.teamName ?? `${p.firstName} ${p.lastName}`) : "Unknown";

    const recentMatches = recentCompleted.map((m) => {
      const myPlayerId = playerIds.find((pid) => pid === m.playerOneId || pid === m.playerTwoId)!;
      const oppId = myPlayerId === m.playerOneId ? (m.playerTwoId ?? "") : (m.playerOneId ?? "");
      const opp = oppMap.get(oppId);
      const tourney = tourneyMap.get(m.tournamentId);

      // Find my team for this match → then find my partner
      const myTeam = userTeams.find((t) => t.id === m.playerOneId || t.id === m.playerTwoId);
      let partnerName = "—";
      if (myTeam) {
        const partnerId = myTeam.player1Id === myPlayerId ? myTeam.player2Id : myTeam.player1Id;
        if (partnerId) {
          const partner = partnerPlayerMap.get(partnerId);
          partnerName = displayName(partner);

          // Aggregate partner stats
          const won = playerIds.includes(m.winnerId ?? "");
          const existing = partnerStatMap.get(partnerId);
          if (existing) {
            existing.matches++;
            if (won) existing.wins++; else existing.losses++;
          } else {
            partnerStatMap.set(partnerId, {
              playerId: partnerId,
              name: partnerName,
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
        opponentName: opp ? (opp.teamName ?? `${opp.firstName} ${opp.lastName}`) : "Unknown",
        partnerName,
        won: playerIds.includes(m.winnerId ?? ""),
        scoreOne: m.scoreOne ?? null,
        scoreTwo: m.scoreTwo ?? null,
        completedAt: m.completedAt ? new Date(m.completedAt).toISOString() : new Date().toISOString(),
      };
    });

    const partnerStats = Array.from(partnerStatMap.values())
      .map((p) => ({
        playerId: p.playerId,
        name: p.name,
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
      skillLevel,
      totalWins,
      totalLosses,
      matchesPlayed: completedMatches.length,
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

    res.json({ skillLevel });
  } catch (err) {
    req.log.error({ err }, "Failed to set skill level");
    res.status(500).json({ error: "Failed to set skill level" });
  }
});
