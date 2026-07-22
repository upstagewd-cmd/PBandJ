import { Router } from "express";
import { getSystemSettingBoolean } from "../lib/settings";

export const appSettingsRouter = Router();

appSettingsRouter.get("/public", async (_req, res) => {
  const tournamentCreationEnabled = await getSystemSettingBoolean("tournament_creation_enabled", true);
  const openPlayCreationEnabled = await getSystemSettingBoolean("open_play_creation_enabled", true);

  res.json({
    tournamentCreationEnabled,
    openPlayCreationEnabled,
  });
});
