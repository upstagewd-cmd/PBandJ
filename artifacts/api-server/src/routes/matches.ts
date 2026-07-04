import { Router, Request } from "express";
import { db, tournamentsTable, matchesTable, playersTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { UpdateMatchBody, UndoLastMatchBody } from "@workspace/api-zod";
import { getTournamentFull } from "../lib/tournament-helpers";
import { broadcastTournamentUpdate } from "../lib/ws";

export const matchesRouter = Router({ mergeParams: true });

// PATCH /api/tournaments/:tournamentId/matches/:matchId
matchesRouter.patch("/:matchId", async (req: Request<{ tournamentId: string; matchId: string }>, res) => {
  try {
    const body = UpdateMatchBody.parse(req.body);
    const { tournamentId, matchId } = req.params;

    const [tournament] = await db
      .select()
      .from(tournamentsTable)
      .where(eq(tournamentsTable.id, tournamentId));

    if (!tournament) {
      res.status(404).json({ error: "Tournament not found" });
      return;
    }

    if (body.hostToken !== tournament.hostToken) {
      res.status(403).json({ error: "Invalid host token" });
      return;
    }

    const [match] = await db
      .select()
      .from(matchesTable)
      .where(and(eq(matchesTable.id, matchId), eq(matchesTable.tournamentId, tournamentId)));

    if (!match) {
      res.status(404).json({ error: "Match not found" });
      return;
    }

    const updates: Partial<typeof match> = {};
    if (body.winnerId !== undefined) updates.winnerId = body.winnerId;
    if (body.scoreOne !== undefined) updates.scoreOne = body.scoreOne;
    if (body.scoreTwo !== undefined) updates.scoreTwo = body.scoreTwo;
    if (body.winnerId !== undefined) updates.status = "completed";

    await db.update(matchesTable).set(updates).where(eq(matchesTable.id, matchId));

    // If a winner was set, advance them to next round
    if (body.winnerId) {
      const updatedMatch = { ...match, ...updates };
      const allMatches = await db
        .select()
        .from(matchesTable)
        .where(eq(matchesTable.tournamentId, tournamentId));

      // Find next match in next round
      const nextRound = match.round + 1;
      const nextMatchNumber = Math.ceil(match.matchNumber / 2);
      const isPlayerOneSlot = match.matchNumber % 2 === 1;

      const [nextMatch] = await db
        .select()
        .from(matchesTable)
        .where(
          and(
            eq(matchesTable.tournamentId, tournamentId),
            eq(matchesTable.round, nextRound),
            eq(matchesTable.matchNumber, nextMatchNumber)
          )
        );

      if (nextMatch) {
        const nextUpdates: Partial<typeof nextMatch> = {};
        if (isPlayerOneSlot) {
          nextUpdates.playerOneId = body.winnerId;
        } else {
          nextUpdates.playerTwoId = body.winnerId;
        }

        // Check if both players are now set
        const updatedNextP1 = isPlayerOneSlot ? body.winnerId : nextMatch.playerOneId;
        const updatedNextP2 = isPlayerOneSlot ? nextMatch.playerTwoId : body.winnerId;

        if (updatedNextP1 && updatedNextP2) {
          nextUpdates.status = "active";
        } else {
          // Check if it should be a bye (other slot won't be filled)
          const siblingMatchNum = isPlayerOneSlot ? match.matchNumber + 1 : match.matchNumber - 1;
          const [siblingMatch] = await db
            .select()
            .from(matchesTable)
            .where(
              and(
                eq(matchesTable.tournamentId, tournamentId),
                eq(matchesTable.round, match.round),
                eq(matchesTable.matchNumber, siblingMatchNum)
              )
            );

          if (!siblingMatch) {
            // No sibling - this is a bye
            nextUpdates.status = "bye";
            nextUpdates.isBye = true;
            nextUpdates.winnerId = body.winnerId;
          }
        }

        await db.update(matchesTable).set(nextUpdates).where(eq(matchesTable.id, nextMatch.id));
      }

      // Check if tournament is complete (all matches in final round done)
      const allTournamentMatches = await db
        .select()
        .from(matchesTable)
        .where(eq(matchesTable.tournamentId, tournamentId));

      const maxRound = Math.max(...allTournamentMatches.map((m) => m.round));
      const finalMatches = allTournamentMatches.filter((m) => m.round === maxRound);
      const allDone = finalMatches.every((m) => m.status === "completed" || m.status === "bye");

      if (allDone && finalMatches.length > 0) {
        await db.update(tournamentsTable).set({
          status: "completed",
          completedAt: new Date(),
        }).where(eq(tournamentsTable.id, tournamentId));
      }
    }

    const full = await getTournamentFull(tournamentId);
    if (full) broadcastTournamentUpdate(tournamentId, full);

    res.json(full);
  } catch (err) {
    req.log.error({ err }, "Failed to update match");
    res.status(500).json({ error: "Failed to update match" });
  }
});

// POST /api/tournaments/:tournamentId/matches/undo
matchesRouter.post("/undo", async (req: Request<{ tournamentId: string }>, res) => {
  try {
    const body = UndoLastMatchBody.parse(req.body);
    const { tournamentId } = req.params;

    const [tournament] = await db
      .select()
      .from(tournamentsTable)
      .where(eq(tournamentsTable.id, tournamentId));

    if (!tournament) {
      res.status(404).json({ error: "Tournament not found" });
      return;
    }

    if (body.hostToken !== tournament.hostToken) {
      res.status(403).json({ error: "Invalid host token" });
      return;
    }

    // Find the last completed match (highest round + match number)
    const allMatches = await db
      .select()
      .from(matchesTable)
      .where(eq(matchesTable.tournamentId, tournamentId))
      .orderBy(desc(matchesTable.round), desc(matchesTable.matchNumber));

    const lastCompleted = allMatches.find(
      (m) => m.status === "completed" && m.winnerId !== null
    );

    if (!lastCompleted) {
      res.status(400).json({ error: "No completed matches to undo" });
      return;
    }

    // Reset the match
    await db
      .update(matchesTable)
      .set({ winnerId: null, scoreOne: null, scoreTwo: null, status: "active" })
      .where(eq(matchesTable.id, lastCompleted.id));

    // Clear the winner from the next round match
    const nextRound = lastCompleted.round + 1;
    const nextMatchNumber = Math.ceil(lastCompleted.matchNumber / 2);
    const isPlayerOneSlot = lastCompleted.matchNumber % 2 === 1;

    const [nextMatch] = await db
      .select()
      .from(matchesTable)
      .where(
        and(
          eq(matchesTable.tournamentId, tournamentId),
          eq(matchesTable.round, nextRound),
          eq(matchesTable.matchNumber, nextMatchNumber)
        )
      );

    if (nextMatch) {
      const clearUpdates: Partial<typeof nextMatch> = {
        winnerId: null,
        status: "pending",
        isBye: false,
      };
      if (isPlayerOneSlot) {
        clearUpdates.playerOneId = null;
      } else {
        clearUpdates.playerTwoId = null;
      }

      await db.update(matchesTable).set(clearUpdates).where(eq(matchesTable.id, nextMatch.id));
    }

    // If tournament was completed, revert to active
    if (tournament.status === "completed") {
      await db
        .update(tournamentsTable)
        .set({ status: "active", completedAt: null })
        .where(eq(tournamentsTable.id, tournamentId));
    }

    const full = await getTournamentFull(tournamentId);
    if (full) broadcastTournamentUpdate(tournamentId, full);

    res.json(full);
  } catch (err) {
    req.log.error({ err }, "Failed to undo last match");
    res.status(500).json({ error: "Failed to undo last match" });
  }
});
