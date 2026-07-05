import { Router, Request } from "express";
import { randomUUID } from "crypto";
import { db, tournamentsTable, playersTable, teamsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { GenerateTeamsBody, UpdateTeamBody } from "@workspace/api-zod";
import { getTournamentFull } from "../lib/tournament-helpers";
import { broadcastTournamentUpdate } from "../lib/ws";

export const teamsRouter = Router({ mergeParams: true });

type PlayerRow = typeof playersTable.$inferSelect;

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateBalancedPairs(players: PlayerRow[]): [PlayerRow, PlayerRow][] {
  const advanced = shuffleArray(players.filter((p) => p.skillLevel === "advanced"));
  const intermediate = shuffleArray(players.filter((p) => p.skillLevel === "intermediate"));
  const beginner = shuffleArray(players.filter((p) => p.skillLevel === "beginner"));
  const unrated = shuffleArray(players.filter((p) => !p.skillLevel));

  const pairs: [PlayerRow, PlayerRow][] = [];

  // Best pairing: advanced + beginner
  while (advanced.length > 0 && beginner.length > 0) {
    pairs.push([advanced.pop()!, beginner.pop()!]);
  }

  // Next: advanced + intermediate
  while (advanced.length > 0 && intermediate.length > 0) {
    pairs.push([advanced.pop()!, intermediate.pop()!]);
  }

  // Then: intermediate + intermediate
  while (intermediate.length >= 2) {
    pairs.push([intermediate.pop()!, intermediate.pop()!]);
  }

  // Pair up all leftovers randomly
  const remaining = shuffleArray([...advanced, ...intermediate, ...beginner, ...unrated]);
  for (let i = 0; i + 1 < remaining.length; i += 2) {
    pairs.push([remaining[i], remaining[i + 1]]);
  }

  return pairs;
}

function generateRandomPairs(players: PlayerRow[]): [PlayerRow, PlayerRow][] {
  const shuffled = shuffleArray(players);
  const pairs: [PlayerRow, PlayerRow][] = [];
  for (let i = 0; i + 1 < shuffled.length; i += 2) {
    pairs.push([shuffled[i], shuffled[i + 1]]);
  }
  return pairs;
}

// POST /api/tournaments/:tournamentId/teams — generate (or re-generate) teams
teamsRouter.post("/", async (req: Request<{ tournamentId: string }>, res) => {
  try {
    const body = GenerateTeamsBody.parse(req.body);
    const { tournamentId } = req.params;

    const [tournament] = await db.select().from(tournamentsTable).where(eq(tournamentsTable.id, tournamentId));
    if (!tournament) { res.status(404).json({ error: "Tournament not found" }); return; }
    if (body.hostToken !== tournament.hostToken) { res.status(403).json({ error: "Invalid host token" }); return; }
    if (tournament.status !== "lobby") { res.status(400).json({ error: "Tournament already started" }); return; }

    const players = await db.select().from(playersTable).where(eq(playersTable.tournamentId, tournamentId));
    if (players.length < 2) { res.status(400).json({ error: "Need at least 2 players to form teams" }); return; }

    // Clear existing teams and player teamIds
    await db.delete(teamsTable).where(eq(teamsTable.tournamentId, tournamentId));
    await db.update(playersTable).set({ teamId: null }).where(eq(playersTable.tournamentId, tournamentId));

    const mode = body.mode ?? "balanced";
    const pairs = mode === "random" ? generateRandomPairs(players) : generateBalancedPairs(players);

    const newTeams: (typeof teamsTable.$inferSelect)[] = [];
    for (const [p1, p2] of pairs) {
      const teamId = randomUUID();
      const [team] = await db.insert(teamsTable).values({
        id: teamId,
        tournamentId,
        player1Id: p1.id,
        player2Id: p2.id,
      }).returning();
      await db.update(playersTable).set({ teamId }).where(eq(playersTable.id, p1.id));
      await db.update(playersTable).set({ teamId }).where(eq(playersTable.id, p2.id));
      newTeams.push(team);
    }

    const full = await getTournamentFull(tournamentId);
    if (full) broadcastTournamentUpdate(tournamentId, full);
    res.json(newTeams.map(serializeTeam));
  } catch (err) {
    req.log.error({ err }, "Failed to generate teams");
    res.status(500).json({ error: "Failed to generate teams" });
  }
});

// DELETE /api/tournaments/:tournamentId/teams — reset teams
teamsRouter.delete("/", async (req: Request<{ tournamentId: string }>, res) => {
  try {
    const { hostToken } = req.body as { hostToken?: string };
    const { tournamentId } = req.params;

    const [tournament] = await db.select().from(tournamentsTable).where(eq(tournamentsTable.id, tournamentId));
    if (!tournament) { res.status(404).json({ error: "Tournament not found" }); return; }
    if (hostToken !== tournament.hostToken) { res.status(403).json({ error: "Invalid host token" }); return; }
    if (tournament.status !== "lobby") { res.status(400).json({ error: "Tournament already started" }); return; }

    await db.delete(teamsTable).where(eq(teamsTable.tournamentId, tournamentId));
    await db.update(playersTable).set({ teamId: null }).where(eq(playersTable.tournamentId, tournamentId));

    const full = await getTournamentFull(tournamentId);
    if (full) broadcastTournamentUpdate(tournamentId, full);
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to reset teams");
    res.status(500).json({ error: "Failed to reset teams" });
  }
});

// PATCH /api/tournaments/:tournamentId/teams/:teamId — update team (swap players)
teamsRouter.patch("/:teamId", async (req: Request<{ tournamentId: string; teamId: string }>, res) => {
  try {
    const body = UpdateTeamBody.parse(req.body);
    const { tournamentId, teamId } = req.params;

    const [tournament] = await db.select().from(tournamentsTable).where(eq(tournamentsTable.id, tournamentId));
    if (!tournament) { res.status(404).json({ error: "Tournament not found" }); return; }
    if (body.hostToken !== tournament.hostToken) { res.status(403).json({ error: "Invalid host token" }); return; }
    if (tournament.status !== "lobby") { res.status(400).json({ error: "Tournament already started" }); return; }

    const [existingTeam] = await db.select().from(teamsTable).where(and(eq(teamsTable.id, teamId), eq(teamsTable.tournamentId, tournamentId)));
    if (!existingTeam) { res.status(404).json({ error: "Team not found" }); return; }

    // Unset teamId on old players being removed from this team
    if (body.player1Id !== undefined && body.player1Id !== existingTeam.player1Id && existingTeam.player1Id) {
      await db.update(playersTable).set({ teamId: null }).where(and(eq(playersTable.id, existingTeam.player1Id), eq(playersTable.teamId, teamId)));
    }
    if (body.player2Id !== undefined && body.player2Id !== existingTeam.player2Id && existingTeam.player2Id) {
      await db.update(playersTable).set({ teamId: null }).where(and(eq(playersTable.id, existingTeam.player2Id), eq(playersTable.teamId, teamId)));
    }

    // Update the team record
    const updates: Partial<typeof teamsTable.$inferInsert> = {};
    if (body.player1Id !== undefined) updates.player1Id = body.player1Id ?? null;
    if (body.player2Id !== undefined) updates.player2Id = body.player2Id ?? null;
    if (body.teamName !== undefined) updates.teamName = body.teamName ?? null;

    const [updated] = await db.update(teamsTable).set(updates).where(eq(teamsTable.id, teamId)).returning();

    // Set teamId on new players joining this team
    if (updated.player1Id) await db.update(playersTable).set({ teamId }).where(eq(playersTable.id, updated.player1Id));
    if (updated.player2Id) await db.update(playersTable).set({ teamId }).where(eq(playersTable.id, updated.player2Id));

    const full = await getTournamentFull(tournamentId);
    if (full) broadcastTournamentUpdate(tournamentId, full);
    res.json(serializeTeam(updated));
  } catch (err) {
    req.log.error({ err }, "Failed to update team");
    res.status(500).json({ error: "Failed to update team" });
  }
});

function serializeTeam(t: typeof teamsTable.$inferSelect) {
  return {
    id: t.id,
    tournamentId: t.tournamentId,
    player1Id: t.player1Id ?? null,
    player2Id: t.player2Id ?? null,
    teamName: t.teamName ?? null,
    seed: t.seed,
    createdAt: t.createdAt.toISOString(),
  };
}
