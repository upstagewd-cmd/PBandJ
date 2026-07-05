import { Router } from "express";
import { db } from "@workspace/db";
import { systemSettingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

export const adminSettingsRouter = Router();

const DEFAULTS: Record<string, string> = {
  elo_k_factor: "32",
  elo_initial: "1200",
  elo_minimum: "800",
  skill_beginner: "1000",
  skill_intermediate: "1500",
  skill_advanced: "2000",
  badge_system_enabled: "true",
  rank_system_enabled: "true",
};

async function ensureDefaults() {
  const existing = await db.select().from(systemSettingsTable);
  const existingKeys = new Set(existing.map((s) => s.key));
  for (const [key, value] of Object.entries(DEFAULTS)) {
    if (!existingKeys.has(key)) {
      await db.insert(systemSettingsTable).values({ key, value });
    }
  }
}

adminSettingsRouter.get("/", async (req, res) => {
  await ensureDefaults();
  const settings = await db.select().from(systemSettingsTable);
  const map: Record<string, string> = {};
  for (const s of settings) map[s.key] = s.value;
  res.json(map);
});

adminSettingsRouter.patch("/", async (req, res) => {
  const updates = req.body as Record<string, string>;
  for (const [key, value] of Object.entries(updates)) {
    await db
      .insert(systemSettingsTable)
      .values({ key, value })
      .onConflictDoUpdate({ target: systemSettingsTable.key, set: { value, updatedAt: new Date() } });
  }
  const settings = await db.select().from(systemSettingsTable);
  const map: Record<string, string> = {};
  for (const s of settings) map[s.key] = s.value;
  res.json(map);
});
