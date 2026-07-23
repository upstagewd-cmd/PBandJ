import { db } from "@workspace/db";
import { matchesTable, teamsTable, tournamentPodiumAwardsTable } from "@workspace/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";

type DbMatch = typeof matchesTable.$inferSelect;
type DbTeam = typeof teamsTable.$inferSelect;

function losingTeamId(match: DbMatch): string | null {
  if (!match.winnerId) return null;
  return match.playerOneId === match.winnerId ? match.playerTwoId : match.playerOneId;
}

function getFinalMatch(matches: DbMatch[]): DbMatch | null {
  const completed = matches.filter((m) => m.status === "completed");
  const gfReset = completed.find((m) => m.bracket === "grand_finals_reset");
  const gf = completed.find((m) => m.bracket === "grand_finals");

  const winnerMatches = completed.filter((m) => m.bracket === "winner");
  const maxWinnerRound = winnerMatches.reduce((max, m) => Math.max(max, m.round), 0);
  const seFinal = winnerMatches.find((m) => m.round === maxWinnerRound) ?? null;

  return gfReset ?? gf ?? seFinal;
}

function getThirdPlaceTeamId(matches: DbMatch[], championTeamId: string | null, runnerUpTeamId: string | null): string | null {
  const loserMatches = matches
    .filter((m) => m.bracket === "loser" && m.status === "completed")
    .sort((a, b) => b.round - a.round || b.matchNumber - a.matchNumber);

  if (loserMatches.length === 0) return null;

  const candidateLoser = losingTeamId(loserMatches[0]);
  if (!candidateLoser) return null;
  if (candidateLoser === championTeamId || candidateLoser === runnerUpTeamId) return null;

  return candidateLoser;
}

function getTeamPlayerIds(team: DbTeam | undefined): string[] {
  if (!team) return [];
  return [team.player1Id, team.player2Id].filter(Boolean) as string[];
}

export async function computeTournamentPodiumTeamIds(tournamentId: string) {
  const matches = await db
    .select()
    .from(matchesTable)
    .where(eq(matchesTable.tournamentId, tournamentId));

  const finalMatch = getFinalMatch(matches);
  const championTeamId = finalMatch?.winnerId ?? null;
  const runnerUpTeamId = finalMatch ? losingTeamId(finalMatch) : null;
  const thirdPlaceTeamId = getThirdPlaceTeamId(matches, championTeamId, runnerUpTeamId);

  return {
    championTeamId,
    runnerUpTeamId,
    thirdPlaceTeamId,
  };
}

export async function awardTournamentPodium(tournamentId: string) {
  const { championTeamId, runnerUpTeamId, thirdPlaceTeamId } = await computeTournamentPodiumTeamIds(tournamentId);

  // No complete podium result available yet.
  if (!championTeamId || !runnerUpTeamId) return;

  const teamIds = [championTeamId, runnerUpTeamId, thirdPlaceTeamId].filter(Boolean) as string[];
  const teams = teamIds.length
    ? await db.select().from(teamsTable).where(inArray(teamsTable.id, teamIds))
    : [];
  const teamMap = new Map(teams.map((team) => [team.id, team]));

  const firstIds = getTeamPlayerIds(teamMap.get(championTeamId));
  const secondIds = getTeamPlayerIds(teamMap.get(runnerUpTeamId));
  const thirdIds = thirdPlaceTeamId ? getTeamPlayerIds(teamMap.get(thirdPlaceTeamId)) : [];

  const inserts = [
    ...firstIds.map((playerId) => ({ tournamentId, playerId, place: 1 })),
    ...secondIds.map((playerId) => ({ tournamentId, playerId, place: 2 })),
    ...thirdIds.map((playerId) => ({ tournamentId, playerId, place: 3 })),
  ];

  await db.delete(tournamentPodiumAwardsTable).where(eq(tournamentPodiumAwardsTable.tournamentId, tournamentId));
  if (inserts.length > 0) {
    await db.insert(tournamentPodiumAwardsTable).values(inserts);
  }
}

export async function clearTournamentPodiumAwards(tournamentId: string) {
  await db.delete(tournamentPodiumAwardsTable).where(eq(tournamentPodiumAwardsTable.tournamentId, tournamentId));
}

export async function getTournamentPodiumPlayerCounts(playerIds: string[]) {
  if (playerIds.length === 0) {
    return { firstPlaceCount: 0, secondPlaceCount: 0, thirdPlaceCount: 0 };
  }

  const where =
    playerIds.length === 1
      ? eq(tournamentPodiumAwardsTable.playerId, playerIds[0])
      : inArray(tournamentPodiumAwardsTable.playerId, playerIds);

  const rows = await db
    .select()
    .from(tournamentPodiumAwardsTable)
    .where(where)
    .orderBy(desc(tournamentPodiumAwardsTable.awardedAt));

  return {
    firstPlaceCount: rows.filter((row) => row.place === 1).length,
    secondPlaceCount: rows.filter((row) => row.place === 2).length,
    thirdPlaceCount: rows.filter((row) => row.place === 3).length,
  };
}
