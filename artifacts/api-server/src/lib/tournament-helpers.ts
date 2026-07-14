import { db, tournamentsTable, playersTable, matchesTable, teamsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getRank } from "./ranks";
import { getNicknameMap } from "./user-display";

async function serializePlayer(p: typeof playersTable.$inferSelect, nickname?: string | null) {
  const rank = await getRank(p.eloRating ?? 1200);
  return {
    id: p.id,
    tournamentId: p.tournamentId,
    firstName: p.firstName,
    lastName: p.lastName,
    nickname: nickname ?? null,
    partnerName: p.partnerName ?? null,
    teamName: p.teamName ?? null,
    avatarUrl: p.avatarUrl ?? null,
    eloRating: p.eloRating ?? 1200,
    rankTitle: rank.title,
    rankEmoji: rank.emoji,
    seed: p.seed,
    teamId: p.teamId ?? null,
    joinedAt: p.joinedAt.toISOString(),
    // playerToken intentionally omitted — never broadcast to all clients
  };
}

export async function getTournamentFull(tournamentId: string) {
  const [tournament] = await db
    .select()
    .from(tournamentsTable)
    .where(eq(tournamentsTable.id, tournamentId));

  if (!tournament) return null;

  const [players, teams, matches] = await Promise.all([
    db.select().from(playersTable).where(eq(playersTable.tournamentId, tournamentId)).orderBy(playersTable.seed, playersTable.joinedAt),
    db.select().from(teamsTable).where(eq(teamsTable.tournamentId, tournamentId)).orderBy(teamsTable.seed, teamsTable.createdAt),
    db.select().from(matchesTable).where(eq(matchesTable.tournamentId, tournamentId)).orderBy(matchesTable.round, matchesTable.matchNumber),
  ]);
  const nicknameMap = await getNicknameMap(players.map((player) => player.clerkUserId));

  return {
    id: tournament.id,
    name: tournament.name,
    status: tournament.status,
    registrationLocked: tournament.registrationLocked,
    createdAt: tournament.createdAt.toISOString(),
    startedAt: tournament.startedAt?.toISOString() ?? null,
    completedAt: tournament.completedAt?.toISOString() ?? null,
    players: await Promise.all(players.map((player) => serializePlayer(player, nicknameMap.get(player.clerkUserId ?? "") ?? null))),
    teams: teams.map((t) => ({
      id: t.id,
      tournamentId: t.tournamentId,
      player1Id: t.player1Id ?? null,
      player2Id: t.player2Id ?? null,
      teamName: t.teamName ?? null,
      seed: t.seed,
      createdAt: t.createdAt.toISOString(),
    })),
    matches: matches.map((m) => ({
      ...m,
      completedAt: (m as any).completedAt?.toISOString?.() ?? null,
    })),
  };
}
