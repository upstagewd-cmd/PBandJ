import { Router, Request } from "express";
import { randomUUID } from "crypto";
import { db, tournamentsTable, playersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { JoinTournamentBody, ShufflePlayersBody, RemovePlayerBody } from "@workspace/api-zod";
import { getTournamentFull } from "../lib/tournament-helpers";
import { broadcastTournamentUpdate } from "../lib/ws";

export const playersRouter = Router({ mergeParams: true });

// POST /api/tournaments/:tournamentId/players
playersRouter.post("/", async (req: Request<{ tournamentId: string }>, res) => {
  try {
    const body = JoinTournamentBody.parse(req.body);
    const { tournamentId } = req.params;

    const [tournament] = await db
      .select()
      .from(tournamentsTable)
      .where(eq(tournamentsTable.id, tournamentId));

    if (!tournament) {
      res.status(404).json({ error: "Tournament not found" });
      return;
    }

    if (tournament.registrationLocked) {
      res.status(400).json({ error: "Registration is locked" });
      return;
    }

    if (tournament.status !== "lobby") {
      res.status(400).json({ error: "Tournament has already started" });
      return;
    }

    const existingPlayers = await db
      .select()
      .from(playersTable)
      .where(eq(playersTable.tournamentId, tournamentId));

    if (existingPlayers.length >= 64) {
      res.status(400).json({ error: "Tournament is full (max 64 players)" });
      return;
    }

    const id = randomUUID();
    const player = {
      id,
      tournamentId,
      firstName: body.firstName,
      lastName: body.lastName,
      seed: existingPlayers.length + 1,
    };

    await db.insert(playersTable).values(player);

    const full = await getTournamentFull(tournamentId);
    if (full) broadcastTournamentUpdate(tournamentId, full);

    res.status(201).json({
      ...player,
      joinedAt: new Date().toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to join tournament");
    res.status(500).json({ error: "Failed to join tournament" });
  }
});

// POST /api/tournaments/:tournamentId/players/shuffle
playersRouter.post("/shuffle", async (req: Request<{ tournamentId: string }>, res) => {
  try {
    const body = ShufflePlayersBody.parse(req.body);
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

    const players = await db
      .select()
      .from(playersTable)
      .where(eq(playersTable.tournamentId, tournamentId));

    const shuffled = [...players].sort(() => Math.random() - 0.5);

    for (let i = 0; i < shuffled.length; i++) {
      await db
        .update(playersTable)
        .set({ seed: i + 1 })
        .where(eq(playersTable.id, shuffled[i].id));
    }

    const updatedPlayers = shuffled.map((p, i) => ({
      ...p,
      seed: i + 1,
      joinedAt: p.joinedAt.toISOString(),
    }));

    const full = await getTournamentFull(tournamentId);
    if (full) broadcastTournamentUpdate(tournamentId, full);

    res.json(updatedPlayers);
  } catch (err) {
    req.log.error({ err }, "Failed to shuffle players");
    res.status(500).json({ error: "Failed to shuffle players" });
  }
});

// DELETE /api/tournaments/:tournamentId/players/:playerId
playersRouter.delete("/:playerId", async (req: Request<{ tournamentId: string; playerId: string }>, res) => {
  try {
    const body = RemovePlayerBody.parse(req.body);
    const { tournamentId, playerId } = req.params;

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

    const [player] = await db
      .select()
      .from(playersTable)
      .where(eq(playersTable.id, playerId));

    if (!player) {
      res.status(404).json({ error: "Player not found" });
      return;
    }

    await db.delete(playersTable).where(eq(playersTable.id, playerId));

    const full = await getTournamentFull(tournamentId);
    if (full) broadcastTournamentUpdate(tournamentId, full);

    res.json({ ...player, joinedAt: player.joinedAt.toISOString() });
  } catch (err) {
    req.log.error({ err }, "Failed to remove player");
    res.status(500).json({ error: "Failed to remove player" });
  }
});
