import { db, systemSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const DEFAULTS: Record<string, string> = {
  elo_initial: "1200",
  skill_beginner: "1000",
  skill_intermediate: "1500",
  skill_advanced: "2000",
};

async function ensureDefaultSettings() {
  const existing = await db.select().from(systemSettingsTable);
  const existingKeys = new Set(existing.map((s) => s.key));
  for (const [key, value] of Object.entries(DEFAULTS)) {
    if (!existingKeys.has(key)) {
      await db.insert(systemSettingsTable).values({ key, value });
    }
  }
}

export async function getSystemSettingNumber(key: string, fallback: number): Promise<number> {
  await ensureDefaultSettings();
  const [row] = await db.select({ value: systemSettingsTable.value }).from(systemSettingsTable).where(eq(systemSettingsTable.key, key));
  const parsed = Number(row?.value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function getStartingEloForSkill(skillLevel?: string | null): Promise<number> {
  const fallback = await getSystemSettingNumber("elo_initial", 1200);
  if (!skillLevel) return fallback;

  const skillMap: Record<string, number> = {
    beginner: await getSystemSettingNumber("skill_beginner", 1000),
    intermediate: await getSystemSettingNumber("skill_intermediate", 1500),
    advanced: await getSystemSettingNumber("skill_advanced", 2000),
  };

  return skillMap[skillLevel] ?? fallback;
}
