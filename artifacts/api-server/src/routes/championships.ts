import { Router } from "express";
import { db } from "@workspace/db";
import { championshipsTable } from "@workspace/db/schema";
import { asc, eq } from "drizzle-orm";

export const championshipsRouter = Router();

championshipsRouter.get("/", async (_req, res) => {
  const championships = await db
    .select()
    .from(championshipsTable)
    .where(eq(championshipsTable.enabled, true))
    .orderBy(asc(championshipsTable.name));

  res.json(championships);
});