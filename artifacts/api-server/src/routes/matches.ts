import { Router, Request } from "express";
import { db, tournamentsTable, matchesTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { UpdateMatchBody, UndoLastMatchBody } from "@workspace/api-zod";
import { getTournamentFull } from "../lib/tournament-helpers";
import { broadcastTournamentUpdate } from "../lib/ws";

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
    (m) =>
      (m.nextWinnerMatchId === match.id && m.nextWinnerSlot === emptySlot) ||
      (m.nextLoserMatchId === match.id && m.nextLoserSlot === emptySlot)
  );
  // No source, or source is a ghost/bye that produced no winner → this will be a bye
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
 * In-memory cascade: advance winner and loser through the bracket, resolving
 * byes along the way.  Returns the set of changed matches so we can persist them.
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

    // ── Drop loser to LB (WB matches only, non-bye) ─────────────────────
    const isWB = match.bracket === "winner";
    const loser = loserId(match);
    if (isWB && !match.isBye && loser && match.nextLoserMatchId) {
      const lb = byId.get(match.nextLoserMatchId);
      if (lb) {
        fillSlot(lb, match.nextLoserSlot, loser);
        changed.add(lb.id);
        resolveMatch(lb);
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

      // ── Special handling for Grand Finals ────────────────────────────
      if (match.bracket === "grand_finals") {
        const wbSideId = match.playerOneId; // slot one = WB champion
        if (body.winnerId !== wbSideId) {
          // LB champion won → activate GF Reset
          const gfReset = allMatches.find((m) => m.bracket === "grand_finals_reset");
          if (gfReset) {
            gfReset.playerOneId = match.playerOneId; // WB champion
            gfReset.playerTwoId = match.playerTwoId; // LB champion
            gfReset.status = "active";
          }
          await saveMatches([match, ...(gfReset ? [gfReset] : [])]);
          const full = await getTournamentFull(tournamentId);
          if (full) broadcastTournamentUpdate(tournamentId, full);
          res.json(full);
          return;
        }
        // WB champion won → tournament over (fall through to completion check)
      }

      // ── Cascade winner/loser through bracket ─────────────────────────
      const changed = new Set<string>([matchId]);
      cascade(match, allMatches, changed);

      const toSave = allMatches.filter((m) => changed.has(m.id));
      await saveMatches(toSave);

      // ── Check tournament completion ───────────────────────────────────
      const finalMatch = allMatches.find(
        (m) => m.bracket === "grand_finals" || m.bracket === "grand_finals_reset"
      );
      // Tournament is complete when the final applicable match is done
      const gfReset = allMatches.find((m) => m.bracket === "grand_finals_reset");
      const gf = allMatches.find((m) => m.bracket === "grand_finals");

      let tournamentDone = false;
      if (gfReset && gfReset.status === "completed") {
        tournamentDone = true;
      } else if (gf && gf.status === "completed" && gfReset && gfReset.status !== "active") {
        // GF is done and GF Reset was never activated
        tournamentDone = true;
      }

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

    // Find the most recently completed non-bye match across all bracket types,
    // but skip GF Reset if GF is completed (undo GF Reset first, then GF)
    const gfReset = allMatches.find((m) => m.bracket === "grand_finals_reset");
    const gf = allMatches.find((m) => m.bracket === "grand_finals");

    let lastCompleted: typeof allMatches[0] | undefined;

    if (gfReset && gfReset.status === "completed") {
      lastCompleted = gfReset;
    } else if (gf && gf.status === "completed") {
      lastCompleted = gf;
    } else {
      // Find most recently completed regular match — prefer highest round/bracket depth
      lastCompleted = allMatches.find((m) => m.status === "completed" && !m.isBye && m.winnerId);
    }

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
      const nextWinner = allMatches.find((m) => m.id === lastCompleted!.nextWinnerMatchId);
      if (nextWinner) {
        if (lastCompleted.nextWinnerSlot === "one") nextWinner.playerOneId = null;
        else nextWinner.playerTwoId = null;
        nextWinner.winnerId = null;
        nextWinner.status = "pending";
        nextWinner.isBye = false;
        toSave.push(nextWinner);

        // If nextWinner was also completed (cascade), reset it too
        // (Rare — only if the match after was a bye that auto-advanced)
      }
    }

    // ── Clear the loser from the LB match (WB matches only) ───────────────
    if (lastCompleted.bracket === "winner" && lastCompleted.nextLoserMatchId) {
      const lbMatch = allMatches.find((m) => m.id === lastCompleted!.nextLoserMatchId);
      if (lbMatch) {
        if (lastCompleted.nextLoserSlot === "one") lbMatch.playerOneId = null;
        else lbMatch.playerTwoId = null;
        lbMatch.winnerId = null;
        lbMatch.isBye = false;
        lbMatch.status = lbMatch.playerOneId || lbMatch.playerTwoId ? "active" : "pending";
        toSave.push(lbMatch);
      }
    }

    // ── If GF Reset was active (LB won GF), deactivate it ────────────────
    if (lastCompleted.bracket === "grand_finals" && gfReset) {
      gfReset.playerOneId = null;
      gfReset.playerTwoId = null;
      gfReset.winnerId = null;
      gfReset.status = "pending";
      gfReset.isBye = false;
      toSave.push(gfReset);
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
    req.log.error({ err }, "Failed to undo last match" );
    res.status(500).json({ error: "Failed to undo last match" });
  }
});
