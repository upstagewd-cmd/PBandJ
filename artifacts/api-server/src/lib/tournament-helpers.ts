import { db, tournamentsTable, playersTable, matchesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export async function getTournamentFull(tournamentId: string) {
  const [tournament] = await db
    .select()
    .from(tournamentsTable)
    .where(eq(tournamentsTable.id, tournamentId));

  if (!tournament) return null;

  const players = await db
    .select()
    .from(playersTable)
    .where(eq(playersTable.tournamentId, tournamentId))
    .orderBy(playersTable.seed, playersTable.joinedAt);

  const matches = await db
    .select()
    .from(matchesTable)
    .where(eq(matchesTable.tournamentId, tournamentId))
    .orderBy(matchesTable.round, matchesTable.matchNumber);

  return {
    id: tournament.id,
    name: tournament.name,
    status: tournament.status,
    registrationLocked: tournament.registrationLocked,
    createdAt: tournament.createdAt.toISOString(),
    startedAt: tournament.startedAt?.toISOString() ?? null,
    completedAt: tournament.completedAt?.toISOString() ?? null,
    players: players.map((p) => ({
      id: p.id,
      tournamentId: p.tournamentId,
      firstName: p.firstName,
      lastName: p.lastName,
      partnerName: p.partnerName ?? null,
      teamName: p.teamName ?? null,
      seed: p.seed,
      joinedAt: p.joinedAt.toISOString(),
      // playerToken intentionally omitted — never broadcast to all clients
    })),
    matches: matches.map((m) => ({
      ...m,
      completedAt: (m as any).completedAt?.toISOString?.() ?? null,
    })),
  };
}
