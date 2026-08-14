import { Router } from "express";
import { db } from "@workspace/db";
import { badgesTable, championshipLineageTable, championshipsTable, playerBadgesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

export const adminChampionshipsRouter = Router();

function isPngUrl(imageUrl: unknown): imageUrl is string {
  return typeof imageUrl === "string" && imageUrl.trim().length > 0 && (
    /^\/api\/storage\/objects\//.test(imageUrl.trim()) ||
    /\.png(?:$|[?#])/i.test(imageUrl.trim())
  );
}

async function syncCurrentHolderBadge(championshipId: string, name: string, imageUrl: string, playerIds: string[]) {
  const badgeId = `championship-${championshipId}`;
  const [badge] = await db.select({ id: badgesTable.id }).from(badgesTable).where(eq(badgesTable.id, badgeId));
  if (!badge) {
    await db.insert(badgesTable).values({
      id: badgeId,
      name,
      description: `Current holders of the ${name} championship.`,
      ruleType: "championship_holder",
      threshold: 0,
      icon: imageUrl,
      enabled: playerIds.length > 0,
    });
  } else {
    await db.update(badgesTable).set({ name, icon: imageUrl, enabled: playerIds.length > 0 }).where(eq(badgesTable.id, badgeId));
  }
  await db.delete(playerBadgesTable).where(eq(playerBadgesTable.badgeId, badgeId));
  if (playerIds.length > 0) {
    await db.insert(playerBadgesTable).values(playerIds.map((playerId) => ({ id: nanoid(8), playerId, badgeId, grantedBy: "admin" })));
  }
}

adminChampionshipsRouter.get("/", async (_req, res) => {
  const championships = await db.select().from(championshipsTable);
  const lineage = await db.select().from(championshipLineageTable);
  res.json(championships.map((championship) => ({
    ...championship,
    lineage: lineage.filter((entry) => entry.championshipId === championship.id),
  })));
});

adminChampionshipsRouter.post("/", async (req, res) => {
  const { name, description, imageUrl, enabled } = req.body as Record<string, unknown>;
  if (!name || !isPngUrl(imageUrl)) {
    res.status(400).json({ error: "Name and a PNG image URL are required" });
    return;
  }
  const [created] = await db.insert(championshipsTable).values({
    id: nanoid(10),
    name: String(name).trim(),
    description: description ? String(description) : "",
    imageUrl: imageUrl.trim(),
    enabled: enabled !== false,
  }).returning();
  res.status(201).json(created);
});

adminChampionshipsRouter.patch("/:championshipId", async (req, res) => {
  const { championshipId } = req.params;
  const { name, description, imageUrl, enabled } = req.body as Record<string, unknown>;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (name !== undefined) updates.name = String(name).trim();
  if (description !== undefined) updates.description = String(description);
  if (imageUrl !== undefined) {
    if (!isPngUrl(imageUrl)) { res.status(400).json({ error: "Championship image must be a PNG URL" }); return; }
    updates.imageUrl = imageUrl.trim();
  }
  if (enabled !== undefined) updates.enabled = Boolean(enabled);
  const [updated] = await db.update(championshipsTable).set(updates).where(eq(championshipsTable.id, championshipId)).returning();
  if (!updated) { res.status(404).json({ error: "Championship not found" }); return; }
  const holderIds = [updated.currentPlayer1Id, updated.currentPlayer2Id].filter(Boolean) as string[];
  await syncCurrentHolderBadge(updated.id, updated.name, updated.imageUrl, holderIds);
  res.json(updated);
});

adminChampionshipsRouter.delete("/:championshipId", async (req, res) => {
  const { championshipId } = req.params;
  const [deleted] = await db.delete(championshipsTable).where(eq(championshipsTable.id, championshipId)).returning();
  if (!deleted) { res.status(404).json({ error: "Championship not found" }); return; }
  await db.delete(playerBadgesTable).where(eq(playerBadgesTable.badgeId, `championship-${championshipId}`));
  await db.delete(badgesTable).where(eq(badgesTable.id, `championship-${championshipId}`));
  res.json({ ok: true });
});

adminChampionshipsRouter.post("/:championshipId/transfer", async (req, res) => {
  const { championshipId } = req.params;
  const { player1Id, player2Id } = req.body as { player1Id?: string; player2Id?: string };
  if (!player1Id || !player2Id || player1Id === player2Id) { res.status(400).json({ error: "Two different player IDs are required" }); return; }
  const [championship] = await db.select().from(championshipsTable).where(eq(championshipsTable.id, championshipId));
  if (!championship) { res.status(404).json({ error: "Championship not found" }); return; }
  await db.update(championshipsTable).set({ currentPlayer1Id: player1Id, currentPlayer2Id: player2Id, updatedAt: new Date() }).where(eq(championshipsTable.id, championshipId));
  await syncCurrentHolderBadge(championshipId, championship.name, championship.imageUrl, [player1Id, player2Id]);
  await db.insert(championshipLineageTable).values({ id: nanoid(10), championshipId, player1Id, player2Id, eventType: "admin_transfer" });
  res.json({ ok: true });
});

adminChampionshipsRouter.post("/:championshipId/revoke", async (req, res) => {
  const { championshipId } = req.params;
  const [championship] = await db.select().from(championshipsTable).where(eq(championshipsTable.id, championshipId));
  if (!championship) { res.status(404).json({ error: "Championship not found" }); return; }
  const priorIds = [championship.currentPlayer1Id, championship.currentPlayer2Id].filter(Boolean) as string[];
  await db.update(championshipsTable).set({ currentPlayer1Id: null, currentPlayer2Id: null, updatedAt: new Date() }).where(eq(championshipsTable.id, championshipId));
  await syncCurrentHolderBadge(championshipId, championship.name, championship.imageUrl, []);
  if (priorIds.length === 2) {
    await db.insert(championshipLineageTable).values({ id: nanoid(10), championshipId, player1Id: priorIds[0], player2Id: priorIds[1], eventType: "admin_revoke" });
  }
  res.json({ ok: true });
});