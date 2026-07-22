import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Show, useUser, useClerk } from "@clerk/react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trophy, Activity, LogOut, User, ChevronRight, Clock, Shield, Download, Lock } from "lucide-react";
import { getHistory, formatVisitedAt, defaultGameName, type HistoryEntry } from "@/lib/history";
import { useInstallPrompt } from "@/hooks/use-install-prompt";
import { InstallBanner } from "@/components/ui/install-banner";

type LiveMatchItem = {
  id: string;
  type: "tournament" | "open_play";
  name: string;
  href: string;
  statusLabel: string;
  playerCount: number;
  createdAt: string;
};

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
  const [creatingTournament, setCreatingTournament] = useState(false);
  const [creatingSession, setCreatingSession] = useState(false);
  const [tournamentCreationEnabled, setTournamentCreationEnabled] = useState(true);
  const [openPlayCreationEnabled, setOpenPlayCreationEnabled] = useState(true);
  const [adminBypass, setAdminBypass] = useState(false);
  const [liveItems, setLiveItems] = useState<LiveMatchItem[]>([]);
  const [liveLoaded, setLiveLoaded] = useState(false);
  const { user } = useUser();
  const { signOut } = useClerk();
  const installPrompt = useInstallPrompt();
  const { manualShow, canShowInstallButton } = installPrompt;
  const adminCode = typeof window !== "undefined" ? localStorage.getItem("pbj_admin_code") : null;

  useEffect(() => {
    let cancelled = false;

    const loadCreationSettings = async () => {
      try {
        const res = await fetch("/api/settings/public", { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json() as {
          tournamentCreationEnabled?: boolean;
          openPlayCreationEnabled?: boolean;
        };
        if (cancelled) return;
        setTournamentCreationEnabled(data.tournamentCreationEnabled ?? true);
        setOpenPlayCreationEnabled(data.openPlayCreationEnabled ?? true);
      } catch {
        // Keep defaults enabled if settings endpoint is unavailable.
      }
    };

    const verifyAdminBypass = async () => {
      if (!adminCode) {
        if (!cancelled) setAdminBypass(false);
        return;
      }

      try {
        const res = await fetch("/api/admin/verify", {
          headers: { "x-admin-code": adminCode },
          credentials: "include",
        });
        if (!cancelled) setAdminBypass(res.ok);
      } catch {
        if (!cancelled) setAdminBypass(false);
      }
    };

    const loadLiveMatches = async () => {
      try {
        const res = await fetch("/api/settings/live", { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json() as { items?: LiveMatchItem[] };
        if (cancelled) return;
        setLiveItems(data.items ?? []);
      } catch {
        if (!cancelled) setLiveItems([]);
      } finally {
        if (!cancelled) setLiveLoaded(true);
      }
    };

    void Promise.all([loadCreationSettings(), verifyAdminBypass(), loadLiveMatches()]);
    const refresh = window.setInterval(() => {
      void loadLiveMatches();
    }, 15_000);

    return () => {
      cancelled = true;
      window.clearInterval(refresh);
    };
  }, [adminCode]);

  const createLockedMessage = "Match creation is locked by the admin.";
  const canCreateTournament = tournamentCreationEnabled || adminBypass;
  const canCreateOpenPlay = openPlayCreationEnabled || adminBypass;
  const isCreating = creatingTournament || creatingSession;

  const handleCreateTournament = async () => {
    if (!canCreateTournament) return;

    setCreatingTournament(true);
    try {
      const res = await fetch("/api/tournaments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(adminBypass && adminCode ? { "x-admin-code": adminCode } : {}),
        },
        credentials: "include",
        body: JSON.stringify({ name: defaultGameName() }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({} as { error?: string; message?: string }));
        if (res.status === 403 && body?.error === "creation_locked") {
          toast({ title: createLockedMessage, variant: "destructive" });
          return;
        }
        throw new Error(body?.message || "Failed to create tournament");
      }

      const data = await res.json() as { id: string; hostToken: string };
      localStorage.setItem(`hostToken_${data.id}`, data.hostToken);
      setLocation(`/t/${data.id}`);
    } catch {
      toast({ title: "Error", description: "Failed to create tournament. Please try again.", variant: "destructive" });
    } finally {
      setCreatingTournament(false);
    }
  };

  const handleCreateSession = async () => {
    if (!canCreateOpenPlay) return;

    setCreatingSession(true);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(adminBypass && adminCode ? { "x-admin-code": adminCode } : {}),
        },
        credentials: "include",
        body: JSON.stringify({ name: defaultGameName() }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({} as { error?: string; message?: string }));
        if (res.status === 403 && body?.error === "creation_locked") {
          toast({ title: createLockedMessage, variant: "destructive" });
          return;
        }
        throw new Error(body?.message || "Failed to create session");
      }

      const data = await res.json() as { id: string; hostToken: string };
      localStorage.setItem(`sessionToken_${data.id}`, data.hostToken);
      setLocation(`/s/${data.id}`);
    } catch {
      toast({ title: "Error", description: "Failed to create session. Please try again.", variant: "destructive" });
    } finally {
      setCreatingSession(false);
    }
  };

  return (
    <div className="min-h-[100dvh] w-full flex flex-col items-center justify-center p-6 text-center relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/8 blur-[100px] rounded-full pointer-events-none" />

      <button
        type="button"
        onClick={() => setLocation("/pbj-101")}
        className="absolute top-4 left-4 z-50 rounded-full bg-[#2A2A2A] px-3 py-2 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-[#3A3A3A]"
      >
        Rules 101
      </button>

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
            <span className="inline-flex items-baseline gap-0.5">
              <span className="text-primary">JESUS</span>
              <img
                src={`${import.meta.env.BASE_URL}logo-favicon.png`}
                alt=""
                className="h-2 w-2 sm:h-2 sm:w-2 object-contain inline-block"
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
          disabled={isCreating || !canCreateTournament}
        >
          {creatingTournament ? (
            <Loader2 className="mr-2 h-6 w-6 animate-spin" />
          ) : !canCreateTournament ? (
            <><Lock className="mr-2.5 h-5 w-5" /> CREATE TOURNAMENT</>
          ) : (
            <><Trophy className="mr-2.5 h-5 w-5" /> CREATE TOURNAMENT</>
          )}
        </Button>
        {!canCreateTournament && (
          <p className="text-xs text-muted-foreground">Match creation is locked by the admin.</p>
        )}

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
          disabled={isCreating || !canCreateOpenPlay}
        >
          {creatingSession ? (
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          ) : !canCreateOpenPlay ? (
            <><Lock className="mr-2.5 h-5 w-5" /> START OPEN PLAY</>
          ) : (
            <><Activity className="mr-2.5 h-5 w-5" /> START OPEN PLAY</>
          )}
        </Button>
        {!canCreateOpenPlay && (
          <p className="text-xs text-muted-foreground">Match creation is locked by the admin.</p>
        )}

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

        <div className="w-full rounded-2xl border border-border/60 bg-card/80 p-4 text-left space-y-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold uppercase tracking-wider">Join a Live Match</h3>
          </div>

          {!liveLoaded ? (
            <p className="text-xs text-muted-foreground">Loading live matches…</p>
          ) : liveItems.length === 0 ? (
            <p className="text-xs text-muted-foreground">No live matches right now. Check back soon.</p>
          ) : (
            <div className="space-y-2">
              {liveItems.map((item) => (
                <button
                  key={`${item.type}_${item.id}`}
                  type="button"
                  onClick={() => setLocation(item.href)}
                  className="w-full rounded-xl border border-border/50 bg-background/80 px-3 py-2 text-left transition-colors hover:bg-background"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{item.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.type === "tournament" ? "Tournament" : "Open Play"} · {item.statusLabel} · {item.playerCount} players
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground/60 shrink-0" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {canShowInstallButton && (
          <Button
            variant="outline"
            size="sm"
            className="w-full rounded-2xl border-border/70 bg-background/80 px-4 py-3 text-sm font-semibold text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            onClick={manualShow}
          >
            <Download className="w-4 h-4 mr-2" />
            Install App
          </Button>
        )}

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

      {/* Install Banner Modal */}
      <InstallBanner
        shouldShow={installPrompt.shouldShow}
        platform={installPrompt.platform}
        dismiss={installPrompt.dismiss}
        triggerInstall={installPrompt.triggerInstall}
        deferredPrompt={installPrompt.deferredPrompt}
      />
    </div>
  );
}
