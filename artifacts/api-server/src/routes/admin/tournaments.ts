import { Router } from "express";
import { db } from "@workspace/db";
import { tournamentsTable, playersTable, matchesTable } from "@workspace/db/schema";
import { eq, desc, count } from "drizzle-orm";

export const adminTournamentsRouter = Router();

adminTournamentsRouter.get("/", async (req, res) => {
  const tournaments = await db
    .select()
    .from(tournamentsTable)
    .orderBy(desc(tournamentsTable.createdAt));

  const withCounts = await Promise.all(
    tournaments.map(async (t) => {
      const [playerCount] = await db
        .select({ count: count() })
        .from(playersTable)
        .where(eq(playersTable.tournamentId, t.id));
      const [matchCount] = await db
        .select({ count: count() })
        .from(matchesTable)
        .where(eq(matchesTable.tournamentId, t.id));
      return {
        ...t,
        playerCount: Number(playerCount?.count ?? 0),
        matchCount: Number(matchCount?.count ?? 0),
      };
    }),
  );

  res.json(withCounts);
});

adminTournamentsRouter.patch("/:tournamentId", async (req, res) => {
  const { tournamentId } = req.params;
  const { name, status } = req.body as Record<string, unknown>;

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (status !== undefined) {
    updates.status = status;
    if (status === "completed") updates.completedAt = new Date();
  }

  const [updated] = await db
    .update(tournamentsTable)
    .set(updates)
    .where(eq(tournamentsTable.id, tournamentId))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Tournament not found" });
    return;
  }
  res.json(updated);
});

adminTournamentsRouter.delete("/:tournamentId", async (req, res) => {
  const { tournamentId } = req.params;
  await db.delete(matchesTable).where(eq(matchesTable.tournamentId, tournamentId));
  await db.delete(playersTable).where(eq(playersTable.tournamentId, tournamentId));
  const [deleted] = await db
    .delete(tournamentsTable)
    .where(eq(tournamentsTable.id, tournamentId))
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "Tournament not found" });
    return;
  }
  res.json({ ok: true });
});
