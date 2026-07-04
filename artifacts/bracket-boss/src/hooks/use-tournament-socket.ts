import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetTournamentQueryKey } from "@workspace/api-client-react";

export function useTournamentSocket(tournamentId: string | undefined) {
  const [isConnected, setIsConnected] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!tournamentId) return;

    let ws: WebSocket;
    let reconnectTimeout: ReturnType<typeof setTimeout>;

    const connect = () => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws?tournamentId=${tournamentId}`;
      
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setIsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "tournament_update" && data.payload) {
            queryClient.setQueryData(getGetTournamentQueryKey(tournamentId), data.payload);
          }
        } catch (error) {
          console.error("Failed to parse websocket message", error);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        // Reconnect after 2 seconds
        reconnectTimeout = setTimeout(connect, 2000);
      };

      ws.onerror = (error) => {
        console.error("WebSocket error", error);
        ws.close();
      };
    };

    connect();

    return () => {
      clearTimeout(reconnectTimeout);
      if (ws) {
        ws.close();
      }
    };
  }, [tournamentId, queryClient]);

  return { isConnected };
}
