import { Router, Request } from "express";
import { randomUUID } from "crypto";
import { db, sessionsTable, sessionPlayersTable, sessionMatchesTable, playersTable, userProfilesTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { AddSessionPlayerBody, LogSessionMatchBody, CreateSessionBody, UpdateSessionBody, PairSessionPlayersBody, UnpairSessionPlayerBody, ReshuffleSessionBody, AutoPairSessionBody, RemoveSessionPlayerBody } from "@workspace/api-zod";
import { computeElo } from "../lib/elo";
import { getRank } from "../lib/ranks";
import { getStartingEloForSkill, getEloKFactor } from "../lib/settings";
import { getNicknameMap, isNicknameTakenGlobal } from "../lib/user-display";

export const sessionsRouter = Router();
const NICKNAME_MAX_LENGTH = 15;

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

async function serializePlayer(p: PlayerRow, nickname?: string | null) {
  const rank = await getRank(p.eloRating);
  return {
    id: p.id,
    sessionId: p.sessionId,
    firstName: p.firstName,
    lastName: p.lastName,
    nickname: nickname ?? null,
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
  const nicknameRows = players.length
    ? await db
        .select({ clerkUserId: userProfilesTable.clerkUserId, nickname: userProfilesTable.nickname })
        .from(userProfilesTable)
        .where(inArray(userProfilesTable.clerkUserId, [...new Set(players.map((player) => player.clerkUserId).filter((id): id is string => !!id))]))
    : [];
  const nicknameMap = new Map(nicknameRows.map((row) => [row.clerkUserId, row.nickname ?? null]));

  const recentMatches = await Promise.all([...matchRows]
    .sort((a, b) => b.playedAt.getTime() - a.playedAt.getTime())
    .slice(0, 20)
    .map(async (m) => ({
      id: m.id,
      winnerTeam: m.winnerTeam,
      scoreOne: m.scoreOne ?? null,
      scoreTwo: m.scoreTwo ?? null,
      team1Players: await Promise.all([m.team1P1Id, m.team1P2Id]
        .filter(Boolean)
        .map((id) => playerMap.get(id!))
        .filter(Boolean)
        .map((player) => serializePlayer(player!, nicknameMap.get(player!.clerkUserId ?? "") ?? null))),
      team2Players: await Promise.all([m.team2P1Id, m.team2P2Id]
        .filter(Boolean)
        .map((id) => playerMap.get(id!))
        .filter(Boolean)
        .map((player) => serializePlayer(player!, nicknameMap.get(player!.clerkUserId ?? "") ?? null))),
      playedAt: m.playedAt.toISOString(),
    })));

  return {
    id: session.id,
    name: session.name,
    status: session.status,
    createdAt: session.createdAt.toISOString(),
    players: await Promise.all(players.map((player) => serializePlayer(player, nicknameMap.get(player.clerkUserId ?? "") ?? null))),
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

    const updates: Partial<{ name: string; status: string }> = {};
    if (body.name !== undefined) updates.name = body.name.trim();
    if (body.status !== undefined) updates.status = body.status;
    if (Object.keys(updates).length > 0) {
      await db.update(sessionsTable).set(updates).where(eq(sessionsTable.id, sessionId));
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
    if (body.teamName && body.teamName.trim().length > NICKNAME_MAX_LENGTH) {
      res.status(400).json({ error: "nickname_too_long", message: `Nickname must be ${NICKNAME_MAX_LENGTH} characters or fewer.` });
      return;
    }

    if (body.teamName && body.teamName.trim()) {
      const taken = await isNicknameTakenGlobal(body.teamName, { excludeClerkUserId: body.clerkUserId ?? null });
      if (taken) {
        res.status(409).json({ error: "nickname_taken", message: "That nickname is already taken. Try another one." });
        return;
      }
    } else if (body.clerkUserId) {
      const profileNicknameMap = await getNicknameMap([body.clerkUserId]);
      const profileNickname = (profileNicknameMap.get(body.clerkUserId) ?? "").trim();
      if (profileNickname) {
        const taken = await isNicknameTakenGlobal(profileNickname, { excludeClerkUserId: body.clerkUserId });
        if (taken) {
          res.status(409).json({ error: "nickname_taken", message: "That nickname is already taken. Try another one." });
          return;
        }
      }
    }

    // Duplicate guard: prevent the same signed-in user from joining twice
    if (body.clerkUserId) {
      const [existing] = await db
        .select({ id: sessionPlayersTable.id })
        .from(sessionPlayersTable)
        .where(and(eq(sessionPlayersTable.sessionId, sessionId), eq(sessionPlayersTable.clerkUserId, body.clerkUserId)));
      if (existing) {
        res.status(409).json({ error: "already_added" });
        return;
      }
    }

    // Compute starting ELO: Clerk user history > skill level > default 1200
    let startingElo = await getStartingEloForSkill(body.skillLevel);
    if (body.clerkUserId) {
      const userPlayers = await db.select().from(playersTable).where(eq(playersTable.clerkUserId, body.clerkUserId));
      if (userPlayers.length > 0) {
        startingElo = Math.round(userPlayers.reduce((s, p) => s + (p.eloRating ?? 1200), 0) / userPlayers.length);
      }
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
    const kFactor = await getEloKFactor();

    const winnerIds = body.winnerTeam === 1 ? t1Ids : t2Ids;
    const loserIds = body.winnerTeam === 1 ? t2Ids : t1Ids;
    const winnerAvg = body.winnerTeam === 1 ? t1Avg : t2Avg;
    const loserAvg = body.winnerTeam === 1 ? t2Avg : t1Avg;
    const { winnerDelta, loserDelta } = computeElo(winnerAvg, loserAvg, kFactor);

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

// ─── DELETE /api/sessions/:sessionId/players/:playerId ───────────────────────

sessionsRouter.delete("/:sessionId/players/:playerId", async (req: Request<{ sessionId: string; playerId: string }>, res) => {
  try {
    const body = RemoveSessionPlayerBody.parse(req.body);
    const { sessionId, playerId } = req.params;

    const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, sessionId));
    if (!session) { res.status(404).json({ error: "Session not found" }); return; }
    if (body.hostToken !== session.hostToken) { res.status(403).json({ error: "Invalid host token" }); return; }

    const [player] = await db.select().from(sessionPlayersTable).where(eq(sessionPlayersTable.id, playerId));
    if (!player) { res.status(404).json({ error: "Player not found" }); return; }

    // Clear their partner link
    if (player.partnerId) {
      await db.update(sessionPlayersTable).set({ partnerId: null }).where(eq(sessionPlayersTable.id, player.partnerId));
    }
    await db.delete(sessionPlayersTable).where(eq(sessionPlayersTable.id, playerId));

    const full = await getSessionFull(sessionId);
    res.json(full);
  } catch (err) {
    req.log.error({ err }, "Failed to remove session player");
    res.status(500).json({ error: "Failed to remove player" });
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

    const players = await db.select().from(sessionPlayersTable).where(eq(sessionPlayersTable.sessionId, sessionId));
    const shuffled = [...players];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const numPairs = Math.floor(shuffled.length / 2);
    for (let i = 0; i < numPairs; i++) {
      const p1 = shuffled[i * 2];
      const p2 = shuffled[i * 2 + 1];
      await db.update(sessionPlayersTable).set({ partnerId: p2.id }).where(eq(sessionPlayersTable.id, p1.id));
      await db.update(sessionPlayersTable).set({ partnerId: p1.id }).where(eq(sessionPlayersTable.id, p2.id));
    }

    const full = await getSessionFull(sessionId);
    res.json(full);
  } catch (err) {
    req.log.error({ err }, "Failed to reshuffle session");
    res.status(500).json({ error: "Failed to reshuffle" });
  }
});
