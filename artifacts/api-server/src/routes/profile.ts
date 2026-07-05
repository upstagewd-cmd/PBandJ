import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, playersTable, matchesTable, tournamentsTable } from "@workspace/db";
import { playerBadgesTable, badgesTable } from "@workspace/db/schema";
import { eq, or, and } from "drizzle-orm";
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

    if (players.length === 0) {
      res.json({
        eloRating: 1200,
        rankTitle: "New Seed",
        rankEmoji: "🌱",
        totalWins: 0,
        totalLosses: 0,
        matchesPlayed: 0,
        winPct: 0,
        tournamentWins: 0,
        tournamentsPlayed: 0,
        recentMatches: [],
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

    const recentCompleted = completedMatches
      .filter((m) => m.completedAt)
      .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime())
      .slice(0, 20);

    const tournamentIds = [...new Set(recentCompleted.map((m) => m.tournamentId))];
    const opponentIds = recentCompleted.map((m) => {
      const myId = playerIds.find((pid) => pid === m.playerOneId || pid === m.playerTwoId);
      return myId === m.playerOneId ? m.playerTwoId : m.playerOneId;
    }).filter(Boolean) as string[];

    const [tournaments, opponentPlayers, allBadgeRows] = await Promise.all([
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
    ]);

    // Deduplicate badges by badge id across all player records
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

    const tourneyMap = new Map(tournaments.map((t) => [t.id, t]));
    const oppMap = new Map(opponentPlayers.map((p) => [p.id, p]));

    const recentMatches = recentCompleted.map((m) => {
      const myId = playerIds.find((pid) => pid === m.playerOneId || pid === m.playerTwoId)!;
      const oppId = myId === m.playerOneId ? (m.playerTwoId ?? "") : (m.playerOneId ?? "");
      const opp = oppMap.get(oppId);
      const tourney = tourneyMap.get(m.tournamentId);
      return {
        matchId: m.id,
        tournamentId: m.tournamentId,
        tournamentName: tourney?.name ?? "Unknown",
        bracket: m.bracket,
        round: m.round,
        opponentName: opp ? (opp.teamName ?? `${opp.firstName} ${opp.lastName}`) : "Unknown",
        won: playerIds.includes(m.winnerId ?? ""),
        scoreOne: m.scoreOne ?? null,
        scoreTwo: m.scoreTwo ?? null,
        completedAt: m.completedAt ? new Date(m.completedAt).toISOString() : new Date().toISOString(),
      };
    });

    res.json({
      eloRating,
      rankTitle: rank.title,
      rankEmoji: rank.emoji,
      totalWins,
      totalLosses,
      matchesPlayed: completedMatches.length,
      winPct,
      tournamentWins,
      tournamentsPlayed,
      recentMatches,
      badges,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get profile");
    res.status(500).json({ error: "Failed to get profile" });
  }
});
