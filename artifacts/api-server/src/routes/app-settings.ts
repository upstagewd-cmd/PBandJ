import { Router } from "express";
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
