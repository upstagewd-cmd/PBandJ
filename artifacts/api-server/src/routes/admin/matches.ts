import { Router } from "express";
import { db } from "@workspace/db";
import {
  matchesTable,
  openPlayMatchesTable,
  sessionMatchesTable,
  sessionPlayersTable,
  sessionsTable,
  playersTable,
  teamsTable,
  tournamentsTable,
} from "@workspace/db/schema";
import { eq, desc, inArray } from "drizzle-orm";
import { autoAwardBadgesForPlayers } from "../../lib/badge-awards";
import { broadcastBadgeUnlocked, broadcastMatchDeleted } from "../../lib/ws";

export const adminMatchesRouter = Router();

async function getBracketMatchPlayerIds(match: typeof matchesTable.$inferSelect) {
  const sideIds = [match.playerOneId, match.playerTwoId].filter(Boolean) as string[];
  if (sideIds.length === 0) return [] as string[];

  const teams = await db.select().from(teamsTable).where(inArray(teamsTable.id, sideIds));
  const teamById = new Map(teams.map((team) => [team.id, team]));

  const ids = new Set<string>();
  for (const sideId of sideIds) {
    const team = teamById.get(sideId);
    if (team) {
      if (team.player1Id) ids.add(team.player1Id);
      if (team.player2Id) ids.add(team.player2Id);
    } else {
      ids.add(sideId);
    }
  }
  return [...ids];
}

adminMatchesRouter.get("/", async (req, res) => {
  const bracket = await db
    .select({
      match: matchesTable,
      tournament: { id: tournamentsTable.id, name: tournamentsTable.name },
    })
    .from(matchesTable)
    .leftJoin(tournamentsTable, eq(matchesTable.tournamentId, tournamentsTable.id))
    .orderBy(desc(matchesTable.completedAt));

  const openPlay = await db
    .select({
      match: openPlayMatchesTable,
      tournament: { id: tournamentsTable.id, name: tournamentsTable.name },
    })
    .from(openPlayMatchesTable)
    .leftJoin(tournamentsTable, eq(openPlayMatchesTable.tournamentId, tournamentsTable.id))
    .orderBy(desc(openPlayMatchesTable.playedAt));

  const sessionOpenPlay = await db
    .select({
      match: sessionMatchesTable,
      session: { id: sessionsTable.id, name: sessionsTable.name },
    })
    .from(sessionMatchesTable)
    .leftJoin(sessionsTable, eq(sessionMatchesTable.sessionId, sessionsTable.id))
    .orderBy(desc(sessionMatchesTable.playedAt));

  const mergedOpenPlay = [
    ...openPlay.map((row) => ({
      sourceType: "open_play_tournament" as const,
      match: row.match,
      tournament: row.tournament,
    })),
    ...sessionOpenPlay.map((row) => ({
      sourceType: "open_play_session" as const,
      match: {
        id: row.match.id,
        tournamentId: row.match.sessionId,
        winnerTeam: row.match.winnerTeam,
        scoreOne: row.match.scoreOne,
        scoreTwo: row.match.scoreTwo,
        playedAt: row.match.playedAt,
      },
      tournament: row.session,
    })),
  ].sort((a, b) => b.match.playedAt.getTime() - a.match.playedAt.getTime());

  const [allTournaments, allSessions] = await Promise.all([
    db
      .select({
        id: tournamentsTable.id,
        name: tournamentsTable.name,
        status: tournamentsTable.status,
        createdAt: tournamentsTable.createdAt,
      })
      .from(tournamentsTable)
      .orderBy(desc(tournamentsTable.createdAt)),
    db
      .select({
        id: sessionsTable.id,
        name: sessionsTable.name,
        status: sessionsTable.status,
        createdAt: sessionsTable.createdAt,
      })
      .from(sessionsTable)
      .orderBy(desc(sessionsTable.createdAt)),
  ]);

  const tournamentPlayerCounts = allTournaments.length
    ? await Promise.all(
        allTournaments.map(async (tournament) => {
          const rows = await db
            .select({ id: playersTable.id })
            .from(playersTable)
            .where(eq(playersTable.tournamentId, tournament.id));
          return [tournament.id, rows.length] as const;
        }),
      )
    : [];

  const sessionPlayerCounts = allSessions.length
    ? await Promise.all(
        allSessions.map(async (session) => {
          const rows = await db
            .select({ id: sessionPlayersTable.id })
            .from(sessionPlayersTable)
            .where(eq(sessionPlayersTable.sessionId, session.id));
          return [session.id, rows.length] as const;
        }),
      )
    : [];

  const tournamentCountsMap = new Map(tournamentPlayerCounts);
  const sessionCountsMap = new Map(sessionPlayerCounts);

  const liveOpen = [
    ...allTournaments.map((tournament) => ({
      id: tournament.id,
      type: "tournament" as const,
      name: tournament.name,
      href: `/t/${tournament.id}`,
      statusLabel: tournament.status,
      playerCount: tournamentCountsMap.get(tournament.id) ?? 0,
      createdAt: tournament.createdAt.toISOString(),
    })),
    ...allSessions.map((session) => ({
      id: session.id,
      type: "open_play" as const,
      name: session.name,
      href: `/s/${session.id}`,
      statusLabel: session.status,
      playerCount: sessionCountsMap.get(session.id) ?? 0,
      createdAt: session.createdAt.toISOString(),
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  res.json({ bracket, openPlay: mergedOpenPlay, liveOpen });
});

adminMatchesRouter.patch("/:matchId", async (req, res) => {
  const { matchId } = req.params;
  const { winnerId, scoreOne, scoreTwo, playerOneId, playerTwoId } =
    req.body as Record<string, unknown>;

  const updates: Record<string, unknown> = {};
  if (winnerId !== undefined) updates.winnerId = winnerId;
  if (scoreOne !== undefined) updates.scoreOne = scoreOne === null ? null : Number(scoreOne);
  if (scoreTwo !== undefined) updates.scoreTwo = scoreTwo === null ? null : Number(scoreTwo);
  if (playerOneId !== undefined) updates.playerOneId = playerOneId;
  if (playerTwoId !== undefined) updates.playerTwoId = playerTwoId;
  if (winnerId !== undefined) updates.status = "completed";

  const [updated] = await db
    .update(matchesTable)
    .set(updates)
    .where(eq(matchesTable.id, matchId))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Match not found" });
    return;
  }

  const playerIds = await getBracketMatchPlayerIds(updated);
  if (playerIds.length > 0) {
    const awards = await autoAwardBadgesForPlayers(playerIds);
    broadcastBadgeUnlocked(updated.tournamentId, awards);
  }

  res.json(updated);
});

adminMatchesRouter.delete("/:matchId", async (req, res) => {
  const { matchId } = req.params;
  const { type } = req.query as { type?: string };

  if (type === "open_play") {
    const [deleted] = await db
      .delete(openPlayMatchesTable)
      .where(eq(openPlayMatchesTable.id, matchId))
      .returning();
    if (!deleted) {
      res.status(404).json({ error: "Match not found" });
      return;
    }
    broadcastMatchDeleted(deleted.tournamentId, matchId);
  } else if (type === "open_play_session") {
    const [deleted] = await db
      .delete(sessionMatchesTable)
      .where(eq(sessionMatchesTable.id, matchId))
      .returning();
    if (!deleted) {
      res.status(404).json({ error: "Match not found" });
      return;
    }
  } else {
    const [deleted] = await db
      .delete(matchesTable)
      .where(eq(matchesTable.id, matchId))
      .returning();
    if (!deleted) {
      res.status(404).json({ error: "Match not found" });
      return;
    }
    broadcastMatchDeleted(deleted.tournamentId, matchId);
  }
  res.json({ ok: true });
});

adminMatchesRouter.patch("/open-play/:matchId", async (req, res) => {
  const { matchId } = req.params;
  const { winnerTeam, scoreOne, scoreTwo, sourceType } = req.body as Record<string, unknown>;

  const updates: Record<string, unknown> = {};
  if (winnerTeam !== undefined) updates.winnerTeam = Number(winnerTeam);
  if (scoreOne !== undefined) updates.scoreOne = scoreOne === null ? null : Number(scoreOne);
  if (scoreTwo !== undefined) updates.scoreTwo = scoreTwo === null ? null : Number(scoreTwo);

  if (sourceType === "open_play_session") {
    const [updated] = await db
      .update(sessionMatchesTable)
      .set(updates)
      .where(eq(sessionMatchesTable.id, matchId))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Match not found" });
      return;
    }

    res.json(updated);
    return;
  }

  const [updated] = await db
    .update(openPlayMatchesTable)
    .set(updates)
    .where(eq(openPlayMatchesTable.id, matchId))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Match not found" });
    return;
  }

  const playerIds = [
    updated.teamOnePOneId,
    updated.teamOnePTwoId,
    updated.teamTwoPOneId,
    updated.teamTwoPTwoId,
  ].filter(Boolean) as string[];
  if (playerIds.length > 0) {
    const awards = await autoAwardBadgesForPlayers(playerIds);
    broadcastBadgeUnlocked(updated.tournamentId, awards);
  }

  res.json(updated);
});
