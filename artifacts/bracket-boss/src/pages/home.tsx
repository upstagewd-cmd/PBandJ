import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Show, useUser, useClerk } from "@clerk/react";
import { useCreateTournament, useCreateSession } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trophy, Activity, LogOut, User, ChevronRight, Clock, Shield, Download } from "lucide-react";
import { getHistory, formatVisitedAt, defaultGameName, type HistoryEntry } from "@/lib/history";
import { useInstallPrompt } from "@/hooks/use-install-prompt";

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
      if (e.status === "cancelled") return "Cancelled";
      return "Lobby";
    }
    if (e.status === "completed") return "Finished";
    if (e.status === "closed") return "Closed";
    return "Active";
  };

  const statusColor = (e: HistoryEntry) =>
    e.status === "completed" || e.status === "closed" || e.status === "cancelled"
      ? "text-muted-foreground/60"
      : e.status === "active"
      ? "text-green-600"
      : "text-primary";

  return (
    <div className="w-full">
      <div className="bg-muted rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Recent Games
          </span>
        </div>
        <div className="space-y-2">
          {entries.slice(0, 5).map((entry) => (
            <button
              key={entry.id}
              onClick={() => setLocation(entry.type === "tournament" ? `/t/${entry.id}` : `/s/${entry.id}`)}
              className="w-full flex items-center justify-between gap-3 bg-background hover:bg-background/80 border border-border rounded-xl px-4 py-3 transition-all group shadow-sm"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                  {entry.type === "tournament" ? (
                    <Trophy className="w-3.5 h-3.5 text-primary" />
                  ) : (
                    <Activity className="w-3.5 h-3.5 text-primary" />
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
                <span className="text-xs text-muted-foreground hidden sm:block">
                  {formatVisitedAt(entry.visitedAt)}
                </span>
                <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
              </div>
            </button>
          ))}
        </div>
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
  const { platform, manualShow } = useInstallPrompt();

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
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/8 blur-[100px] rounded-full pointer-events-none" />

      {/* Install App button (desktop only) */}
      {platform === "desktop" && (
        <Button
          variant="ghost"
          size="sm"
          className="absolute top-4 left-4 text-muted-foreground hover:text-foreground font-semibold hidden sm:flex"
          onClick={manualShow}
        >
          <Download className="w-4 h-4 mr-2" />
          Install App
        </Button>
      )}

      {/* Account bar */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-50">
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

      <div className="relative z-10 space-y-6 max-w-md w-full py-20 sm:py-8">
        <div className="mx-auto w-28 h-28 bg-[#111111] rounded-3xl flex items-center justify-center overflow-hidden shadow-xl">
          <img
            src={`${import.meta.env.BASE_URL}logo-main-transparent.png`}
            alt="PB&J"
            className="w-24 h-24 object-contain"
          />
        </div>

        <div className="space-y-1.5">
          <p className="text-foreground font-display text-3xl sm:text-4xl leading-none tracking-[0.02em] uppercase">
            <span className="block">PICKLEBALL &</span>
            <span className="inline-flex items-center gap-0.5">
              <span className="text-primary">JESUS</span>
              <img
                src={`${import.meta.env.BASE_URL}logo-favicon.png`}
                alt=""
                className="h-4 w-4 sm:h-5 sm:w-5 object-contain inline-block"
              />
            </span>
          </p>
          <p className="text-muted-foreground text-base sm:text-lg italic">
            As a man Dinketh
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
          className="w-full h-14 text-base font-bold rounded-2xl transition-transform active:scale-95 border-[#2A2A2A] text-[#2A2A2A] hover:bg-[#2A2A2A]/5"
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

        <button
          onClick={() => setLocation("/players")}
          className="w-full rounded-2xl border border-[#111111] bg-[#111111] px-4 py-3 text-sm font-semibold text-[#f5f4f0] transition-colors hover:bg-[#2A2A2A]"
        >
          Browse players & leaderboard
        </button>

        {/* Recent Games */}
        <RecentGames />
      </div>

      {/* Footer */}
      <div className="absolute bottom-4 left-0 right-0 flex justify-center">
        <button
          onClick={() => setLocation("/admin")}
          className="flex items-center gap-1.5 text-xs text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors"
        >
          <Shield className="w-3 h-3" />
          Admin
        </button>
      </div>
    </div>
  );
}
