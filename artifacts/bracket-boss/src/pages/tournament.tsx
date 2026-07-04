import { useEffect } from "react";
import { useParams, useLocation, useSearch } from "wouter";
import { useGetTournament, getGetTournamentQueryKey } from "@workspace/api-client-react";
import { useTournamentSocket } from "@/hooks/use-tournament-socket";
import { TournamentLobby } from "@/components/tournament/lobby";
import { TournamentBracket } from "@/components/tournament/bracket";
import { TournamentChampionship } from "@/components/tournament/championship";
import { Loader2, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function TournamentPage() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const tournamentId = params.tournamentId!;

  // Resolve host token: URL param takes priority, then localStorage
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

  const { isConnected } = useTournamentSocket(tournamentId);

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
      <header className="h-16 border-b border-border/40 flex items-center justify-between px-4 md:px-6 bg-background/95 backdrop-blur z-50 sticky top-0">
        <div
          className="font-extrabold italic tracking-tight text-xl cursor-pointer"
          onClick={() => setLocation("/")}
        >
          BRACKET <span className="text-primary">BOSS</span>
        </div>
        <div className="flex items-center gap-2">
          {hostToken && (
            <span className="text-xs font-bold uppercase tracking-widest text-primary bg-primary/10 px-3 py-1.5 rounded-full">
              Host
            </span>
          )}
          {isConnected ? (
            <div className="flex items-center text-xs font-bold text-green-500 uppercase tracking-widest bg-green-500/10 px-3 py-1.5 rounded-full">
              <span className="w-2 h-2 rounded-full bg-green-500 mr-2 animate-pulse" />
              Live
            </div>
          ) : (
            <div className="flex items-center text-xs font-bold text-muted-foreground uppercase tracking-widest bg-muted px-3 py-1.5 rounded-full">
              <WifiOff className="w-3 h-3 mr-2" />
              Reconnecting...
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 w-full max-w-[1400px] mx-auto p-4 md:p-6 py-6 md:py-8">
        {tournament.status === "lobby" && (
          <TournamentLobby tournament={tournament} hostToken={hostToken} />
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
