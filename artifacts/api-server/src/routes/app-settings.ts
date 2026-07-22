import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { db, tournamentsTable, sessionsTable, playersTable, sessionPlayersTable } from "@workspace/db";
import { getSystemSettingBoolean, getSystemSettingString } from "../lib/settings";

export const appSettingsRouter = Router();

appSettingsRouter.get("/public", async (_req, res) => {
  const tournamentCreationEnabled = await getSystemSettingBoolean("tournament_creation_enabled", true);
  const openPlayCreationEnabled = await getSystemSettingBoolean("open_play_creation_enabled", true);
  const appBannerEnabled = await getSystemSettingBoolean("app_banner_enabled", false);
  const appBannerMessage = await getSystemSettingString(
    "app_banner_message",
    "Welcome to PB&J! Sign-up and check the Rules 101 page before your first match.",
  );

  res.json({
    tournamentCreationEnabled,
    openPlayCreationEnabled,
    appBannerEnabled,
    appBannerMessage,
  });
});

appSettingsRouter.get("/live", async (_req, res) => {
  try {
    const [lobbyTournaments, activeSessions] = await Promise.all([
      db
        .select()
        .from(tournamentsTable)
        .where(eq(tournamentsTable.status, "lobby"))
        .orderBy(desc(tournamentsTable.createdAt)),
      db
        .select()
        .from(sessionsTable)
        .where(eq(sessionsTable.status, "active"))
        .orderBy(desc(sessionsTable.createdAt)),
    ]);

    const tournamentPlayerCounts = lobbyTournaments.length
      ? await Promise.all(
          lobbyTournaments.map(async (tournament) => {
            const rows = await db
              .select({ id: playersTable.id })
              .from(playersTable)
              .where(eq(playersTable.tournamentId, tournament.id));
            return [tournament.id, rows.length] as const;
          }),
        )
      : [];

    const sessionPlayerCounts = activeSessions.length
      ? await Promise.all(
          activeSessions.map(async (session) => {
            const rows = await db
              .select({ id: sessionPlayersTable.id })
              .from(sessionPlayersTable)
              .where(eq(sessionPlayersTable.sessionId, session.id));
            return [session.id, rows.length] as const;
          }),
        )
      : [];

    const tournamentCountsMap = new Map(tournamentPlayerCounts);
    const sessionCountsMap = new Map(sessionPlayerCounts);

    const items = [
      ...lobbyTournaments.map((tournament) => ({
        id: tournament.id,
        type: "tournament" as const,
        name: tournament.name,
        href: `/t/${tournament.id}`,
        statusLabel: "Lobby",
        playerCount: tournamentCountsMap.get(tournament.id) ?? 0,
        createdAt: tournament.createdAt.toISOString(),
      })),
      ...activeSessions.map((session) => ({
        id: session.id,
        type: "open_play" as const,
        name: session.name,
        href: `/s/${session.id}`,
        statusLabel: "Active",
        playerCount: sessionCountsMap.get(session.id) ?? 0,
        createdAt: session.createdAt.toISOString(),
      })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json({ items });
  } catch (err) {
    _req.log.error({ err }, "Failed to list live matches");
    res.status(500).json({ error: "Failed to list live matches" });
  }
});
