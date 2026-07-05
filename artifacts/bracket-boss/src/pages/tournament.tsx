import { useEffect, useState, useRef } from "react";
import { useParams, useLocation, useSearch } from "wouter";
import { Show, useUser } from "@clerk/react";
import {
  useGetTournament,
  getGetTournamentQueryKey,
  useUpdateTournament,
} from "@workspace/api-client-react";
import { useTournamentSocket } from "@/hooks/use-tournament-socket";
import { TournamentLobby } from "@/components/tournament/lobby";
import { TournamentBracket } from "@/components/tournament/bracket";
import { TournamentChampionship } from "@/components/tournament/championship";
import { Loader2, WifiOff, User, Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { upsertHistory } from "@/lib/history";

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

function EditableName({
  name,
  tournamentId,
  hostToken,
}: {
  name: string;
  tournamentId: string;
  hostToken: string;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);
  const updateTournament = useUpdateTournament();

  useEffect(() => {
    setValue(name);
  }, [name]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const save = () => {
    const trimmed = value.trim();
    if (!trimmed || trimmed === name) { setEditing(false); return; }
    updateTournament.mutate(
      { tournamentId, data: { name: trimmed, hostToken } },
      { onSettled: () => setEditing(false) }
    );
  };

  const cancel = () => {
    setValue(name);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1.5 max-w-[220px] sm:max-w-xs">
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") cancel(); }}
          className="h-8 text-sm font-bold px-2 rounded-lg border-primary/40 focus-visible:ring-primary/30"
        />
        <button onClick={save} disabled={updateTournament.isPending} className="text-primary hover:text-primary/80 transition-colors">
          <Check className="w-4 h-4" />
        </button>
        <button onClick={cancel} className="text-muted-foreground hover:text-foreground transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="group flex items-center gap-1.5 max-w-[160px] sm:max-w-xs"
    >
      <span className="text-sm font-bold truncate text-foreground/80 group-hover:text-foreground transition-colors">
        {name}
      </span>
      <Pencil className="w-3 h-3 text-muted-foreground/50 group-hover:text-muted-foreground shrink-0 transition-colors" />
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
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="font-extrabold italic tracking-tight text-xl cursor-pointer shrink-0"
            onClick={() => setLocation("/")}
          >
            PB<span className="text-primary">&amp;J</span>
          </div>
          {hostToken ? (
            <EditableName
              name={tournament.name}
              tournamentId={tournamentId}
              hostToken={hostToken}
            />
          ) : (
            <span className="text-sm font-bold text-foreground/70 truncate max-w-[140px] sm:max-w-xs">
              {tournament.name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Show when="signed-in">
            <UserBadge />
          </Show>
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
