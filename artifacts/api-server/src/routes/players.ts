import { Router, Request } from "express";
import { randomUUID } from "crypto";
import { getAuth } from "@clerk/express";
import { db, tournamentsTable, playersTable, openPlayPoolTable, userProfilesTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import {
  JoinTournamentBody,
  ShufflePlayersBody,
  RemovePlayerBody,
  UpdatePlayerBody,
} from "@workspace/api-zod";
import { getTournamentFull } from "../lib/tournament-helpers";
import { broadcastTournamentUpdate } from "../lib/ws";
import { getRank } from "../lib/ranks";

export const playersRouter = Router({ mergeParams: true });

function serializePlayer(p: typeof playersTable.$inferSelect, includeToken?: boolean) {
  const rank = getRank(p.eloRating ?? 1200);
  return {
    id: p.id,
    tournamentId: p.tournamentId,
    firstName: p.firstName,
    lastName: p.lastName,
    partnerName: p.partnerName ?? null,
    teamName: p.teamName ?? null,
    avatarUrl: p.avatarUrl ?? null,
    eloRating: p.eloRating ?? 1200,
    rankTitle: rank.title,
    rankEmoji: rank.emoji,
    seed: p.seed,
    joinedAt: p.joinedAt.toISOString(),
    ...(includeToken ? { playerToken: p.playerToken } : {}),
  };
}

// POST /api/tournaments/:tournamentId/players
playersRouter.post("/", async (req: Request<{ tournamentId: string }>, res) => {
  try {
    const body = JoinTournamentBody.parse(req.body);
    const { tournamentId } = req.params;

    const [tournament] = await db.select().from(tournamentsTable).where(eq(tournamentsTable.id, tournamentId));
    if (!tournament) { res.status(404).json({ error: "Tournament not found" }); return; }
    if (tournament.registrationLocked) { res.status(400).json({ error: "Registration is locked" }); return; }
    if (tournament.status !== "lobby") { res.status(400).json({ error: "Tournament has already started" }); return; }

    const existingPlayers = await db.select().from(playersTable).where(eq(playersTable.tournamentId, tournamentId));
    if (existingPlayers.length >= 64) { res.status(400).json({ error: "Tournament is full (max 64 players)" }); return; }

    const id = randomUUID();
    const playerToken = randomUUID();

    const teamName = body.teamName || null;

    const auth = getAuth(req);
    const clerkUserId = auth?.userId ?? null;

    // Determine starting ELO: carry over existing rating for returning Clerk users,
    // otherwise seed from self-reported skill level
    const SKILL_ELO: Record<string, number> = { beginner: 1000, intermediate: 1500, advanced: 2000 };
    let startingElo = body.skillLevel ? (SKILL_ELO[body.skillLevel] ?? 1200) : 1200;

    if (clerkUserId) {
      const previous = await db
        .select({ eloRating: playersTable.eloRating })
        .from(playersTable)
        .where(eq(playersTable.clerkUserId, clerkUserId))
        .orderBy(desc(playersTable.joinedAt))
        .limit(5);
      if (previous.length > 0) {
        // Use average of their recent ELO ratings to smooth variance
        startingElo = Math.round(
          previous.reduce((sum, p) => sum + (p.eloRating ?? 1200), 0) / previous.length
        );
      }
    }

    const playerRow = {
      id,
      tournamentId,
      firstName: body.firstName,
      lastName: body.lastName,
      partnerName: body.partnerName ?? null,
      teamName,
      playerToken,
      avatarUrl: null as string | null,
      clerkUserId,
      skillLevel: body.skillLevel ?? null,
      eloRating: startingElo,
      seed: existingPlayers.length + 1,
    };

    await db.insert(playersTable).values(playerRow);

    const full = await getTournamentFull(tournamentId);
    if (full) broadcastTournamentUpdate(tournamentId, full);

    res.status(201).json({
      ...serializePlayer({ ...playerRow, joinedAt: new Date() }),
      playerToken,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to join tournament");
    res.status(500).json({ error: "Failed to join tournament" });
  }
});

// PATCH /api/tournaments/:tournamentId/players/:playerId
playersRouter.patch("/:playerId", async (req: Request<{ tournamentId: string; playerId: string }>, res) => {
  try {
    const body = UpdatePlayerBody.parse(req.body);
    const { tournamentId, playerId } = req.params;

    const [player] = await db.select().from(playersTable).where(eq(playersTable.id, playerId));
    if (!player) { res.status(404).json({ error: "Player not found" }); return; }

    // Accept either the player's own token or the host token
    if (body.playerToken) {
      if (player.playerToken !== body.playerToken) { res.status(403).json({ error: "Invalid player token" }); return; }
    } else if (body.hostToken) {
      const [tournament] = await db.select().from(tournamentsTable).where(eq(tournamentsTable.id, tournamentId));
      if (!tournament || tournament.hostToken !== body.hostToken) { res.status(403).json({ error: "Invalid host token" }); return; }
    } else {
      res.status(403).json({ error: "playerToken or hostToken required" }); return;
    }

    const updates: Partial<typeof player> = {};
    if (body.teamName !== undefined) updates.teamName = body.teamName || null;
    if (body.avatarUrl !== undefined) updates.avatarUrl = body.avatarUrl || null;

    if (Object.keys(updates).length > 0) {
      await db.update(playersTable).set(updates).where(eq(playersTable.id, playerId));
    }

    const updated = { ...player, ...updates };
    const full = await getTournamentFull(tournamentId);
    if (full) broadcastTournamentUpdate(tournamentId, full);

    res.json(serializePlayer(updated));
  } catch (err) {
    req.log.error({ err }, "Failed to update player");
    res.status(500).json({ error: "Failed to update player" });
  }
});

// POST /api/tournaments/:tournamentId/players/shuffle
playersRouter.post("/shuffle", async (req: Request<{ tournamentId: string }>, res) => {
  try {
    const body = ShufflePlayersBody.parse(req.body);
    const { tournamentId } = req.params;

    const [tournament] = await db.select().from(tournamentsTable).where(eq(tournamentsTable.id, tournamentId));
    if (!tournament) { res.status(404).json({ error: "Tournament not found" }); return; }
    if (body.hostToken !== tournament.hostToken) { res.status(403).json({ error: "Invalid host token" }); return; }

    const players = await db.select().from(playersTable).where(eq(playersTable.tournamentId, tournamentId));
    const shuffled = [...players].sort(() => Math.random() - 0.5);
    for (let i = 0; i < shuffled.length; i++) {
      await db.update(playersTable).set({ seed: i + 1 }).where(eq(playersTable.id, shuffled[i].id));
    }

    const full = await getTournamentFull(tournamentId);
    if (full) broadcastTournamentUpdate(tournamentId, full);
    res.json(shuffled.map((p, i) => serializePlayer({ ...p, seed: i + 1 })));
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

    const [tournament] = await db.select().from(tournamentsTable).where(eq(tournamentsTable.id, tournamentId));
    if (!tournament) { res.status(404).json({ error: "Tournament not found" }); return; }
    if (body.hostToken !== tournament.hostToken) { res.status(403).json({ error: "Invalid host token" }); return; }

    const [player] = await db.select().from(playersTable).where(eq(playersTable.id, playerId));
    if (!player) { res.status(404).json({ error: "Player not found" }); return; }

    await db.delete(playersTable).where(eq(playersTable.id, playerId));

    // Remove from open play pool if present
    await db.delete(openPlayPoolTable).where(
      and(eq(openPlayPoolTable.tournamentId, tournamentId), eq(openPlayPoolTable.playerId, playerId))
    );

    const full = await getTournamentFull(tournamentId);
    if (full) broadcastTournamentUpdate(tournamentId, full);
    res.json(serializePlayer(player));
  } catch (err) {
    req.log.error({ err }, "Failed to remove player");
    res.status(500).json({ error: "Failed to remove player" });
  }
});
