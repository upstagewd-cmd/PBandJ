import { useEffect } from "react";
import { useParams, useLocation, useSearch } from "wouter";
import { Show, useUser } from "@clerk/react";
import { useGetTournament, getGetTournamentQueryKey } from "@workspace/api-client-react";
import { useTournamentSocket } from "@/hooks/use-tournament-socket";
import { TournamentLobby } from "@/components/tournament/lobby";
import { TournamentBracket } from "@/components/tournament/bracket";
import { TournamentChampionship } from "@/components/tournament/championship";
import { Loader2, User, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { upsertHistory, removeHistory } from "@/lib/history";

function UserBadge() {
  const { user } = useUser();
  const [, setLocation] = useLocation();
  return (
    <button
      onClick={() => setLocation("/profile")}
      className="flex items-center gap-1.5 bg-card border border-border/40 rounded-full px-2.5 py-1 hover:border-primary/40 transition-colors"
    >
      <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden">
        {user?.imageUrl ? (
          <img src={user.imageUrl} alt="" className="w-5 h-5 rounded-full object-cover" />
        ) : (
          <User className="w-3 h-3 text-primary" />
        )}
      </div>
      <span className="text-xs font-semibold text-foreground hidden sm:block">
        {user?.firstName ?? "Player"}
      </span>
    </button>
  );
}

export default function TournamentPage() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const tournamentId = params.tournamentId!;

  const urlParams = new URLSearchParams(search);
  const tokenFromUrl = urlParams.get("token");

  useEffect(() => {
    if (tokenFromUrl && tournamentId) {
      localStorage.setItem(`hostToken_${tournamentId}`, tokenFromUrl);
    }
  }, [tokenFromUrl, tournamentId]);

  const hostToken =
    tokenFromUrl ??
    (typeof window !== "undefined"
      ? localStorage.getItem(`hostToken_${tournamentId}`)
      : null);

  const { data: tournament, isLoading, isError } = useGetTournament(tournamentId, {
    query: {
      enabled: !!tournamentId,
      retry: false,
      queryKey: getGetTournamentQueryKey(tournamentId),
    },
  });

  useEffect(() => {
    if (tournament) {
      upsertHistory({
        id: tournament.id,
        type: "tournament",
        name: tournament.name,
        status: tournament.status,
      });
    }
  }, [tournament?.id, tournament?.name, tournament?.status]);

  const queryClient = useQueryClient();
  const handleRefresh = () => queryClient.refetchQueries({ queryKey: getGetTournamentQueryKey(tournamentId) });

  useTournamentSocket(tournamentId);

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center space-y-4">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
        <p className="text-muted-foreground font-bold uppercase tracking-widest animate-pulse">
          Loading Bracket...
        </p>
      </div>
    );
  }

  if (isError || !tournament) {
    if (tournamentId) removeHistory(tournamentId);
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center p-6 text-center space-y-6">
        <div className="w-24 h-24 bg-destructive/10 rounded-full flex items-center justify-center">
          <span className="text-4xl">🤔</span>
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight">Tournament Not Found</h1>
        <p className="text-muted-foreground max-w-sm">
          We couldn't find this tournament. It might have been deleted or the URL is incorrect.
        </p>
        <Button onClick={() => setLocation("/")} size="lg" className="h-14 font-bold rounded-xl mt-4">
          Go Home
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] w-full flex flex-col">
      <header className="h-14 border-b border-border/40 flex items-center justify-between px-4 md:px-6 bg-background/95 backdrop-blur z-50 sticky top-0">
        <div
          className="font-display text-xl cursor-pointer"
          onClick={() => setLocation("/")}
        >
          PB<span className="text-primary">&amp;J</span>
        </div>
        <div className="flex items-center gap-2">
          <Show when="signed-in">
            <UserBadge />
          </Show>
          {hostToken && (
            <span className="text-xs font-bold uppercase tracking-widest text-primary bg-primary/10 px-3 py-1.5 rounded-full">
              Host
            </span>
          )}
          <button
            onClick={handleRefresh}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="flex-1 w-full max-w-[1400px] mx-auto p-4 md:p-6 py-6 md:py-8">
        {tournament.status === "lobby" && (
          <TournamentLobby
            tournament={tournament}
            hostToken={hostToken}
            returnPath={`/t/${tournamentId}${search || ""}`}
          />
        )}
        {tournament.status === "active" && (
          <TournamentBracket tournament={tournament} hostToken={hostToken} />
        )}
        {tournament.status === "completed" && (
          <TournamentChampionship tournament={tournament} />
        )}
      </main>
    </div>
  );
}
