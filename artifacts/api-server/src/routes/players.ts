import { Router, Request } from "express";
import { randomUUID } from "crypto";
import { getAuth, clerkClient } from "@clerk/express";
import { db, tournamentsTable, playersTable, openPlayPoolTable } from "@workspace/db";
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
import { getStartingEloForSkill } from "../lib/settings";
import { getNicknameMap, isNicknameTakenGlobal } from "../lib/user-display";

export const playersRouter = Router({ mergeParams: true });
const NICKNAME_MAX_LENGTH = 15;

async function serializePlayer(p: typeof playersTable.$inferSelect, includeToken?: boolean, nickname?: string | null) {
  const rank = await getRank(p.eloRating ?? 1200);
  return {
    id: p.id,
    tournamentId: p.tournamentId,
    firstName: p.firstName,
    lastName: p.lastName,
    nickname: nickname ?? null,
    partnerName: p.partnerName ?? null,
    teamName: p.teamName ?? null,
    avatarUrl: p.avatarUrl ?? null,
    clerkUserId: p.clerkUserId ?? null,
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
    if (teamName && teamName.trim().length > NICKNAME_MAX_LENGTH) {
      res.status(400).json({ error: "nickname_too_long", message: `Nickname must be ${NICKNAME_MAX_LENGTH} characters or fewer.` });
      return;
    }

    const auth = getAuth(req);
    // If body explicitly includes clerkUserId (even null), use it — the host is adding a known
    // player and has already resolved their identity. Fall back to the authenticated user's ID
    // only for self-join requests where no clerkUserId is provided in the body.
    const clerkUserId: string | null =
      body.clerkUserId !== undefined ? (body.clerkUserId ?? null) : (auth?.userId ?? null);

    if (teamName) {
      const taken = await isNicknameTakenGlobal(teamName, { excludeClerkUserId: clerkUserId });
      if (taken) {
        res.status(409).json({ error: "nickname_taken", message: "That nickname is already taken. Try another one." });
        return;
      }
    } else if (clerkUserId) {
      const profileNicknameMap = await getNicknameMap([clerkUserId]);
      const profileNickname = (profileNicknameMap.get(clerkUserId) ?? "").trim();
      if (profileNickname) {
        const taken = await isNicknameTakenGlobal(profileNickname, { excludeClerkUserId: clerkUserId });
        if (taken) {
          res.status(409).json({ error: "nickname_taken", message: "That nickname is already taken. Try another one." });
          return;
        }
      }
    }

    // Duplicate guard: prevent the same Clerk user from joining twice
    if (clerkUserId) {
      const [existing] = await db
        .select({ id: playersTable.id })
        .from(playersTable)
        .where(and(eq(playersTable.tournamentId, tournamentId), eq(playersTable.clerkUserId, clerkUserId)));
      if (existing) {
        res.status(409).json({ error: "already_added" });
        return;
      }
    } else if (body.clerkUserId === undefined) {
      // Self-join path: also check auth userId to catch the same person joining from
      // a different device/flow before their clerkUserId was resolved
      const authId = auth?.userId ?? null;
      if (authId) {
        const duplicate = existingPlayers.find((p) => p.clerkUserId === authId);
        if (duplicate) {
          res.status(409).json({ error: "already_added" });
          return;
        }
      }
    }

    // Determine starting ELO: carry over existing rating for returning Clerk users,
    // otherwise use the admin-configured skill seed values.
    let startingElo = await getStartingEloForSkill(body.skillLevel);

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

    let avatarUrl: string | null = null;
    if (clerkUserId) {
      const clerkUser = await clerkClient.users.getUser(clerkUserId).catch(() => null);
      avatarUrl = clerkUser?.imageUrl ?? null;
    }

    const playerRow = {
      id,
      tournamentId,
      firstName: body.firstName,
      lastName: body.lastName,
      partnerName: body.partnerName ?? null,
      teamName,
      playerToken,
      avatarUrl,
      clerkUserId,
      skillLevel: body.skillLevel ?? null,
      eloRating: startingElo,
      seed: existingPlayers.length + 1,
    };

    await db.insert(playersTable).values(playerRow);
    const nicknameMap = await getNicknameMap([playerRow.clerkUserId]);

    const full = await getTournamentFull(tournamentId);
    if (full) broadcastTournamentUpdate(tournamentId, full);

    res.status(201).json({
      ...(await serializePlayer({ ...playerRow, joinedAt: new Date(), teamId: null }, false, nicknameMap.get(playerRow.clerkUserId ?? "") ?? null)),
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
    if (body.teamName !== undefined) {
      if (body.teamName && body.teamName.trim().length > NICKNAME_MAX_LENGTH) {
        res.status(400).json({ error: "nickname_too_long", message: `Nickname must be ${NICKNAME_MAX_LENGTH} characters or fewer.` });
        return;
      }
      if (body.teamName && body.teamName.trim()) {
        const taken = await isNicknameTakenGlobal(body.teamName, {
          excludeClerkUserId: player.clerkUserId ?? null,
          excludePlayerId: player.id,
        });
        if (taken) {
          res.status(409).json({ error: "nickname_taken", message: "That nickname is already taken. Try another one." });
          return;
        }
      }
      updates.teamName = body.teamName || null;
    }
    if (body.avatarUrl !== undefined) updates.avatarUrl = body.avatarUrl || null;

    if (Object.keys(updates).length > 0) {
      await db.update(playersTable).set(updates).where(eq(playersTable.id, playerId));
    }

    const updated = { ...player, ...updates };
    const full = await getTournamentFull(tournamentId);
    if (full) broadcastTournamentUpdate(tournamentId, full);

    const nicknameMap = await getNicknameMap([player.clerkUserId]);
    res.json(await serializePlayer(updated, false, nicknameMap.get(player.clerkUserId ?? "") ?? null));
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

    let ordered: typeof players;
    if (body.playerIds && body.playerIds.length > 0) {
      const idOrder = body.playerIds;
      const byId = new Map(players.map((p) => [p.id, p]));
      ordered = idOrder.map((id) => byId.get(id)).filter(Boolean) as typeof players;
      players.filter((p) => !idOrder.includes(p.id)).forEach((p) => ordered.push(p));
    } else {
      ordered = [...players].sort(() => Math.random() - 0.5);
    }

    for (let i = 0; i < ordered.length; i++) {
      await db.update(playersTable).set({ seed: i + 1 }).where(eq(playersTable.id, ordered[i].id));
    }

    const full = await getTournamentFull(tournamentId);
    if (full) broadcastTournamentUpdate(tournamentId, full);
    const nicknameMap = await getNicknameMap(ordered.map((player) => player.clerkUserId));
    res.json(await Promise.all(ordered.map(async (p, i) => serializePlayer({ ...p, seed: i + 1 }, false, nicknameMap.get(p.clerkUserId ?? "") ?? null))));
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
    const nicknameMap = await getNicknameMap([player.clerkUserId]);
    res.json(await serializePlayer(player, false, nicknameMap.get(player.clerkUserId ?? "") ?? null));
  } catch (err) {
    req.log.error({ err }, "Failed to remove player");
    res.status(500).json({ error: "Failed to remove player" });
  }
});
