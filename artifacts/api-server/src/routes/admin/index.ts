import { Router } from "express";
import { adminAuth } from "./middleware.js";
import { adminPlayersRouter } from "./players.js";
import { adminMatchesRouter } from "./matches.js";
import { adminTournamentsRouter } from "./tournaments.js";
import { adminRatingsRouter } from "./ratings.js";
import { adminRanksRouter } from "./ranks.js";
import { adminBadgesRouter } from "./badges.js";
import { adminSettingsRouter } from "./settings.js";
import { adminSessionsRouter } from "./sessions.js";

export const adminRouter = Router();

adminRouter.use(adminAuth);

adminRouter.get("/verify", (_req, res) => res.json({ ok: true }));

adminRouter.use("/players", adminPlayersRouter);
adminRouter.use("/matches", adminMatchesRouter);
adminRouter.use("/tournaments", adminTournamentsRouter);
adminRouter.use("/ratings", adminRatingsRouter);
adminRouter.use("/ranks", adminRanksRouter);
adminRouter.use("/badges", adminBadgesRouter);
adminRouter.use("/settings", adminSettingsRouter);
adminRouter.use("/sessions", adminSessionsRouter);
