import { Router, Request } from "express";
import { randomUUID } from "crypto";
import { db, sessionsTable, sessionPlayersTable, sessionMatchesTable, playersTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { AddSessionPlayerBody, LogSessionMatchBody, CreateSessionBody, UpdateSessionBody, PairSessionPlayersBody, UnpairSessionPlayerBody, ReshuffleSessionBody, AutoPairSessionBody } from "@workspace/api-zod";
import { computeElo } from "../lib/elo";
import { getRank } from "../lib/ranks";

const SKILL_ELO: Record<string, number> = {
  beginner: 900,
  intermediate: 1200,
  advanced: 1500,
};

export const sessionsRouter = Router();

// ─── ID generation (same pattern as tournaments) ──────────────────────────────

const SESSION_ID_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateSessionId(): string {
  let id = "";
  for (let i = 0; i < 6; i++) {
    id += SESSION_ID_CHARS[Math.floor(Math.random() * SESSION_ID_CHARS.length)];
  }
  return id;
}


// ─── Helpers ──────────────────────────────────────────────────────────────────

type PlayerRow = typeof sessionPlayersTable.$inferSelect;

function serializePlayer(p: PlayerRow) {
  const rank = getRank(p.eloRating);
  return {
    id: p.id,
    sessionId: p.sessionId,
    firstName: p.firstName,
    lastName: p.lastName,
    teamName: p.teamName ?? null,
    skillLevel: p.skillLevel ?? null,
    clerkUserId: p.clerkUserId ?? null,
    partnerId: p.partnerId ?? null,
    eloRating: p.eloRating,
    rankTitle: rank.title,
    rankEmoji: rank.emoji,
    joinedAt: p.joinedAt.toISOString(),
  };
}

async function getSessionFull(sessionId: string) {
  const [session] = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.id, sessionId));
  if (!session) return null;

  const players = await db
    .select()
    .from(sessionPlayersTable)
    .where(eq(sessionPlayersTable.sessionId, sessionId));

  const matchRows = await db
    .select()
    .from(sessionMatchesTable)
    .where(eq(sessionMatchesTable.sessionId, sessionId));

  const playerMap = new Map(players.map((p) => [p.id, p]));

  const recentMatches = [...matchRows]
    .sort((a, b) => b.playedAt.getTime() - a.playedAt.getTime())
    .slice(0, 20)
    .map((m) => ({
      id: m.id,
      winnerTeam: m.winnerTeam,
      scoreOne: m.scoreOne ?? null,
      scoreTwo: m.scoreTwo ?? null,
      team1Players: [m.team1P1Id, m.team1P2Id]
        .filter(Boolean)
        .map((id) => playerMap.get(id!))
        .filter(Boolean)
        .map(serializePlayer),
      team2Players: [m.team2P1Id, m.team2P2Id]
        .filter(Boolean)
        .map((id) => playerMap.get(id!))
        .filter(Boolean)
        .map(serializePlayer),
      playedAt: m.playedAt.toISOString(),
    }));

  return {
    id: session.id,
    name: session.name,
    status: session.status,
    createdAt: session.createdAt.toISOString(),
    players: players.map(serializePlayer),
    recentMatches,
  };
}

// ─── POST /api/sessions ───────────────────────────────────────────────────────

sessionsRouter.post("/", async (req, res) => {
  try {
    const body = CreateSessionBody.safeParse(req.body ?? {}).success ? CreateSessionBody.parse(req.body ?? {}) : { name: undefined };
    const id = generateSessionId();
    const hostToken = randomUUID();
    const name = body.name?.trim() || "Open Play";

    await db.insert(sessionsTable).values({ id, name, hostToken, status: "active" });

    res.status(201).json({ id, name, status: "active", createdAt: new Date().toISOString(), hostToken });
  } catch (err) {
    req.log.error({ err }, "Failed to create session");
    res.status(500).json({ error: "Failed to create session" });
  }
});

// ─── GET /api/sessions/:sessionId ────────────────────────────────────────────

sessionsRouter.get("/:sessionId", async (req: Request<{ sessionId: string }>, res) => {
  try {
    const full = await getSessionFull(req.params.sessionId);
    if (!full) { res.status(404).json({ error: "Session not found" }); return; }
    res.json(full);
  } catch (err) {
    req.log.error({ err }, "Failed to get session");
    res.status(500).json({ error: "Failed to get session" });
  }
});

// ─── PATCH /api/sessions/:sessionId ──────────────────────────────────────────

sessionsRouter.patch("/:sessionId", async (req: Request<{ sessionId: string }>, res) => {
  try {
    const body = UpdateSessionBody.parse(req.body);
    const { sessionId } = req.params;

    const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, sessionId));
    if (!session) { res.status(404).json({ error: "Session not found" }); return; }
    if (body.hostToken !== session.hostToken) { res.status(403).json({ error: "Invalid host token" }); return; }

    if (body.name !== undefined) {
      await db.update(sessionsTable).set({ name: body.name.trim() }).where(eq(sessionsTable.id, sessionId));
    }

    const full = await getSessionFull(sessionId);
    res.json(full);
  } catch (err) {
    req.log.error({ err }, "Failed to update session");
    res.status(500).json({ error: "Failed to update session" });
  }
});

// ─── POST /api/sessions/:sessionId/players ────────────────────────────────────

sessionsRouter.post("/:sessionId/players", async (req: Request<{ sessionId: string }>, res) => {
  try {
    const body = AddSessionPlayerBody.parse(req.body);
    const { sessionId } = req.params;

    const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, sessionId));
    if (!session) { res.status(404).json({ error: "Session not found" }); return; }

    // Compute starting ELO: Clerk user history > skill level > default 1200
    let startingElo = 1200;
    if (body.clerkUserId) {
      const userPlayers = await db.select().from(playersTable).where(eq(playersTable.clerkUserId, body.clerkUserId));
      if (userPlayers.length > 0) {
        startingElo = Math.round(userPlayers.reduce((s, p) => s + (p.eloRating ?? 1200), 0) / userPlayers.length);
      } else if (body.skillLevel) {
        startingElo = SKILL_ELO[body.skillLevel] ?? 1200;
      }
    } else if (body.skillLevel) {
      startingElo = SKILL_ELO[body.skillLevel] ?? 1200;
    }

    await db.insert(sessionPlayersTable).values({
      id: randomUUID(),
      sessionId,
      firstName: body.firstName.trim(),
      lastName: body.lastName.trim(),
      teamName: body.teamName?.trim() || null,
      skillLevel: body.skillLevel ?? null,
      clerkUserId: body.clerkUserId ?? null,
      eloRating: startingElo,
    });

    const full = await getSessionFull(sessionId);
    res.status(201).json(full);
  } catch (err) {
    req.log.error({ err }, "Failed to add player to session");
    res.status(500).json({ error: "Failed to add player" });
  }
});

// ─── POST /api/sessions/:sessionId/matches ────────────────────────────────────

sessionsRouter.post("/:sessionId/matches", async (req: Request<{ sessionId: string }>, res) => {
  try {
    const body = LogSessionMatchBody.parse(req.body);
    const { sessionId } = req.params;

    const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, sessionId));
    if (!session) { res.status(404).json({ error: "Session not found" }); return; }
    if (body.hostToken !== session.hostToken) { res.status(403).json({ error: "Invalid host token" }); return; }

    // Record the match
    await db.insert(sessionMatchesTable).values({
      id: randomUUID(),
      sessionId,
      team1P1Id: body.team1P1Id,
      team1P2Id: body.team1P2Id ?? null,
      team2P1Id: body.team2P1Id,
      team2P2Id: body.team2P2Id ?? null,
      winnerTeam: body.winnerTeam,
      scoreOne: body.scoreOne ?? null,
      scoreTwo: body.scoreTwo ?? null,
    });

    // Fetch all participating players and update ELO
    const allIds = [body.team1P1Id, body.team1P2Id, body.team2P1Id, body.team2P2Id].filter(Boolean) as string[];
    const players = await db.select().from(sessionPlayersTable).where(inArray(sessionPlayersTable.id, allIds));
    const playerMap = new Map(players.map((p) => [p.id, p]));

    const t1Ids = [body.team1P1Id, body.team1P2Id].filter(Boolean) as string[];
    const t2Ids = [body.team2P1Id, body.team2P2Id].filter(Boolean) as string[];
    const t1Avg = t1Ids.reduce((s, id) => s + (playerMap.get(id)?.eloRating ?? 1200), 0) / t1Ids.length;
    const t2Avg = t2Ids.reduce((s, id) => s + (playerMap.get(id)?.eloRating ?? 1200), 0) / t2Ids.length;

    const winnerIds = body.winnerTeam === 1 ? t1Ids : t2Ids;
    const loserIds = body.winnerTeam === 1 ? t2Ids : t1Ids;
    const winnerAvg = body.winnerTeam === 1 ? t1Avg : t2Avg;
    const loserAvg = body.winnerTeam === 1 ? t2Avg : t1Avg;
    const { winnerDelta, loserDelta } = computeElo(winnerAvg, loserAvg);

    for (const id of winnerIds) {
      const p = playerMap.get(id);
      if (p) await db.update(sessionPlayersTable).set({ eloRating: p.eloRating + winnerDelta }).where(eq(sessionPlayersTable.id, id));
    }
    for (const id of loserIds) {
      const p = playerMap.get(id);
      if (p) await db.update(sessionPlayersTable).set({ eloRating: Math.max(800, p.eloRating + loserDelta) }).where(eq(sessionPlayersTable.id, id));
    }

    const full = await getSessionFull(sessionId);
    res.status(201).json(full);
  } catch (err) {
    req.log.error({ err }, "Failed to log session match");
    res.status(500).json({ error: "Failed to log match" });
  }
});

// ─── POST /api/sessions/:sessionId/auto-pair ─────────────────────────────────

sessionsRouter.post("/:sessionId/auto-pair", async (req: Request<{ sessionId: string }>, res) => {
  try {
    const body = AutoPairSessionBody.parse(req.body);
    const { sessionId } = req.params;

    const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, sessionId));
    if (!session) { res.status(404).json({ error: "Session not found" }); return; }
    if (body.hostToken !== session.hostToken) { res.status(403).json({ error: "Invalid host token" }); return; }

    // Clear all existing pairings
    await db.update(sessionPlayersTable).set({ partnerId: null }).where(eq(sessionPlayersTable.sessionId, sessionId));

    // Sort by ELO descending and snake-pair (strongest + weakest, etc.)
    const players = await db.select().from(sessionPlayersTable).where(eq(sessionPlayersTable.sessionId, sessionId));
    const sorted = [...players].sort((a, b) => b.eloRating - a.eloRating);
    const numPairs = Math.floor(sorted.length / 2);

    for (let i = 0; i < numPairs; i++) {
      const p1 = sorted[i];
      const p2 = sorted[sorted.length - 1 - i];
      await db.update(sessionPlayersTable).set({ partnerId: p2.id }).where(eq(sessionPlayersTable.id, p1.id));
      await db.update(sessionPlayersTable).set({ partnerId: p1.id }).where(eq(sessionPlayersTable.id, p2.id));
    }

    const full = await getSessionFull(sessionId);
    res.json(full);
  } catch (err) {
    req.log.error({ err }, "Failed to auto-pair session");
    res.status(500).json({ error: "Failed to auto-pair" });
  }
});

// ─── PATCH /api/sessions/:sessionId/pair ─────────────────────────────────────

sessionsRouter.patch("/:sessionId/pair", async (req: Request<{ sessionId: string }>, res) => {
  try {
    const body = PairSessionPlayersBody.parse(req.body);
    const { sessionId } = req.params;

    const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, sessionId));
    if (!session) { res.status(404).json({ error: "Session not found" }); return; }
    if (body.hostToken !== session.hostToken) { res.status(403).json({ error: "Invalid host token" }); return; }

    const [p1] = await db.select().from(sessionPlayersTable).where(eq(sessionPlayersTable.id, body.player1Id));
    const [p2] = await db.select().from(sessionPlayersTable).where(eq(sessionPlayersTable.id, body.player2Id));
    if (!p1 || !p2) { res.status(404).json({ error: "Player not found" }); return; }

    // Clear existing partners of each player before re-pairing
    if (p1.partnerId) await db.update(sessionPlayersTable).set({ partnerId: null }).where(eq(sessionPlayersTable.id, p1.partnerId));
    if (p2.partnerId) await db.update(sessionPlayersTable).set({ partnerId: null }).where(eq(sessionPlayersTable.id, p2.partnerId));

    await db.update(sessionPlayersTable).set({ partnerId: body.player2Id }).where(eq(sessionPlayersTable.id, body.player1Id));
    await db.update(sessionPlayersTable).set({ partnerId: body.player1Id }).where(eq(sessionPlayersTable.id, body.player2Id));

    const full = await getSessionFull(sessionId);
    res.json(full);
  } catch (err) {
    req.log.error({ err }, "Failed to pair players");
    res.status(500).json({ error: "Failed to pair players" });
  }
});

// ─── DELETE /api/sessions/:sessionId/pair ────────────────────────────────────

sessionsRouter.delete("/:sessionId/pair", async (req: Request<{ sessionId: string }>, res) => {
  try {
    const body = UnpairSessionPlayerBody.parse(req.body);
    const { sessionId } = req.params;

    const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, sessionId));
    if (!session) { res.status(404).json({ error: "Session not found" }); return; }
    if (body.hostToken !== session.hostToken) { res.status(403).json({ error: "Invalid host token" }); return; }

    const [player] = await db.select().from(sessionPlayersTable).where(eq(sessionPlayersTable.id, body.playerId));
    if (!player) { res.status(404).json({ error: "Player not found" }); return; }

    if (player.partnerId) {
      await db.update(sessionPlayersTable).set({ partnerId: null }).where(eq(sessionPlayersTable.id, player.partnerId));
    }
    await db.update(sessionPlayersTable).set({ partnerId: null }).where(eq(sessionPlayersTable.id, body.playerId));

    const full = await getSessionFull(sessionId);
    res.json(full);
  } catch (err) {
    req.log.error({ err }, "Failed to unpair player");
    res.status(500).json({ error: "Failed to unpair player" });
  }
});

// ─── POST /api/sessions/:sessionId/reshuffle ─────────────────────────────────

sessionsRouter.post("/:sessionId/reshuffle", async (req: Request<{ sessionId: string }>, res) => {
  try {
    const body = ReshuffleSessionBody.parse(req.body);
    const { sessionId } = req.params;

    const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, sessionId));
    if (!session) { res.status(404).json({ error: "Session not found" }); return; }
    if (body.hostToken !== session.hostToken) { res.status(403).json({ error: "Invalid host token" }); return; }

    await db.update(sessionPlayersTable).set({ partnerId: null }).where(eq(sessionPlayersTable.sessionId, sessionId));

    const full = await getSessionFull(sessionId);
    res.json(full);
  } catch (err) {
    req.log.error({ err }, "Failed to reshuffle session");
    res.status(500).json({ error: "Failed to reshuffle" });
  }
});
