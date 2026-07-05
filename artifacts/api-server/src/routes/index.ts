import { Router, type IRouter } from "express";
import healthRouter from "./health";
import { tournamentsRouter } from "./tournaments";
import { playersRouter } from "./players";
import { matchesRouter } from "./matches";
import { openPlayRouter } from "./open-play";
import { playerStatsRouter } from "./player-stats";
import { profileRouter } from "./profile";
import storageRouter from "./storage";
import { adminRouter } from "./admin/index.js";
import { sessionsRouter } from "./sessions";

const router: IRouter = Router();

router.use(healthRouter);
router.use(storageRouter);
router.use("/tournaments", tournamentsRouter);
router.use("/tournaments/:tournamentId/players", playersRouter);
router.use("/tournaments/:tournamentId/matches", matchesRouter);
router.use("/tournaments/:tournamentId/open-play", openPlayRouter);
router.use("/players", playerStatsRouter);
router.use("/profile", profileRouter);
router.use("/admin", adminRouter);
router.use("/sessions", sessionsRouter);

export default router;
