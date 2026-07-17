import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import { badgesTable, matchesTable, openPlayMatchesTable, playerBadgesTable, playersTable, teamsTable } from "@workspace/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { getSystemSettingBoolean } from "./settings";

type PlayerRow = typeof playersTable.$inferSelect;
type MatchRow = typeof matchesTable.$inferSelect;
type OpenPlayMatchRow = typeof openPlayMatchesTable.$inferSelect;
type TeamRow = typeof teamsTable.$inferSelect;
type BadgeRow = typeof badgesTable.$inferSelect;

export interface BadgeAwardEvent {
  grantId: string;
  playerId: string;
  clerkUserId: string | null;
  playerName: string;
  badgeId: string;
  badgeName: string;
  badgeIcon: string;
}

function identityKey(player: PlayerRow) {
  if (player.clerkUserId) return `clerk:${player.clerkUserId}`;
  return `name:${player.firstName.trim().toLowerCase()} ${player.lastName.trim().toLowerCase()}`;
}

function teamIdsForPlayers(allTeams: TeamRow[], playerIds: Set<string>) {
  const ids = new Set<string>();
  for (const team of allTeams) {
    if ((team.player1Id && playerIds.has(team.player1Id)) || (team.player2Id && playerIds.has(team.player2Id))) {
      ids.add(team.id);
    }
  }
  return ids;
}

function winnerIdsForOpenPlayMatch(match: OpenPlayMatchRow) {
  if (match.winnerTeam === 1) {
    return [match.teamOnePOneId, match.teamOnePTwoId].filter(Boolean) as string[];
  }
  return [match.teamTwoPOneId, match.teamTwoPTwoId].filter(Boolean) as string[];
}

function normalizeRuleType(ruleType: string) {
  const normalized = ruleType.trim().toLowerCase();
  if (normalized === "streak" || normalized === "win_streak" || normalized === "win_streaks") {
    return "streaks";
  }
  return normalized;
}

function badgeMetric(
  badge: BadgeRow,
  context: {
    wins: number;
    matches: number;
    tournamentsWon: number;
    bestStreak: number;
    uniqueWinningPartners: number;
  }
) {
  switch (normalizeRuleType(badge.ruleType)) {
    case "wins":
      return context.wins;
    case "matches":
      return context.matches;
    case "tournaments":
      return context.tournamentsWon;
    case "streaks":
      return context.bestStreak;
    case "partners":
      return context.uniqueWinningPartners;
    default:
      return 0;
  }
}

export async function autoAwardBadgesForPlayers(playerIds: string[]): Promise<BadgeAwardEvent[]> {
  if (playerIds.length === 0) return [];

  const badgeSystemEnabled = await getSystemSettingBoolean("badge_system_enabled", true);
  if (!badgeSystemEnabled) return [];

  const [enabledBadges, allPlayers, allTeams, completedMatches, openPlayMatches] = await Promise.all([
    db.select().from(badgesTable).where(eq(badgesTable.enabled, true)),
    db.select().from(playersTable),
    db.select().from(teamsTable),
    db.select().from(matchesTable).where(and(eq(matchesTable.status, "completed"), eq(matchesTable.isBye, false))),
    db.select().from(openPlayMatchesTable),
  ]);

  if (enabledBadges.length === 0) return [];

  const awards: BadgeAwardEvent[] = [];

  const targetPlayers = allPlayers.filter((player) => playerIds.includes(player.id));
  const handledIdentityKeys = new Set<string>();
  const teamById = new Map(allTeams.map((team) => [team.id, team]));

  for (const target of targetPlayers) {
    const key = identityKey(target);
    if (handledIdentityKeys.has(key)) continue;
    handledIdentityKeys.add(key);

    const identityPlayers = allPlayers.filter((player) => identityKey(player) === key);
    const identityPlayerIds = new Set(identityPlayers.map((player) => player.id));
    const identityTeamIds = teamIdsForPlayers(allTeams, identityPlayerIds);
    const identityIds = new Set<string>([...identityPlayerIds, ...identityTeamIds]);

    const relevantMatches = completedMatches.filter(
      (match) => identityIds.has(match.playerOneId ?? "") || identityIds.has(match.playerTwoId ?? "")
    );
    const wins = relevantMatches.filter((match) => identityIds.has(match.winnerId ?? ""));
    const relevantOpenPlayMatches = openPlayMatches.filter((match) =>
      identityPlayerIds.has(match.teamOnePOneId) ||
      (match.teamOnePTwoId ? identityPlayerIds.has(match.teamOnePTwoId) : false) ||
      identityPlayerIds.has(match.teamTwoPOneId) ||
      (match.teamTwoPTwoId ? identityPlayerIds.has(match.teamTwoPTwoId) : false)
    );
    const openPlayWins = relevantOpenPlayMatches.filter((match) =>
      winnerIdsForOpenPlayMatch(match).some((id) => identityPlayerIds.has(id))
    );

    const tournamentsWon = new Set(
      wins
        .filter((match) => match.bracket === "grand_finals" || match.bracket === "grand_finals_reset")
        .map((match) => match.tournamentId)
    ).size;

    const streakEvents = [
      ...relevantMatches.map((match) => ({
        playedAt: match.completedAt ? new Date(match.completedAt).getTime() : 0,
        won: identityIds.has(match.winnerId ?? ""),
      })),
      ...relevantOpenPlayMatches.map((match) => ({
        playedAt: new Date(match.playedAt).getTime(),
        won: winnerIdsForOpenPlayMatch(match).some((id) => identityPlayerIds.has(id)),
      })),
    ].sort((a, b) => a.playedAt - b.playedAt);

    let bestStreak = 0;
    let currentStreak = 0;
    for (const event of streakEvents) {
      if (event.won) {
        currentStreak += 1;
        if (currentStreak > bestStreak) bestStreak = currentStreak;
      } else {
        currentStreak = 0;
      }
    }

    const uniqueWinningPartners = new Set<string>();
    for (const match of wins) {
      const winner = match.winnerId ?? "";
      if (!identityTeamIds.has(winner)) continue;
      const team = teamById.get(winner);
      if (!team) continue;

      const p1 = team.player1Id;
      const p2 = team.player2Id;
      if (p1 && identityPlayerIds.has(p1) && p2 && !identityPlayerIds.has(p2)) uniqueWinningPartners.add(p2);
      if (p2 && identityPlayerIds.has(p2) && p1 && !identityPlayerIds.has(p1)) uniqueWinningPartners.add(p1);
    }
    for (const match of openPlayWins) {
      const winnerIds = winnerIdsForOpenPlayMatch(match);
      for (const winnerId of winnerIds) {
        if (!identityPlayerIds.has(winnerId)) continue;
        for (const partnerId of winnerIds) {
          if (partnerId !== winnerId && !identityPlayerIds.has(partnerId)) {
            uniqueWinningPartners.add(partnerId);
          }
        }
      }
    }

    const context = {
      wins: wins.length + openPlayWins.length,
      matches: relevantMatches.length + relevantOpenPlayMatches.length,
      tournamentsWon,
      bestStreak,
      uniqueWinningPartners: uniqueWinningPartners.size,
    };

    const existingRows = identityPlayers.length
      ? await db
          .select({ badgeId: playerBadgesTable.badgeId })
          .from(playerBadgesTable)
          .where(inArray(playerBadgesTable.playerId, identityPlayers.map((player) => player.id)))
      : [];
    const existingBadgeIds = new Set(existingRows.map((row) => row.badgeId));

    const primary = identityPlayers[0] ?? target;
    const newlyEarnedBadges = enabledBadges
      .filter((badge) => badgeMetric(badge, context) >= badge.threshold)
      .filter((badge) => !existingBadgeIds.has(badge.id));

    const newGrantRows = newlyEarnedBadges.map((badge) => ({
      id: randomUUID(),
        playerId: primary.id,
        badgeId: badge.id,
        grantedBy: "system",
      }));

    if (newGrantRows.length > 0) {
      await db.insert(playerBadgesTable).values(newGrantRows);
      const playerName = `${primary.firstName} ${primary.lastName}`.trim();
      for (const row of newGrantRows) {
        const badge = newlyEarnedBadges.find((candidate) => candidate.id === row.badgeId);
        if (!badge) continue;
        awards.push({
          grantId: row.id,
          playerId: primary.id,
          clerkUserId: primary.clerkUserId ?? null,
          playerName,
          badgeId: badge.id,
          badgeName: badge.name,
          badgeIcon: badge.icon,
        });
      }
    }
  }

  return awards;
}
