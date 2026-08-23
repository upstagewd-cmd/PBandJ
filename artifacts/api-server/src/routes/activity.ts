import { Router } from "express";
import {
  db,
  matchesTable,
  teamsTable,
  tournamentsTable,
  playersTable,
  openPlayMatchesTable,
  sessionMatchesTable,
  sessionsTable,
  sessionPlayersTable,
} from "@workspace/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getNicknameMap, getClerkImageMap } from "../lib/user-display";

export const activityRouter = Router();

type PlayerLite = { id: string; firstName: string; lastName: string; nickname: string | null; avatarUrl: string | null };
type SideInfo = { name: string; players: PlayerLite[] };

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

activityRouter.get("/", async (req, res) => {
  try {
    const limit = clampInt(req.query.limit, 15, 1, 50);
    const offset = clampInt(req.query.offset, 0, 0, 2000);
    const fetchCount = offset + limit + 1;

    const [tournamentMatches, openPlayMatches, sessionMatches] = await Promise.all([
      db
        .select()
        .from(matchesTable)
        .where(and(eq(matchesTable.status, "completed"), eq(matchesTable.isBye, false)))
        .orderBy(desc(matchesTable.completedAt))
        .limit(fetchCount),
      db.select().from(openPlayMatchesTable).orderBy(desc(openPlayMatchesTable.playedAt)).limit(fetchCount),
      db.select().from(sessionMatchesTable).orderBy(desc(sessionMatchesTable.playedAt)).limit(fetchCount),
    ]);

    // Resolve tournament match sides — each side id may be a player id (singles) or a team id (doubles).
    const tournamentIds = [...new Set(tournamentMatches.map((m) => m.tournamentId))];
    const sideIds = new Set<string>();
    for (const m of tournamentMatches) {
      if (m.playerOneId) sideIds.add(m.playerOneId);
      if (m.playerTwoId) sideIds.add(m.playerTwoId);
    }

    const [tournaments, teamsForSides] = await Promise.all([
      tournamentIds.length
        ? db.select().from(tournamentsTable).where(inArray(tournamentsTable.id, tournamentIds))
        : Promise.resolve([]),
      sideIds.size
        ? db.select().from(teamsTable).where(inArray(teamsTable.id, [...sideIds]))
        : Promise.resolve([]),
    ]);
    const teamMap = new Map(teamsForSides.map((team) => [team.id, team]));

    const directPlayerIds = new Set<string>();
    for (const id of sideIds) {
      const team = teamMap.get(id);
      if (team) {
        if (team.player1Id) directPlayerIds.add(team.player1Id);
        if (team.player2Id) directPlayerIds.add(team.player2Id);
      } else {
        directPlayerIds.add(id);
      }
    }
    for (const m of openPlayMatches) {
      for (const id of [m.teamOnePOneId, m.teamOnePTwoId, m.teamTwoPOneId, m.teamTwoPTwoId]) {
        if (id) directPlayerIds.add(id);
      }
    }

    const players = directPlayerIds.size
      ? await db.select().from(playersTable).where(inArray(playersTable.id, [...directPlayerIds]))
      : [];
    const playerMap = new Map(players.map((p) => [p.id, p]));

    const nicknameMap = await getNicknameMap(players.map((p) => p.clerkUserId));
    const imageMap = await getClerkImageMap(players.map((p) => p.clerkUserId));

    const toPlayerLite = (id: string): PlayerLite | null => {
      const player = playerMap.get(id);
      if (!player) return null;
      return {
        id: player.id,
        firstName: player.firstName,
        lastName: player.lastName,
        nickname: nicknameMap.get(player.clerkUserId ?? "") ?? null,
        avatarUrl: player.avatarUrl ?? imageMap.get(player.clerkUserId ?? "") ?? null,
      };
    };

    const resolveTournamentSide = (sideId: string | null): SideInfo => {
      if (!sideId) return { name: "Unknown", players: [] };
      const team = teamMap.get(sideId);
      const ids = team ? [team.player1Id, team.player2Id].filter(Boolean) as string[] : [sideId];
      const resolved = ids.map(toPlayerLite).filter((p): p is PlayerLite => !!p);
      const name = resolved.length > 0
        ? resolved.map((p) => p.nickname || `${p.firstName} ${p.lastName}`).join(" & ")
        : team?.teamName ?? "Unknown";
      return { name, players: resolved };
    };

    const resolveOpenPlaySide = (id1: string | null, id2: string | null): SideInfo => {
      const ids = [id1, id2].filter(Boolean) as string[];
      const resolved = ids.map(toPlayerLite).filter((p): p is PlayerLite => !!p);
      const name = resolved.length > 0
        ? resolved.map((p) => p.nickname || `${p.firstName} ${p.lastName}`).join(" & ")
        : "Unknown";
      return { name, players: resolved };
    };

    const tourneyMap = new Map(tournaments.map((t) => [t.id, t]));

    const tournamentItems = tournamentMatches.map((m) => ({
      id: `t:${m.id}`,
      type: "tournament" as const,
      contextName: tourneyMap.get(m.tournamentId)?.name ?? "Tournament",
      bracket: m.bracket,
      round: m.round,
      playedAt: (m.completedAt ? new Date(m.completedAt) : new Date(0)).toISOString(),
      teamOne: resolveTournamentSide(m.playerOneId),
      teamTwo: resolveTournamentSide(m.playerTwoId),
      scoreOne: m.scoreOne ?? null,
      scoreTwo: m.scoreTwo ?? null,
      winnerTeam: (m.winnerId && m.winnerId === m.playerTwoId ? 2 : 1) as 1 | 2,
    }));

    const openPlayItems = openPlayMatches.map((m) => ({
      id: `op:${m.id}`,
      type: "open_play" as const,
      contextName: "Open Play",
      bracket: "open_play",
      round: 0,
      playedAt: new Date(m.playedAt).toISOString(),
      teamOne: resolveOpenPlaySide(m.teamOnePOneId, m.teamOnePTwoId),
      teamTwo: resolveOpenPlaySide(m.teamTwoPOneId, m.teamTwoPTwoId),
      scoreOne: m.scoreOne ?? null,
      scoreTwo: m.scoreTwo ?? null,
      winnerTeam: m.winnerTeam as 1 | 2,
    }));

    // Session (guest) matches use their own player pool, scoped to each session.
    const sessionIds = [...new Set(sessionMatches.map((m) => m.sessionId))];
    const [sessions, sessionPlayers] = await Promise.all([
      sessionIds.length
        ? db.select().from(sessionsTable).where(inArray(sessionsTable.id, sessionIds))
        : Promise.resolve([]),
      sessionIds.length
        ? db.select().from(sessionPlayersTable).where(inArray(sessionPlayersTable.sessionId, sessionIds))
        : Promise.resolve([]),
    ]);
    const sessionMap = new Map(sessions.map((s) => [s.id, s]));
    const sessionPlayerMap = new Map(sessionPlayers.map((p) => [p.id, p]));

    const resolveSessionSide = (id1: string | null, id2: string | null): SideInfo => {
      const ids = [id1, id2].filter(Boolean) as string[];
      const resolved = ids
        .map((id) => sessionPlayerMap.get(id))
        .filter((p): p is (typeof sessionPlayers)[number] => !!p)
        .map((p) => ({ id: p.id, firstName: p.firstName, lastName: p.lastName, nickname: null, avatarUrl: null }));
      const name = resolved.length > 0
        ? resolved.map((p) => `${p.firstName} ${p.lastName}`).join(" & ")
        : "Unknown";
      return { name, players: resolved };
    };

    const sessionItems = sessionMatches.map((m) => ({
      id: `s:${m.id}`,
      type: "session" as const,
      contextName: sessionMap.get(m.sessionId)?.name ?? "Open Play",
      bracket: "open_play",
      round: 0,
      playedAt: new Date(m.playedAt).toISOString(),
      teamOne: resolveSessionSide(m.team1P1Id, m.team1P2Id),
      teamTwo: resolveSessionSide(m.team2P1Id, m.team2P2Id),
      scoreOne: m.scoreOne ?? null,
      scoreTwo: m.scoreTwo ?? null,
      winnerTeam: m.winnerTeam as 1 | 2,
    }));

    const merged = [...tournamentItems, ...openPlayItems, ...sessionItems].sort(
      (a, b) => new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime()
    );

    const page = merged.slice(offset, offset + limit);
    const hasMore = merged.length > offset + limit;

    res.json({ items: page, hasMore });
  } catch (err) {
    req.log.error({ err }, "Failed to get recent activity");
    res.status(500).json({ error: "Failed to get recent activity" });
  }
});
