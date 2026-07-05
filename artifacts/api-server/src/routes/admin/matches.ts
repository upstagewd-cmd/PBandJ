import { Router } from "express";
import { db } from "@workspace/db";
import {
  matchesTable,
  openPlayMatchesTable,
  playersTable,
  tournamentsTable,
} from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { broadcastMatchDeleted } from "../../lib/ws";

export const adminMatchesRouter = Router();

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

  res.json({ bracket, openPlay });
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
  const { winnerTeam, scoreOne, scoreTwo } = req.body as Record<string, unknown>;

  const updates: Record<string, unknown> = {};
  if (winnerTeam !== undefined) updates.winnerTeam = Number(winnerTeam);
  if (scoreOne !== undefined) updates.scoreOne = scoreOne === null ? null : Number(scoreOne);
  if (scoreTwo !== undefined) updates.scoreTwo = scoreTwo === null ? null : Number(scoreTwo);

  const [updated] = await db
    .update(openPlayMatchesTable)
    .set(updates)
    .where(eq(openPlayMatchesTable.id, matchId))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Match not found" });
    return;
  }
  res.json(updated);
});
