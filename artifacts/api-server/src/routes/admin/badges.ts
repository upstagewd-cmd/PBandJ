import { Router } from "express";
import { db } from "@workspace/db";
import { badgesTable, playerBadgesTable, playersTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { nanoid } from "nanoid";

export const adminBadgesRouter = Router();

adminBadgesRouter.get("/", async (req, res) => {
  const badges = await db
    .select()
    .from(badgesTable)
    .orderBy(badgesTable.createdAt);

  const withGrants = await Promise.all(
    badges.map(async (b) => {
      const grants = await db
        .select({ grant: playerBadgesTable, player: playersTable })
        .from(playerBadgesTable)
        .leftJoin(playersTable, eq(playerBadgesTable.playerId, playersTable.id))
        .where(eq(playerBadgesTable.badgeId, b.id));
      return { ...b, grants };
    }),
  );

  res.json(withGrants);
});

adminBadgesRouter.post("/", async (req, res) => {
  const { name, description, ruleType, threshold, icon, enabled } =
    req.body as Record<string, unknown>;
  const [created] = await db
    .insert(badgesTable)
    .values({
      id: nanoid(8),
      name: String(name),
      description: String(description),
      ruleType: String(ruleType),
      threshold: Number(threshold),
      icon: icon ? String(icon) : "🏅",
      enabled: enabled !== false,
    })
    .returning();
  res.status(201).json(created);
});

adminBadgesRouter.patch("/:badgeId", async (req, res) => {
  const { badgeId } = req.params;
  const { name, description, ruleType, threshold, icon, enabled } =
    req.body as Record<string, unknown>;

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (ruleType !== undefined) updates.ruleType = ruleType;
  if (threshold !== undefined) updates.threshold = Number(threshold);
  if (icon !== undefined) updates.icon = icon;
  if (enabled !== undefined) updates.enabled = Boolean(enabled);

  const [updated] = await db
    .update(badgesTable)
    .set(updates)
    .where(eq(badgesTable.id, badgeId))
    .returning();

  if (!updated) { res.status(404).json({ error: "Badge not found" }); return; }
  res.json(updated);
});

adminBadgesRouter.delete("/:badgeId", async (req, res) => {
  const { badgeId } = req.params;
  await db.delete(playerBadgesTable).where(eq(playerBadgesTable.badgeId, badgeId));
  const [deleted] = await db
    .delete(badgesTable)
    .where(eq(badgesTable.id, badgeId))
    .returning();
  if (!deleted) { res.status(404).json({ error: "Badge not found" }); return; }
  res.json({ ok: true });
});

adminBadgesRouter.post("/:badgeId/grants", async (req, res) => {
  const { badgeId } = req.params;
  const { playerId } = req.body as { playerId: string };
  const [granted] = await db
    .insert(playerBadgesTable)
    .values({ id: nanoid(8), badgeId, playerId, grantedBy: "admin" })
    .returning();
  res.status(201).json(granted);
});

adminBadgesRouter.delete("/:badgeId/grants/:playerId", async (req, res) => {
  const { badgeId, playerId } = req.params;
  await db
    .delete(playerBadgesTable)
    .where(
      eq(playerBadgesTable.badgeId, badgeId) &&
        eq(playerBadgesTable.playerId, playerId) as any,
    );
  res.json({ ok: true });
});
