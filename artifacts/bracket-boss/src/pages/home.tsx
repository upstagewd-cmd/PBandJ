import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Show, useUser, useClerk } from "@clerk/react";
import { useCreateTournament, useCreateSession } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trophy, Activity, LogOut, User, ChevronRight, Clock } from "lucide-react";
import { getHistory, formatVisitedAt, defaultGameName, type HistoryEntry } from "@/lib/history";

function RecentGames() {
  const [, setLocation] = useLocation();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    setEntries(getHistory());
  }, []);

  if (entries.length === 0) return null;

  const statusLabel = (e: HistoryEntry) => {
    if (e.type === "tournament") {
      if (e.status === "completed") return "Finished";
      if (e.status === "active") return "In Progress";
      return "Lobby";
    }
    return e.status === "completed" ? "Finished" : "Active";
  };

  const statusColor = (e: HistoryEntry) =>
    e.status === "completed"
      ? "text-muted-foreground/60"
      : e.status === "active"
      ? "text-green-500"
      : "text-orange-400";

  return (
    <div className="w-full space-y-3">
      <div className="flex items-center gap-2">
        <Clock className="w-3.5 h-3.5 text-muted-foreground/50" />
        <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground/50">
          Recent Games
        </span>
      </div>
      <div className="space-y-1.5">
        {entries.slice(0, 5).map((entry) => (
          <button
            key={entry.id}
            onClick={() => setLocation(entry.type === "tournament" ? `/t/${entry.id}` : `/s/${entry.id}`)}
            className="w-full flex items-center justify-between gap-3 bg-card/50 hover:bg-card border border-border/30 hover:border-border/60 rounded-xl px-4 py-3 transition-all group"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                {entry.type === "tournament" ? (
                  <Trophy className="w-3.5 h-3.5 text-primary" />
                ) : (
                  <Activity className="w-3.5 h-3.5 text-orange-400" />
                )}
              </div>
              <div className="min-w-0 text-left">
                <p className="text-sm font-bold text-foreground truncate">{entry.name}</p>
                <p className={`text-xs font-semibold ${statusColor(entry)}`}>
                  {statusLabel(entry)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-xs text-muted-foreground/50 hidden sm:block">
                {formatVisitedAt(entry.visitedAt)}
              </span>
              <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createTournament = useCreateTournament();
  const createSession = useCreateSession();
  const { user } = useUser();
  const { signOut } = useClerk();

  const handleCreateTournament = () => {
    createTournament.mutate(
      { data: { name: defaultGameName() } },
      {
        onSuccess: (data) => {
          localStorage.setItem(`hostToken_${data.id}`, data.hostToken);
          setLocation(`/t/${data.id}`);
        },
        onError: () => {
          toast({ title: "Error", description: "Failed to create tournament. Please try again.", variant: "destructive" });
        },
      }
    );
  };

  const handleCreateSession = () => {
    createSession.mutate(
      { data: { name: defaultGameName() } },
      {
        onSuccess: (data) => {
          localStorage.setItem(`sessionToken_${data.id}`, data.hostToken);
          setLocation(`/s/${data.id}`);
        },
        onError: () => {
          toast({ title: "Error", description: "Failed to create session. Please try again.", variant: "destructive" });
        },
      }
    );
  };

  return (
    <div className="min-h-[100dvh] w-full flex flex-col items-center justify-center p-6 text-center relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/20 blur-[120px] rounded-full pointer-events-none" />

      {/* Account bar */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
        <Show when="signed-out">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground font-semibold"
            onClick={() => setLocation("/sign-in")}
          >
            Sign In
          </Button>
          <Button
            size="sm"
            className="font-bold rounded-xl"
            onClick={() => setLocation("/sign-up")}
          >
            Create Account
          </Button>
        </Show>
        <Show when="signed-in">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setLocation("/profile")}
              className="flex items-center gap-2 bg-card border border-border/40 rounded-full px-3 py-1.5 hover:border-primary/40 transition-colors"
            >
              <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
                {user?.imageUrl ? (
                  <img src={user.imageUrl} alt="" className="w-6 h-6 rounded-full object-cover" />
                ) : (
                  <User className="w-3 h-3 text-primary" />
                )}
              </div>
              <span className="text-sm font-semibold text-foreground">
                {user?.firstName ?? user?.emailAddresses?.[0]?.emailAddress?.split("@")[0] ?? "Player"}
              </span>
            </button>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => signOut({ redirectUrl: "/" })}
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </Show>
      </div>

      <div className="relative z-10 space-y-6 max-w-md w-full">
        <div className="mx-auto w-24 h-24 bg-primary/10 rounded-3xl flex items-center justify-center border border-primary/20 shadow-[0_0_40px_rgba(255,100,50,0.2)]">
          <Trophy className="w-12 h-12 text-primary" />
        </div>

        <div className="space-y-2">
          <h1 className="text-5xl font-extrabold tracking-tight italic">
            PB<span className="text-primary">&amp;J</span>
          </h1>
          <p className="text-muted-foreground text-lg font-medium">
            Faith. Fellowship. Friendly Competition.
          </p>
          <p className="text-muted-foreground/60 text-sm">
            A Fellowship of Christian Competitors
          </p>
        </div>

        {/* Primary: Create Tournament */}
        <Button
          size="lg"
          className="w-full h-16 text-xl font-bold rounded-2xl transition-transform active:scale-95 shadow-[0_0_20px_rgba(255,100,50,0.3)] hover:shadow-[0_0_30px_rgba(255,100,50,0.4)]"
          onClick={handleCreateTournament}
          disabled={createTournament.isPending || createSession.isPending}
        >
          {createTournament.isPending ? (
            <Loader2 className="mr-2 h-6 w-6 animate-spin" />
          ) : (
            <><Trophy className="mr-2.5 h-5 w-5" /> CREATE TOURNAMENT</>
          )}
        </Button>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-border/40" />
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground/50">or</span>
          <div className="flex-1 h-px bg-border/40" />
        </div>

        {/* Secondary: Open Play */}
        <Button
          size="lg"
          variant="outline"
          className="w-full h-14 text-base font-bold rounded-2xl transition-transform active:scale-95 border-orange-500/30 text-orange-400 hover:bg-orange-500/10 hover:border-orange-500/50"
          onClick={handleCreateSession}
          disabled={createTournament.isPending || createSession.isPending}
        >
          {createSession.isPending ? (
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          ) : (
            <><Activity className="mr-2.5 h-5 w-5" /> START OPEN PLAY</>
          )}
        </Button>

        <Show when="signed-out">
          <p className="text-muted-foreground/60 text-xs">
            <button
              className="underline underline-offset-2 hover:text-muted-foreground transition-colors"
              onClick={() => setLocation("/sign-up")}
            >
              Create a free account
            </button>{" "}
            to track your stats &amp; ELO across tournaments
          </p>
        </Show>

        {/* Recent Games */}
        <RecentGames />
      </div>
    </div>
  );
}
