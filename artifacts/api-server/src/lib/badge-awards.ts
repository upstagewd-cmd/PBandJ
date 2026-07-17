import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import { badgesTable, matchesTable, playerBadgesTable, playersTable, teamsTable } from "@workspace/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { getSystemSettingBoolean } from "./settings";

type PlayerRow = typeof playersTable.$inferSelect;
type MatchRow = typeof matchesTable.$inferSelect;
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

function bestWinStreak(matchesAscending: MatchRow[], identityIds: Set<string>) {
  let best = 0;
  let current = 0;
  for (const match of matchesAscending) {
    const won = identityIds.has(match.winnerId ?? "");
    if (won) {
      current += 1;
      if (current > best) best = current;
    } else {
      current = 0;
    }
  }
  return best;
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
  switch (badge.ruleType) {
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

  const [enabledBadges, allPlayers, allTeams, completedMatches] = await Promise.all([
    db.select().from(badgesTable).where(eq(badgesTable.enabled, true)),
    db.select().from(playersTable),
    db.select().from(teamsTable),
    db.select().from(matchesTable).where(and(eq(matchesTable.status, "completed"), eq(matchesTable.isBye, false))),
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

    const tournamentsWon = new Set(
      wins
        .filter((match) => match.bracket === "grand_finals" || match.bracket === "grand_finals_reset")
        .map((match) => match.tournamentId)
    ).size;

    const winsAscending = [...relevantMatches].sort((a, b) => {
      const aTime = a.completedAt ? new Date(a.completedAt).getTime() : 0;
      const bTime = b.completedAt ? new Date(b.completedAt).getTime() : 0;
      return aTime - bTime;
    });

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

    const context = {
      wins: wins.length,
      matches: relevantMatches.length,
      tournamentsWon,
      bestStreak: bestWinStreak(winsAscending, identityIds),
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
