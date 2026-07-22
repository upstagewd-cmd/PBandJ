import { Router, Request } from "express";
import { randomUUID } from "crypto";
import { db, tournamentsTable, playersTable, matchesTable, teamsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import {
  CreateTournamentBody,
  UpdateTournamentBody,
  StartTournamentBody,
} from "@workspace/api-zod";
import { generateSingleEliminationBracket, type ByeStrategy } from "../lib/bracket";
import { getTournamentFull } from "../lib/tournament-helpers";
import { broadcastTournamentUpdate } from "../lib/ws";
import { getNicknameMap } from "../lib/user-display";
import { getSystemSettingBoolean } from "../lib/settings";

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
    const creationEnabled = await getSystemSettingBoolean("tournament_creation_enabled", true);
    const adminCode = req.headers["x-admin-code"] as string | undefined;
    const passcode = process.env.ADMIN_PASSCODE ?? "pbj2024";
    const isAdminBypass = !!adminCode && adminCode === passcode;
    if (!creationEnabled && !isAdminBypass) {
      res.status(403).json({ error: "creation_locked", message: "Match creation is locked by the admin." });
      return;
    }

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
    if (body.status !== undefined) updates.status = body.status;

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

    const teams = await db
      .select()
      .from(teamsTable)
      .where(eq(teamsTable.tournamentId, tournamentId));

    if (teams.length < 2) {
      res.status(400).json({ error: "Generate teams first (minimum 2 teams required)" });
      return;
    }

    // Randomly seed teams
    const shuffled = [...teams].sort(() => Math.random() - 0.5);
    for (let i = 0; i < shuffled.length; i++) {
      await db
        .update(teamsTable)
        .set({ seed: i + 1 })
        .where(eq(teamsTable.id, shuffled[i].id));
    }

    // Generate single-elimination bracket using team IDs
    const seededTeams = shuffled.map((t, i) => ({ id: t.id, seed: i + 1 }));
    const byeStrategy: ByeStrategy = body.byeStrategy ?? "highestSeeded";
    const bracketMatches = generateSingleEliminationBracket(tournamentId, seededTeams, { byeStrategy });

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

    const [players, matches, teams] = await Promise.all([
      db.select().from(playersTable).where(eq(playersTable.tournamentId, tournamentId)),
      db.select().from(matchesTable).where(eq(matchesTable.tournamentId, tournamentId)),
      db.select().from(teamsTable).where(eq(teamsTable.tournamentId, tournamentId)),
    ]);

    // Final match: for single-elim the final is the highest-round winner match that completed.
    // For double-elim it would be grand_finals / grand_finals_reset — keep both paths.
    const gfReset = matches.find((m) => m.bracket === "grand_finals_reset" && m.status === "completed");
    const gf = matches.find((m) => m.bracket === "grand_finals" && m.status === "completed");
    const winnerMatches = matches.filter((m) => m.bracket === "winner");
    const maxWinnerRound = winnerMatches.reduce((max, m) => Math.max(max, m.round), 0);
    const seFinal = winnerMatches.find((m) => m.round === maxWinnerRound && m.status === "completed");
    const finalMatch = gfReset ?? gf ?? seFinal ?? null;

    const nicknameMap = await getNicknameMap(players.map((p) => p.clerkUserId));

    // Resolve a team ID to a display-friendly object the frontend can render
    const teamDisplay = (teamId: string | null | undefined) => {
      if (!teamId) return null;
      const team = teams.find((t) => t.id === teamId);
      if (!team) return null;
      const p1 = players.find((p) => p.id === team.player1Id);
      const p2 = players.find((p) => p.id === team.player2Id);
      const p1Name = p1 ? (nicknameMap.get(p1.clerkUserId ?? "") || p1.firstName) : "";
      const p2Name = p2 ? (nicknameMap.get(p2.clerkUserId ?? "") || p2.firstName) : "";
      const displayName =
        team.teamName ||
        (p1 && p2 ? `${p1Name} & ${p2Name}` : p1Name || p2Name || "Team");
      return {
        id: team.id,
        teamName: displayName,
        firstName: p1?.firstName ?? "",
        lastName: p1?.lastName ?? "",
        members: [p1, p2].filter(Boolean).map((p) => ({
          id: p!.id,
          firstName: p!.firstName,
          lastName: p!.lastName,
          nickname: nicknameMap.get(p!.clerkUserId ?? "") ?? null,
          avatarUrl: p!.avatarUrl ?? null,
        })),
        joinedAt: p1?.joinedAt?.toISOString() ?? new Date().toISOString(),
      };
    };

    const championTeamId = finalMatch?.winnerId ?? null;
    const runnerUpTeamId = finalMatch
      ? finalMatch.playerOneId === finalMatch.winnerId
        ? finalMatch.playerTwoId
        : finalMatch.playerOneId
      : null;

    const champion = teamDisplay(championTeamId);
    const runnerUp = teamDisplay(runnerUpTeamId);

    const completedMatches = matches.filter((m) => m.status === "completed" && !m.isBye);
    const durationMinutes =
      tournament.startedAt && tournament.completedAt
        ? Math.round((tournament.completedAt.getTime() - tournament.startedAt.getTime()) / 60000)
        : null;

    res.json({
      tournamentId,
      champion,
      runnerUp,
      thirdPlace: null,
      totalMatches: completedMatches.length,
      playerCount: players.length,
      durationMinutes,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get tournament summary");
    res.status(500).json({ error: "Failed to get tournament summary" });
  }
});
