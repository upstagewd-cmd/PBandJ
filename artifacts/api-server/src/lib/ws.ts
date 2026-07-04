import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import { logger } from "./logger";

interface TournamentClient {
  ws: WebSocket;
  tournamentId: string;
}

const clients: Set<TournamentClient> = new Set();

export function setupWebSocket(wss: WebSocketServer) {
  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url ?? "", `http://localhost`);
    const tournamentId = url.searchParams.get("tournamentId");

    if (!tournamentId) {
      ws.close(1008, "Missing tournamentId");
      return;
    }

    const client: TournamentClient = { ws, tournamentId };
    clients.add(client);

    logger.info({ tournamentId }, "WebSocket client connected");

    ws.on("close", () => {
      clients.delete(client);
      logger.info({ tournamentId }, "WebSocket client disconnected");
    });

    ws.on("error", (err) => {
      logger.error({ err, tournamentId }, "WebSocket error");
      clients.delete(client);
    });
  });
}

export function broadcastTournamentUpdate(tournamentId: string, data: unknown) {
  const message = JSON.stringify({ type: "tournament_update", data });
  for (const client of clients) {
    if (client.tournamentId === tournamentId && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(message);
    }
  }
}
