import { Router, type IRouter } from "express";
import healthRouter from "./health";
import { tournamentsRouter } from "./tournaments";
import { playersRouter } from "./players";
import { matchesRouter } from "./matches";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/tournaments", tournamentsRouter);
router.use("/tournaments/:tournamentId/players", playersRouter);
router.use("/tournaments/:tournamentId/matches", matchesRouter);

export default router;
