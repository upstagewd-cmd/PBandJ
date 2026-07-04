import { Router } from "express";
import { randomUUID } from "crypto";
import { db, tournamentsTable, playersTable, matchesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import {
  CreateTournamentBody,
  UpdateTournamentBody,
  StartTournamentBody,
  HostTokenInput,
} from "@workspace/api-zod";
import { generateBracket, advanceWinner } from "../lib/bracket";
import { getTournamentFull } from "../lib/tournament-helpers";
import { broadcastTournamentUpdate } from "../lib/ws";
import { logger } from "../lib/logger";

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
tournamentsRouter.get("/:tournamentId", async (req, res) => {
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
tournamentsRouter.patch("/:tournamentId", async (req, res) => {
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
tournamentsRouter.post("/:tournamentId/start", async (req, res) => {
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

    if (players.length < 2) {
      res.status(400).json({ error: "Need at least 2 players to start" });
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

    // Generate bracket
    const bracketMatches = generateBracket(tournamentId, shuffled.map((p, i) => ({ ...p, seed: i + 1 })));

    if (bracketMatches.length > 0) {
      await db.insert(matchesTable).values(bracketMatches);
    }

    // Update tournament status
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
tournamentsRouter.get("/:tournamentId/summary", async (req, res) => {
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
      .where(eq(matchesTable.tournamentId, tournamentId))
      .orderBy(desc(matchesTable.round), desc(matchesTable.matchNumber));

    const completedMatches = matches.filter((m) => m.status === "completed" || m.status === "bye");

    // Find champion: winner of last match (highest round)
    const finalMatch = matches.find((m) => {
      const maxRound = Math.max(...matches.map((x) => x.round));
      return m.round === maxRound;
    });

    const champion = players.find((p) => p.id === finalMatch?.winnerId) ?? null;

    // Runner-up: loser of the final match
    const runnerUpId = finalMatch
      ? finalMatch.playerOneId === finalMatch.winnerId
        ? finalMatch.playerTwoId
        : finalMatch.playerOneId
      : null;
    const runnerUp = players.find((p) => p.id === runnerUpId) ?? null;

    // Third place: find semifinal losers
    const maxRound = Math.max(...matches.map((m) => m.round));
    const semiFinals = matches.filter((m) => m.round === maxRound - 1);
    const semifinalLosers = semiFinals
      .map((m) => {
        const loserId = m.playerOneId === m.winnerId ? m.playerTwoId : m.playerOneId;
        return players.find((p) => p.id === loserId) ?? null;
      })
      .filter(Boolean);
    const thirdPlace = semifinalLosers[0] ?? null;

    const durationMinutes =
      tournament.startedAt && tournament.completedAt
        ? Math.round(
            (tournament.completedAt.getTime() - tournament.startedAt.getTime()) / 60000
          )
        : null;

    res.json({
      tournamentId,
      champion,
      runnerUp,
      thirdPlace,
      totalMatches: completedMatches.length,
      playerCount: players.length,
      durationMinutes,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get tournament summary");
    res.status(500).json({ error: "Failed to get tournament summary" });
  }
});
