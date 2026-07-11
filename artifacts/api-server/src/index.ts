import { createServer } from "http";
import { WebSocketServer } from "ws";
import app from "./app";
import { setupWebSocket } from "./lib/ws";
import { logger } from "./lib/logger";

const port = Number(process.env.PORT || 5000);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${process.env.PORT}"`);
}

const httpServer = createServer(app);

const wss = new WebSocketServer({
  server: httpServer,
  path: "/ws",
});

setupWebSocket(wss);

httpServer.listen(port, () => {
  logger.info({ port }, "Server listening");
});
