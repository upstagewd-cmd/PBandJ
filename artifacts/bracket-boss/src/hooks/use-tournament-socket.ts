import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetTournamentQueryKey } from "@workspace/api-client-react";
import { useUser } from "@clerk/react";
import { toast } from "@/hooks/use-toast";
import { hasSeenBadgeGrantId, markSeenBadgeGrantIds } from "@/lib/badge-notification-state";

export function useTournamentSocket(tournamentId: string | undefined) {
  const [isConnected, setIsConnected] = useState(false);
  const queryClient = useQueryClient();
  const { user } = useUser();

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
        // Refetch on every (re)connect so the UI is never stale
        queryClient.refetchQueries({ queryKey: getGetTournamentQueryKey(tournamentId) });
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "tournament_update" && msg.data) {
            queryClient.setQueryData(getGetTournamentQueryKey(tournamentId), msg.data);
          } else if (msg.type === "match_deleted") {
            queryClient.invalidateQueries({ queryKey: ["openPlayPool", tournamentId] });
            queryClient.invalidateQueries({ queryKey: getGetTournamentQueryKey(tournamentId) });
          } else if (msg.type === "badge_unlocked" && Array.isArray(msg.awards)) {
            const seenNow: string[] = [];
            for (const award of msg.awards as Array<{
              grantId: string;
              clerkUserId: string | null;
              playerName: string;
              badgeName: string;
              badgeIcon: string;
            }>) {
              if (!award.clerkUserId || !user?.id || award.clerkUserId !== user.id) continue;
              if (award.grantId && hasSeenBadgeGrantId(user.id, award.grantId)) continue;

              toast({
                title: `${award.badgeIcon} Badge Unlocked`,
                description: `${award.playerName} earned ${award.badgeName}`,
                duration: 2147483647,
              });

              if (award.grantId) seenNow.push(award.grantId);
            }

            if (user?.id && seenNow.length > 0) {
              markSeenBadgeGrantIds(user.id, seenNow);
            }
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        reconnectTimeout = setTimeout(connect, 2000);
      };

      ws.onerror = () => ws.close();
    };

    connect();

    return () => {
      clearTimeout(reconnectTimeout);
      ws?.close();
    };
  }, [tournamentId, queryClient, user?.id]);

  return { isConnected };
}
