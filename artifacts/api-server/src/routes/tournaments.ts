import { Router, Request } from "express";
import { randomUUID } from "crypto";
import { db, tournamentsTable, playersTable, matchesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import {
  CreateTournamentBody,
  UpdateTournamentBody,
  StartTournamentBody,
} from "@workspace/api-zod";
import { generateDoubleEliminationBracket } from "../lib/bracket";
import { getTournamentFull } from "../lib/tournament-helpers";
import { broadcastTournamentUpdate } from "../lib/ws";

export const tournamentsRouter = Router();

function generateTournamentId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let id = "";
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

// POST /api/tournaments
tournamentsRouter.post("/", async (req, res) => {
  try {
    const body = CreateTournamentBody.parse(req.body ?? {});
    const id = generateTournamentId();
    const hostToken = randomUUID();

    await db.insert(tournamentsTable).values({
      id,
      name: body.name ?? "My Tournament",
      hostToken,
      status: "lobby",
      registrationLocked: false,
    });

    res.status(201).json({
      id,
      name: body.name ?? "My Tournament",
      status: "lobby",
      registrationLocked: false,
      createdAt: new Date().toISOString(),
      hostToken,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to create tournament");
    res.status(500).json({ error: "Failed to create tournament" });
  }
});

// GET /api/tournaments/:tournamentId
tournamentsRouter.get("/:tournamentId", async (req: Request<{ tournamentId: string }>, res) => {
  try {
    const full = await getTournamentFull(req.params.tournamentId);
    if (!full) {
      res.status(404).json({ error: "Tournament not found" });
      return;
    }
    res.json(full);
  } catch (err) {
    req.log.error({ err }, "Failed to get tournament");
    res.status(500).json({ error: "Failed to get tournament" });
  }
});

// PATCH /api/tournaments/:tournamentId
tournamentsRouter.patch("/:tournamentId", async (req: Request<{ tournamentId: string }>, res) => {
  try {
    const body = UpdateTournamentBody.parse(req.body);
    const { tournamentId } = req.params;

    const [existing] = await db
      .select()
      .from(tournamentsTable)
      .where(eq(tournamentsTable.id, tournamentId));

    if (!existing) {
      res.status(404).json({ error: "Tournament not found" });
      return;
    }

    if (body.hostToken && body.hostToken !== existing.hostToken) {
      res.status(403).json({ error: "Invalid host token" });
      return;
    }

    const updates: Partial<typeof existing> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.registrationLocked !== undefined) updates.registrationLocked = body.registrationLocked;

    if (Object.keys(updates).length > 0) {
      await db.update(tournamentsTable).set(updates).where(eq(tournamentsTable.id, tournamentId));
    }

    const updated = { ...existing, ...updates };
    const full = await getTournamentFull(tournamentId);
    if (full) broadcastTournamentUpdate(tournamentId, full);

    res.json({
      id: updated.id,
      name: updated.name,
      status: updated.status,
      registrationLocked: updated.registrationLocked,
      createdAt: updated.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to update tournament");
    res.status(500).json({ error: "Failed to update tournament" });
  }
});

// POST /api/tournaments/:tournamentId/start
tournamentsRouter.post("/:tournamentId/start", async (req: Request<{ tournamentId: string }>, res) => {
  try {
    const body = StartTournamentBody.parse(req.body);
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
    if (tournament.status !== "lobby") {
      res.status(400).json({ error: "Tournament already started" });
      return;
    }

    const players = await db
      .select()
      .from(playersTable)
      .where(eq(playersTable.tournamentId, tournamentId));

    if (players.length < 4) {
      res.status(400).json({ error: "Double elimination requires at least 4 players" });
      return;
    }

    // Randomly seed players
    const shuffled = [...players].sort(() => Math.random() - 0.5);
    for (let i = 0; i < shuffled.length; i++) {
      await db
        .update(playersTable)
        .set({ seed: i + 1 })
        .where(eq(playersTable.id, shuffled[i].id));
    }

    // Generate double-elimination bracket
    const seededPlayers = shuffled.map((p, i) => ({ id: p.id, seed: i + 1 }));
    const bracketMatches = generateDoubleEliminationBracket(tournamentId, seededPlayers);

    if (bracketMatches.length > 0) {
      await db.insert(matchesTable).values(bracketMatches);
    }

    await db.update(tournamentsTable).set({
      status: "active",
      registrationLocked: true,
      startedAt: new Date(),
    }).where(eq(tournamentsTable.id, tournamentId));

    const full = await getTournamentFull(tournamentId);
    if (full) broadcastTournamentUpdate(tournamentId, full);
    res.json(full);
  } catch (err) {
    req.log.error({ err }, "Failed to start tournament");
    res.status(500).json({ error: "Failed to start tournament" });
  }
});

// GET /api/tournaments/:tournamentId/summary
tournamentsRouter.get("/:tournamentId/summary", async (req: Request<{ tournamentId: string }>, res) => {
  try {
    const { tournamentId } = req.params;

    const [tournament] = await db
      .select()
      .from(tournamentsTable)
      .where(eq(tournamentsTable.id, tournamentId));

    if (!tournament) {
      res.status(404).json({ error: "Tournament not found" });
      return;
    }

    const players = await db
      .select()
      .from(playersTable)
      .where(eq(playersTable.tournamentId, tournamentId));

    const matches = await db
      .select()
      .from(matchesTable)
      .where(eq(matchesTable.tournamentId, tournamentId));

    // Champion: winner of the last completed final match
    const gfReset = matches.find((m) => m.bracket === "grand_finals_reset" && m.status === "completed");
    const gf = matches.find((m) => m.bracket === "grand_finals" && m.status === "completed");

    const finalMatch = gfReset ?? gf;
    const champion = players.find((p) => p.id === finalMatch?.winnerId) ?? null;

    // Runner-up: loser of the last final match
    const runnerUpId = finalMatch
      ? finalMatch.playerOneId === finalMatch.winnerId
        ? finalMatch.playerTwoId
        : finalMatch.playerOneId
      : null;
    const runnerUp = players.find((p) => p.id === runnerUpId) ?? null;

    // Third place: player who lost GF in WB bracket side (lost in WB Finals or LB semi)
    // In double elim: third is the player who lost the LB Finals (if GF reset was played),
    // or lost in WB if the GF reset player came from there.
    // Simplest: find the loser of the WB Finals match
    const wbFinals = matches.find(
      (m) => m.bracket === "winner" && matches.filter((x) => x.bracket === "winner").every((x) => x.round <= m.round)
    );
    const wbFinalsLoserSide = wbFinals
      ? wbFinals.playerOneId === wbFinals.winnerId
        ? wbFinals.playerTwoId
        : wbFinals.playerOneId
      : null;
    // But the WB Finals loser dropped to LB and became the LB finalist — they're actually runner-up or champion
    // True "third" in double elim is the player who lost LB Finals (if gfReset played) or WB Finals loser who lost LB Finals
    const lbFinals = matches.find((m) => m.bracket === "loser" && m.status === "completed" && m.nextWinnerMatchId === gf?.id);
    const lbFinalsLoserSide = lbFinals
      ? lbFinals.playerOneId === lbFinals.winnerId
        ? lbFinals.playerTwoId
        : lbFinals.playerOneId
      : null;
    const thirdPlace = players.find((p) => p.id === lbFinalsLoserSide) ?? null;

    const completedMatches = matches.filter((m) => m.status === "completed" && !m.isBye);

    const durationMinutes =
      tournament.startedAt && tournament.completedAt
        ? Math.round((tournament.completedAt.getTime() - tournament.startedAt.getTime()) / 60000)
        : null;

    res.json({
      tournamentId,
      champion: champion ? { ...champion, joinedAt: champion.joinedAt.toISOString() } : null,
      runnerUp: runnerUp ? { ...runnerUp, joinedAt: runnerUp.joinedAt.toISOString() } : null,
      thirdPlace: thirdPlace ? { ...thirdPlace, joinedAt: thirdPlace.joinedAt.toISOString() } : null,
      totalMatches: completedMatches.length,
      playerCount: players.length,
      durationMinutes,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get tournament summary");
    res.status(500).json({ error: "Failed to get tournament summary" });
  }
});
