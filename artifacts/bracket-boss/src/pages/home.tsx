import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Show, useUser, useClerk } from "@clerk/react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trophy, Activity, LogOut, User, ChevronRight, Clock, Shield, Download, Lock } from "lucide-react";
import { formatVisitedAt, defaultGameName } from "@/lib/history";
import { useInstallPrompt } from "@/hooks/use-install-prompt";
import { InstallBanner } from "@/components/ui/install-banner";
import { useListChampionships } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type LiveMatchItem = {
  id: string;
  type: "tournament" | "open_play";
  name: string;
  href: string;
  statusLabel: string;
  playerCount: number;
  createdAt: string;
};

const REGULAR_TOURNAMENT_VALUE = "__regular_tournament__";
const ACTIVITY_PAGE_SIZE = 15;

type ActivityPlayer = { id: string; firstName: string; lastName: string; nickname: string | null; avatarUrl: string | null };
type ActivitySide = { name: string; players: ActivityPlayer[] };
type ActivityItem = {
  id: string;
  type: "tournament" | "open_play" | "session";
  contextName: string;
  bracket: string;
  round: number;
  playedAt: string;
  teamOne: ActivitySide;
  teamTwo: ActivitySide;
  scoreOne: number | null;
  scoreTwo: number | null;
  winnerTeam: 1 | 2;
};

function bracketLabel(item: ActivityItem): string {
  if (item.type !== "tournament") return "Open Play";
  switch (item.bracket) {
    case "winner": return `WB R${item.round}`;
    case "loser": return `LB R${item.round}`;
    case "grand_finals": return "Grand Finals";
    case "grand_finals_reset": return "GF Reset";
    default: return `R${item.round}`;
  }
}

function RecentActivity() {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadPage = async (nextOffset: number, append: boolean) => {
    try {
      const res = await fetch(`/api/activity?limit=${ACTIVITY_PAGE_SIZE}&offset=${nextOffset}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load activity");
      const data = await res.json() as { items: ActivityItem[]; hasMore: boolean };
      setItems((prev) => (append ? [...prev, ...data.items] : data.items));
      setHasMore(data.hasMore);
      setOffset(nextOffset + data.items.length);
    } catch {
      if (!append) setItems([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    void loadPage(0, false);
  }, []);

  if (!loading && items.length === 0) return null;

  return (
    <div className="w-full">
      <div className="bg-muted rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Recent Games
          </span>
        </div>

        {loading ? (
          <p className="text-xs text-muted-foreground">Loading recent matches…</p>
        ) : (
          <div className="space-y-2">
            {items.map((item) => {
              const teamOneWon = item.winnerTeam === 1;
              return (
                <div key={item.id} className="bg-background border border-border rounded-xl px-4 py-3 shadow-sm space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-muted-foreground truncate">
                      {item.contextName} · {bracketLabel(item)}
                    </p>
                    <span className="text-xs text-muted-foreground shrink-0">{formatVisitedAt(item.playedAt)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <p className={`text-sm font-bold truncate ${teamOneWon ? "text-foreground" : "text-muted-foreground"}`}>
                      {teamOneWon && <Trophy className="inline w-3 h-3 mr-1 mb-0.5 text-gold" />}
                      {item.teamOne.name}
                    </p>
                    {(item.scoreOne !== null || item.scoreTwo !== null) && (
                      <span className="font-mono text-sm text-muted-foreground shrink-0">
                        {item.scoreOne ?? "–"}–{item.scoreTwo ?? "–"}
                      </span>
                    )}
                  </div>
                  <p className={`text-sm font-bold truncate ${!teamOneWon ? "text-foreground" : "text-muted-foreground"}`}>
                    {!teamOneWon && <Trophy className="inline w-3 h-3 mr-1 mb-0.5 text-gold" />}
                    {item.teamTwo.name}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {hasMore && (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            disabled={loadingMore}
            onClick={() => {
              setLoadingMore(true);
              void loadPage(offset, true);
            }}
          >
            {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : "Load More"}
          </Button>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [creatingTournament, setCreatingTournament] = useState(false);
  const [creatingSession, setCreatingSession] = useState(false);
  const [selectedChampionshipId, setSelectedChampionshipId] = useState(REGULAR_TOURNAMENT_VALUE);
  const [tournamentSetupOpen, setTournamentSetupOpen] = useState(false);
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
  const { data: championships = [] } = useListChampionships();

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
  const canCreateTournament = (!!user || adminBypass) && (tournamentCreationEnabled || adminBypass);
  const canCreateOpenPlay = (!!user || adminBypass) && (openPlayCreationEnabled || adminBypass);
  const needsSignIn = !user && !adminBypass;
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
        body: JSON.stringify({
          name: defaultGameName(),
          ...(selectedChampionshipId !== REGULAR_TOURNAMENT_VALUE ? { championshipId: selectedChampionshipId } : {}),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({} as { error?: string; message?: string }));
        if (res.status === 403 && body?.error === "creation_locked") {
          toast({ title: createLockedMessage, variant: "destructive" });
          return;
        }
        if (res.status === 401) {
          toast({ title: "Sign in required", description: "Please sign in to create a tournament.", variant: "destructive" });
          setLocation("/sign-in");
          return;
        }
        throw new Error(body?.message || "Failed to create tournament");
      }

      const data = await res.json() as { id: string; hostToken: string };
      localStorage.setItem(`hostToken_${data.id}`, data.hostToken);
      setTournamentSetupOpen(false);
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
        if (res.status === 401) {
          toast({ title: "Sign in required", description: "Please sign in to start open play.", variant: "destructive" });
          setLocation("/sign-in");
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
          onClick={() => setTournamentSetupOpen(true)}
          disabled={isCreating || !canCreateTournament}
        >
          {creatingTournament ? (
            <Loader2 className="mr-2 h-6 w-6 animate-spin" />
          ) : needsSignIn ? (
            <><Lock className="mr-2.5 h-5 w-5" /> SIGN IN TO CREATE</>
          ) : !canCreateTournament ? (
            <><Lock className="mr-2.5 h-5 w-5" /> CREATE TOURNAMENT</>
          ) : (
            <><Trophy className="mr-2.5 h-5 w-5" /> CREATE TOURNAMENT</>
          )}
        </Button>
        <Dialog open={tournamentSetupOpen} onOpenChange={setTournamentSetupOpen}>
          <DialogContent className="max-w-md rounded-2xl p-5 sm:p-6">
            <DialogHeader>
              <DialogTitle>Set up your tournament</DialogTitle>
              <DialogDescription>Choose whether this tournament is a regular event or a championship contest.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2 text-left">
              <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Championship on the line
              </label>
              <Select
                value={selectedChampionshipId}
                onValueChange={setSelectedChampionshipId}
              >
                <SelectTrigger className="h-12 rounded-xl bg-background text-sm font-semibold">
                  <SelectValue placeholder="Regular tournament" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={REGULAR_TOURNAMENT_VALUE}>Regular tournament</SelectItem>
                  {championships.map((championship) => (
                    <SelectItem key={championship.id} value={championship.id}>
                      {championship.name}{championship.currentPlayer1Id ? " (defended)" : " (unclaimed)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setTournamentSetupOpen(false)}>Cancel</Button>
              <Button onClick={handleCreateTournament} disabled={creatingTournament}>
                {creatingTournament ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trophy className="mr-2 h-4 w-4" />}
                Create Tournament
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {!canCreateTournament && (
          <p className="text-xs text-muted-foreground">
            {needsSignIn ? "Sign in to create a tournament." : "Match creation is locked by the admin."}
          </p>
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
          ) : needsSignIn ? (
            <><Lock className="mr-2.5 h-5 w-5" /> SIGN IN TO PLAY</>
          ) : !canCreateOpenPlay ? (
            <><Lock className="mr-2.5 h-5 w-5" /> START OPEN PLAY</>
          ) : (
            <><Activity className="mr-2.5 h-5 w-5" /> START OPEN PLAY</>
          )}
        </Button>
        {!canCreateOpenPlay && (
          <p className="text-xs text-muted-foreground">
            {needsSignIn ? "Sign in to start open play." : "Match creation is locked by the admin."}
          </p>
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
        <RecentActivity />
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
