import { Router, Request } from "express";
import { randomUUID } from "crypto";
import { db, tournamentsTable, matchesTable, playersTable, openPlayPoolTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { UpdateMatchBody, UndoLastMatchBody } from "@workspace/api-zod";
import { getTournamentFull } from "../lib/tournament-helpers";
import { broadcastTournamentUpdate } from "../lib/ws";
import { computeElo } from "../lib/elo";

export const matchesRouter = Router({ mergeParams: true });

// ─── helpers ────────────────────────────────────────────────────────────────

type MatchRow = typeof matchesTable.$inferSelect;

/** Set a player into slot "one" or "two" of a match record (in place). */
function fillSlot(match: MatchRow, slot: string | null, playerId: string) {
  if (slot === "one") match.playerOneId = playerId;
  else if (slot === "two") match.playerTwoId = playerId;
}

/** Compute the loser of a completed match. */
function loserId(match: MatchRow): string | null {
  if (!match.winnerId) return null;
  return match.playerOneId === match.winnerId ? match.playerTwoId : match.playerOneId;
}

/**
 * After setting a player into a match, check whether it should immediately
 * auto-advance as a bye (only one real player, other slot will never be filled).
 */
function shouldBye(match: MatchRow, allMatches: MatchRow[]): boolean {
  const hasBoth = match.playerOneId && match.playerTwoId;
  if (hasBoth) return false;
  if (!match.playerOneId && !match.playerTwoId) return false; // ghost

  const emptySlot = match.playerOneId ? "two" : "one";
  const source = allMatches.find(
    (m) => m.nextWinnerMatchId === match.id && m.nextWinnerSlot === emptySlot
  );
  return !source || (source.isBye && !source.winnerId);
}

/**
 * Persist all in-memory match changes to the database.
 */
async function saveMatches(updates: MatchRow[]) {
  for (const m of updates) {
    await db
      .update(matchesTable)
      .set({
        playerOneId: m.playerOneId,
        playerTwoId: m.playerTwoId,
        winnerId: m.winnerId,
        scoreOne: m.scoreOne,
        scoreTwo: m.scoreTwo,
        status: m.status,
        isBye: m.isBye,
      })
      .where(eq(matchesTable.id, m.id));
  }
}

/**
 * In-memory cascade: advance winner through the bracket, resolving
 * byes along the way.  Returns the set of changed matches so we can persist them.
 * Single elimination — losers are eliminated (no loser bracket drop).
 */
function cascade(
  startMatch: MatchRow,
  allMatches: MatchRow[],
  changed: Set<string>
): void {
  const byId = new Map(allMatches.map((m) => [m.id, m]));

  function advance(match: MatchRow) {
    changed.add(match.id);

    // ── Advance winner ──────────────────────────────────────────────────
    if (match.winnerId && match.nextWinnerMatchId) {
      const next = byId.get(match.nextWinnerMatchId);
      if (next) {
        fillSlot(next, match.nextWinnerSlot, match.winnerId);
        changed.add(next.id);
        resolveMatch(next);
      }
    }
  }

  function resolveMatch(match: MatchRow) {
    if (match.status === "completed" || match.status === "bye") return;

    if (match.playerOneId && match.playerTwoId) {
      if (match.status !== "active") {
        match.status = "active";
        changed.add(match.id);
      }
      return;
    }

    if (shouldBye(match, allMatches)) {
      match.status = "bye";
      match.isBye = true;
      match.winnerId = match.playerOneId ?? match.playerTwoId ?? null;
      changed.add(match.id);
      advance(match);
    }
  }

  advance(startMatch);
}

// ─── PATCH /:matchId ─────────────────────────────────────────────────────────

matchesRouter.patch("/:matchId", async (req: Request<{ tournamentId: string; matchId: string }>, res) => {
  try {
    const body = UpdateMatchBody.parse(req.body);
    const { tournamentId, matchId } = req.params;

    const [tournament] = await db
      .select()
      .from(tournamentsTable)
      .where(eq(tournamentsTable.id, tournamentId));

    if (!tournament) { res.status(404).json({ error: "Tournament not found" }); return; }
    if (body.hostToken !== tournament.hostToken) { res.status(403).json({ error: "Invalid host token" }); return; }

    const allMatches = await db
      .select()
      .from(matchesTable)
      .where(eq(matchesTable.tournamentId, tournamentId));

    const match = allMatches.find((m) => m.id === matchId);
    if (!match) { res.status(404).json({ error: "Match not found" }); return; }
    if (match.status !== "active") { res.status(400).json({ error: "Match is not active" }); return; }

    // Apply the update
    if (body.scoreOne !== undefined) match.scoreOne = body.scoreOne;
    if (body.scoreTwo !== undefined) match.scoreTwo = body.scoreTwo;

    if (body.winnerId) {
      match.winnerId = body.winnerId;
      match.status = "completed";
      (match as any).completedAt = new Date();

      // ── ELO update for both players ───────────────────────────────────
      if (!match.isBye && match.playerOneId && match.playerTwoId) {
        const [p1, p2] = await Promise.all([
          db.select().from(playersTable).where(eq(playersTable.id, match.playerOneId)),
          db.select().from(playersTable).where(eq(playersTable.id, match.playerTwoId)),
        ]);
        const player1 = p1[0];
        const player2 = p2[0];
        if (player1 && player2) {
          const r1 = player1.eloRating ?? 1200;
          const r2 = player2.eloRating ?? 1200;
          const p1won = match.winnerId === player1.id;
          const { winnerDelta, loserDelta } = computeElo(p1won ? r1 : r2, p1won ? r2 : r1);
          await db.update(playersTable).set({ eloRating: Math.max(800, r1 + (p1won ? winnerDelta : loserDelta)) }).where(eq(playersTable.id, player1.id));
          await db.update(playersTable).set({ eloRating: Math.max(800, r2 + (p1won ? loserDelta : winnerDelta)) }).where(eq(playersTable.id, player2.id));
        }

        // ── Add loser to open play pool immediately (single elimination) ─
        const loserPlayerId = loserId(match);
        if (loserPlayerId) {
          const existing = await db.select().from(openPlayPoolTable)
            .where(and(eq(openPlayPoolTable.tournamentId, tournamentId), eq(openPlayPoolTable.playerId, loserPlayerId)));
          if (existing.length === 0) {
            await db.insert(openPlayPoolTable).values({
              id: randomUUID(),
              tournamentId,
              playerId: loserPlayerId,
              status: "available",
            });
          }
        }
      }

      // ── Cascade winner through bracket ────────────────────────────────
      const changed = new Set<string>([matchId]);
      cascade(match, allMatches, changed);

      const toSave = allMatches.filter((m) => changed.has(m.id));
      await saveMatches(toSave);

      // ── Check tournament completion ───────────────────────────────────
      // Tournament is done when the championship match (highest round, only 1 match) is completed
      const maxRound = Math.max(...allMatches.map((m) => m.round));
      const finalMatch = allMatches.find((m) => m.round === maxRound);
      const tournamentDone = finalMatch?.status === "completed";

      if (tournamentDone) {
        await db
          .update(tournamentsTable)
          .set({ status: "completed", completedAt: new Date() })
          .where(eq(tournamentsTable.id, tournamentId));
      }
    } else {
      // Score-only update
      await saveMatches([match]);
    }

    const full = await getTournamentFull(tournamentId);
    if (full) broadcastTournamentUpdate(tournamentId, full);
    res.json(full);
  } catch (err) {
    req.log.error({ err }, "Failed to update match");
    res.status(500).json({ error: "Failed to update match" });
  }
});

// ─── POST /undo ───────────────────────────────────────────────────────────────

matchesRouter.post("/undo", async (req: Request<{ tournamentId: string }>, res) => {
  try {
    const body = UndoLastMatchBody.parse(req.body);
    const { tournamentId } = req.params;

    const [tournament] = await db
      .select()
      .from(tournamentsTable)
      .where(eq(tournamentsTable.id, tournamentId));

    if (!tournament) { res.status(404).json({ error: "Tournament not found" }); return; }
    if (body.hostToken !== tournament.hostToken) { res.status(403).json({ error: "Invalid host token" }); return; }

    const allMatches = await db
      .select()
      .from(matchesTable)
      .where(eq(matchesTable.tournamentId, tournamentId))
      .orderBy(desc(matchesTable.round), desc(matchesTable.matchNumber));

    // Find the most recently completed non-bye match
    const lastCompleted = allMatches.find((m) => m.status === "completed" && !m.isBye && m.winnerId);

    if (!lastCompleted) { res.status(400).json({ error: "No completed matches to undo" }); return; }

    const toSave: typeof allMatches = [];

    // ── Reset the completed match ─────────────────────────────────────────
    lastCompleted.winnerId = null;
    lastCompleted.scoreOne = null;
    lastCompleted.scoreTwo = null;
    lastCompleted.status = "active";
    toSave.push(lastCompleted);

    // ── Clear the winner from the next match ──────────────────────────────
    if (lastCompleted.nextWinnerMatchId) {
      const nextWinner = allMatches.find((m) => m.id === lastCompleted.nextWinnerMatchId);
      if (nextWinner) {
        if (lastCompleted.nextWinnerSlot === "one") nextWinner.playerOneId = null;
        else nextWinner.playerTwoId = null;
        nextWinner.winnerId = null;
        nextWinner.status = "pending";
        nextWinner.isBye = false;
        toSave.push(nextWinner);
      }
    }

    // ── Remove loser from open play pool ──────────────────────────────────
    const loserPlayerId = lastCompleted.playerOneId === lastCompleted.winnerId
      ? lastCompleted.playerTwoId
      : lastCompleted.playerOneId;
    if (loserPlayerId) {
      await db.delete(openPlayPoolTable)
        .where(and(
          eq(openPlayPoolTable.tournamentId, tournamentId),
          eq(openPlayPoolTable.playerId, loserPlayerId)
        ));
    }

    // ── Revert tournament completion if needed ────────────────────────────
    if (tournament.status === "completed") {
      await db
        .update(tournamentsTable)
        .set({ status: "active", completedAt: null })
        .where(eq(tournamentsTable.id, tournamentId));
    }

    await saveMatches(toSave);

    const full = await getTournamentFull(tournamentId);
    if (full) broadcastTournamentUpdate(tournamentId, full);
    res.json(full);
  } catch (err) {
    req.log.error({ err }, "Failed to undo last match");
    res.status(500).json({ error: "Failed to undo last match" });
  }
});
