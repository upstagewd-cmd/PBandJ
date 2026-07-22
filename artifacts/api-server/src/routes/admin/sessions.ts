import { Router } from "express";
import { db } from "@workspace/db";
import { sessionsTable, sessionMatchesTable, sessionPlayersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

export const adminSessionsRouter = Router();

adminSessionsRouter.patch("/:sessionId", async (req, res) => {
  const { sessionId } = req.params;
  const { name, status } = req.body as Record<string, unknown>;

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = String(name);
  if (status !== undefined) updates.status = String(status);

  const [updated] = await db
    .update(sessionsTable)
    .set(updates)
    .where(eq(sessionsTable.id, sessionId))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  res.json(updated);
});

adminSessionsRouter.delete("/:sessionId", async (req, res) => {
  const { sessionId } = req.params;

  await db.delete(sessionMatchesTable).where(eq(sessionMatchesTable.sessionId, sessionId));
  await db.delete(sessionPlayersTable).where(eq(sessionPlayersTable.sessionId, sessionId));

  const [deleted] = await db
    .delete(sessionsTable)
    .where(eq(sessionsTable.id, sessionId))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  res.json({ ok: true });
});
