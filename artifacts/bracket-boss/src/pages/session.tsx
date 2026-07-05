import { useState, useEffect, useRef } from "react";
import { useParams, useLocation, useSearch } from "wouter";
import {
  useGetSession,
  getGetSessionQueryKey,
  useAddSessionPlayer,
  useLogSessionMatch,
  useUpdateSession,
  SessionFull,
  SessionPlayer,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Show, useUser } from "@clerk/react";
import {
  Loader2,
  Plus,
  Trophy,
  Users,
  Activity,
  X,
  QrCode,
  Copy,
  Check,
  User,
  Pencil,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { upsertHistory } from "@/lib/history";

// ─── Header ───────────────────────────────────────────────────────────────────

function EditableSessionName({
  session,
  hostToken,
}: {
  session: SessionFull;
  hostToken: string;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(session.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const updateSession = useUpdateSession();

  useEffect(() => { setValue(session.name); }, [session.name]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const save = () => {
    const trimmed = value.trim();
    if (!trimmed || trimmed === session.name) { setEditing(false); return; }
    updateSession.mutate(
      { sessionId: session.id, data: { name: trimmed, hostToken } },
      { onSettled: () => setEditing(false) }
    );
  };

  const cancel = () => { setValue(session.name); setEditing(false); };

  if (editing) {
    return (
      <div className="flex items-center gap-1.5 max-w-[200px] sm:max-w-xs">
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") cancel(); }}
          className="h-8 text-sm font-bold px-2 rounded-lg border-primary/40 focus-visible:ring-primary/30"
        />
        <button onClick={save} disabled={updateSession.isPending} className="text-primary hover:text-primary/80 transition-colors">
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
      className="group flex items-center gap-1.5 max-w-[140px] sm:max-w-xs"
    >
      <span className="text-sm font-bold truncate text-foreground/80 group-hover:text-foreground transition-colors">
        {session.name}
      </span>
      <Pencil className="w-3 h-3 text-muted-foreground/50 group-hover:text-muted-foreground shrink-0 transition-colors" />
    </button>
  );
}

function SessionHeader({
  session,
  isHost,
  hostToken,
}: {
  session: SessionFull;
  isHost: boolean;
  hostToken: string | null;
}) {
  const [, setLocation] = useLocation();
  return (
    <header className="h-16 border-b border-border/40 flex items-center justify-between px-4 md:px-6 bg-background/95 backdrop-blur z-50 sticky top-0">
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="font-extrabold italic tracking-tight text-xl cursor-pointer shrink-0"
          onClick={() => setLocation("/")}
        >
          PB<span className="text-primary">&amp;J</span>
        </div>
        {isHost && hostToken ? (
          <EditableSessionName session={session} hostToken={hostToken} />
        ) : (
          <span className="text-sm font-bold text-foreground/70 truncate max-w-[140px] sm:max-w-xs">
            {session.name}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Show when="signed-in">
          <UserBadge />
        </Show>
        {isHost && (
          <span className="text-xs font-bold uppercase tracking-widest text-primary bg-primary/10 px-3 py-1.5 rounded-full">
            Host
          </span>
        )}
      </div>
    </header>
  );
}

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

// ─── Join Form ────────────────────────────────────────────────────────────────

function JoinForm({ sessionId, onJoined }: { sessionId: string; onJoined: () => void }) {
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [team, setTeam] = useState("");
  const addPlayer = useAddSessionPlayer();
  const { toast } = useToast();

  const handleJoin = () => {
    if (!first.trim() || !last.trim()) return;
    addPlayer.mutate(
      {
        sessionId,
        data: { firstName: first.trim(), lastName: last.trim(), teamName: team.trim() || undefined },
      },
      {
        onSuccess: () => {
          setFirst(""); setLast(""); setTeam("");
          onJoined();
          toast({ title: "You're in the pool! Start playing." });
        },
        onError: () => toast({ title: "Failed to join", variant: "destructive" }),
      }
    );
  };

  return (
    <div className="bg-card border border-border/50 rounded-2xl p-5 space-y-4">
      <h3 className="font-bold text-sm uppercase tracking-widest text-muted-foreground flex items-center gap-2">
        <Plus className="w-4 h-4" /> Add Player
      </h3>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground block mb-1.5">First</label>
          <Input
            value={first}
            onChange={(e) => setFirst(e.target.value)}
            placeholder="John"
            onKeyDown={(e) => e.key === "Enter" && handleJoin()}
          />
        </div>
        <div>
          <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground block mb-1.5">Last</label>
          <Input
            value={last}
            onChange={(e) => setLast(e.target.value)}
            placeholder="Doe"
            onKeyDown={(e) => e.key === "Enter" && handleJoin()}
          />
        </div>
      </div>
      <div>
        <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground block mb-1.5">
          Team Name <span className="normal-case font-normal">(optional)</span>
        </label>
        <Input
          value={team}
          onChange={(e) => setTeam(e.target.value)}
          placeholder="e.g. The Smashers"
          onKeyDown={(e) => e.key === "Enter" && handleJoin()}
        />
      </div>
      <Button
        className="w-full font-bold"
        onClick={handleJoin}
        disabled={!first.trim() || !last.trim() || addPlayer.isPending}
      >
        {addPlayer.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add to Pool"}
      </Button>
    </div>
  );
}

// ─── Match Logger ─────────────────────────────────────────────────────────────

function MatchLogger({
  sessionId,
  players,
  hostToken,
  onLogged,
}: {
  sessionId: string;
  players: SessionPlayer[];
  hostToken: string;
  onLogged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [t1Ids, setT1Ids] = useState<string[]>([]);
  const [t2Ids, setT2Ids] = useState<string[]>([]);
  const [scoreOne, setScoreOne] = useState("");
  const [scoreTwo, setScoreTwo] = useState("");
  const logMatch = useLogSessionMatch();
  const { toast } = useToast();

  const selectedIds = new Set([...t1Ids, ...t2Ids]);

  const toggle = (id: string, team: 1 | 2) => {
    const [ids, setIds] = team === 1 ? [t1Ids, setT1Ids] : [t2Ids, setT2Ids];
    if (ids.includes(id)) {
      setIds(ids.filter((x) => x !== id));
    } else if (ids.length < 2) {
      setIds([...ids, id]);
    }
  };

  const handleLog = (winnerTeam: 1 | 2) => {
    if (t1Ids.length === 0 || t2Ids.length === 0) return;
    logMatch.mutate(
      {
        sessionId,
        data: {
          hostToken,
          team1P1Id: t1Ids[0],
          team1P2Id: t1Ids[1],
          team2P1Id: t2Ids[0],
          team2P2Id: t2Ids[1],
          winnerTeam,
          scoreOne: scoreOne ? parseInt(scoreOne) : undefined,
          scoreTwo: scoreTwo ? parseInt(scoreTwo) : undefined,
        },
      },
      {
        onSuccess: () => {
          setT1Ids([]); setT2Ids([]); setScoreOne(""); setScoreTwo(""); setOpen(false);
          onLogged();
          toast({ title: "Match logged! Ratings updated." });
        },
        onError: () => toast({ title: "Failed to log match", variant: "destructive" }),
      }
    );
  };

  const reset = () => { setOpen(false); setT1Ids([]); setT2Ids([]); setScoreOne(""); setScoreTwo(""); };

  if (!open) {
    return (
      <Button
        onClick={() => setOpen(true)}
        disabled={players.length < 2}
        className="w-full font-bold gap-2"
      >
        <Plus className="w-4 h-4" /> Log Match
      </Button>
    );
  }

  const pName = (p: SessionPlayer) => p.teamName || `${p.firstName} ${p.lastName}`;

  return (
    <div className="bg-card border border-border/50 rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-bold text-sm">Log Match</h4>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={reset}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Player selection */}
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Select players for each team (up to 2 per team)</p>
        <div className="space-y-1.5">
          {players.map((p) => (
            <div
              key={p.id}
              className={`flex items-center justify-between rounded-xl px-3 py-2.5 transition-colors ${
                selectedIds.has(p.id) ? "bg-muted/60" : "bg-muted/20"
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="font-bold text-sm truncate">{pName(p)}</p>
                <p className="text-[10px] text-muted-foreground">{p.rankEmoji} {p.rankTitle} · {p.eloRating} ELO</p>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button
                  onClick={() => toggle(p.id, 1)}
                  disabled={!t1Ids.includes(p.id) && (selectedIds.has(p.id) || t1Ids.length >= 2)}
                  className={`text-xs font-bold px-2 py-1 rounded-lg border transition-colors ${
                    t1Ids.includes(p.id)
                      ? "bg-primary text-white border-primary"
                      : "border-border text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-30"
                  }`}
                >T1</button>
                <button
                  onClick={() => toggle(p.id, 2)}
                  disabled={!t2Ids.includes(p.id) && (selectedIds.has(p.id) || t2Ids.length >= 2)}
                  className={`text-xs font-bold px-2 py-1 rounded-lg border transition-colors ${
                    t2Ids.includes(p.id)
                      ? "bg-blue-500 text-white border-blue-500"
                      : "border-border text-muted-foreground hover:border-blue-500 hover:text-blue-500 disabled:opacity-30"
                  }`}
                >T2</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Team preview + score */}
      {(t1Ids.length > 0 || t2Ids.length > 0) && (
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-primary mb-1">Team 1</p>
            {t1Ids.length === 0
              ? <p className="text-muted-foreground italic text-xs">None selected</p>
              : t1Ids.map((id) => { const p = players.find((x) => x.id === id); return p ? <p key={id} className="font-bold truncate text-sm">{pName(p)}</p> : null; })
            }
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-blue-400 mb-1">Team 2</p>
            {t2Ids.length === 0
              ? <p className="text-muted-foreground italic text-xs">None selected</p>
              : t2Ids.map((id) => { const p = players.find((x) => x.id === id); return p ? <p key={id} className="font-bold truncate text-sm">{pName(p)}</p> : null; })
            }
          </div>
        </div>
      )}

      {/* Score inputs */}
      <div className="flex items-center justify-center gap-3">
        <input
          type="number" min={0} value={scoreOne}
          onChange={(e) => setScoreOne(e.target.value)}
          placeholder="T1"
          className="w-20 h-10 text-center rounded-xl border border-border bg-muted/50 text-sm font-bold focus:outline-none focus:border-primary"
        />
        <span className="text-muted-foreground font-bold text-lg">–</span>
        <input
          type="number" min={0} value={scoreTwo}
          onChange={(e) => setScoreTwo(e.target.value)}
          placeholder="T2"
          className="w-20 h-10 text-center rounded-xl border border-border bg-muted/50 text-sm font-bold focus:outline-none focus:border-blue-400"
        />
      </div>

      {/* Win buttons */}
      {t1Ids.length > 0 && t2Ids.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <Button onClick={() => handleLog(1)} disabled={logMatch.isPending} className="font-bold">
            {logMatch.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Trophy className="w-4 h-4 mr-1.5" /> Team 1 Won</>}
          </Button>
          <Button onClick={() => handleLog(2)} disabled={logMatch.isPending} variant="outline" className="font-bold border-blue-500/50 text-blue-400 hover:bg-blue-500/10">
            {logMatch.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Trophy className="w-4 h-4 mr-1.5" /> Team 2 Won</>}
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Share Card ───────────────────────────────────────────────────────────────

function ShareCard({ sessionId }: { sessionId: string }) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/s/${sessionId}`;
  const copy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="bg-card border border-border/50 rounded-2xl p-5 space-y-4">
      <h3 className="font-bold text-sm uppercase tracking-widest text-muted-foreground flex items-center gap-2">
        <QrCode className="w-4 h-4" /> Share Link
      </h3>
      <div className="flex justify-center bg-white rounded-xl p-4">
        <QRCodeSVG value={url} size={160} />
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-muted/40 rounded-xl px-3 py-2.5 text-xs font-mono text-muted-foreground truncate">
          {url}
        </div>
        <Button size="icon" variant="outline" className="shrink-0 rounded-xl" onClick={copy}>
          {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  );
}

// ─── Leaderboard ─────────────────────────────────────────────────────────────

function Leaderboard({ players, matchCount }: { players: SessionPlayer[]; matchCount: number }) {
  if (players.length === 0) return null;
  const sorted = [...players].sort((a, b) => b.eloRating - a.eloRating);
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
        <Activity className="w-3.5 h-3.5" />
        Standings · {matchCount} {matchCount === 1 ? "game" : "games"} played
      </h3>
      <div className="bg-card border border-border/50 rounded-2xl divide-y divide-border/30 overflow-hidden">
        {sorted.map((p, i) => (
          <div key={p.id} className="flex items-center gap-3 px-4 py-3">
            <span className={`text-sm font-extrabold w-5 text-center shrink-0 ${i === 0 ? "text-yellow-500" : "text-muted-foreground"}`}>
              {i + 1}
            </span>
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-xs font-bold text-primary">
              {p.firstName[0]}{p.lastName[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm truncate">
                {p.teamName || `${p.firstName} ${p.lastName}`}
              </p>
              <p className="text-[10px] text-muted-foreground">{p.rankEmoji} {p.rankTitle}</p>
            </div>
            <span className="text-sm font-bold text-muted-foreground shrink-0">{p.eloRating}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Match History ────────────────────────────────────────────────────────────

function MatchHistory({ session }: { session: SessionFull }) {
  if (session.recentMatches.length === 0) return null;
  const pName = (p: SessionPlayer) => p.teamName || `${p.firstName} ${p.lastName}`;
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Recent Games</h3>
      <div className="bg-card border border-border/50 rounded-2xl divide-y divide-border/30 overflow-hidden">
        {session.recentMatches.map((m) => {
          const winners = m.winnerTeam === 1 ? m.team1Players : m.team2Players;
          const losers = m.winnerTeam === 1 ? m.team2Players : m.team1Players;
          return (
            <div key={m.id} className="px-4 py-3 flex items-center gap-3">
              <Trophy className="w-4 h-4 text-yellow-500 shrink-0" />
              <div className="min-w-0 flex-1 text-sm">
                <span className="font-bold text-primary">{winners.map(pName).join(" & ")}</span>
                <span className="text-muted-foreground mx-1.5">beat</span>
                <span className="text-muted-foreground">{losers.map(pName).join(" & ")}</span>
              </div>
              {(m.scoreOne !== null || m.scoreTwo !== null) && (
                <span className="font-mono text-xs text-muted-foreground shrink-0">
                  {m.scoreOne ?? "–"}–{m.scoreTwo ?? "–"}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Session Page ─────────────────────────────────────────────────────────────

export default function SessionPage() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const sessionId = params.sessionId!;

  const urlParams = new URLSearchParams(search);
  const tokenFromUrl = urlParams.get("token");

  useEffect(() => {
    if (tokenFromUrl && sessionId) {
      localStorage.setItem(`sessionToken_${sessionId}`, tokenFromUrl);
    }
  }, [tokenFromUrl, sessionId]);

  const hostToken =
    tokenFromUrl ??
    (typeof window !== "undefined" ? localStorage.getItem(`sessionToken_${sessionId}`) : null);

  const { data: session, isLoading, isError, refetch } = useGetSession(sessionId, {
    query: {
      enabled: !!sessionId,
      retry: false,
      refetchInterval: 5000,
      queryKey: getGetSessionQueryKey(sessionId),
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center space-y-4">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
        <p className="text-muted-foreground font-bold uppercase tracking-widest animate-pulse">Loading...</p>
      </div>
    );
  }

  if (isError || !session) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center p-6 text-center space-y-6">
        <span className="text-5xl">🤔</span>
        <h1 className="text-3xl font-extrabold">Session Not Found</h1>
        <p className="text-muted-foreground max-w-sm">We couldn't find this open play session.</p>
        <Button onClick={() => setLocation("/")} size="lg" className="h-14 font-bold rounded-xl">
          Go Home
        </Button>
      </div>
    );
  }

  const isHost = !!hostToken;

  // Track visit history
  useEffect(() => {
    if (session) {
      upsertHistory({
        id: session.id,
        type: "session",
        name: session.name,
        status: session.status,
      });
    }
  }, [session?.id, session?.name, session?.status]);

  return (
    <div className="min-h-[100dvh] w-full flex flex-col">
      <SessionHeader session={session} isHost={isHost} hostToken={hostToken} />

      <main className="flex-1 w-full max-w-2xl mx-auto p-4 md:p-6 py-6 space-y-6">
        {/* Title */}
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Activity className="w-5 h-5 text-orange-400" />
            <h1 className="text-2xl font-extrabold tracking-tight text-primary">{session.name}</h1>
          </div>
          <p className="text-muted-foreground text-sm uppercase tracking-widest font-bold">
            Open Play · {session.players.length} {session.players.length === 1 ? "player" : "players"}
          </p>
        </div>

        {/* Share card — always visible */}
        <ShareCard sessionId={sessionId} />

        {/* Join form — always visible (anyone can add themselves) */}
        <JoinForm sessionId={sessionId} onJoined={() => refetch()} />

        {/* Match logger — host only, needs at least 2 players */}
        {isHost && session.players.length >= 2 && (
          <MatchLogger
            sessionId={sessionId}
            players={session.players}
            hostToken={hostToken!}
            onLogged={() => refetch()}
          />
        )}

        {/* Non-host nudge when no matches yet */}
        {!isHost && session.players.length >= 2 && session.recentMatches.length === 0 && (
          <p className="text-center text-muted-foreground text-sm">
            The host can record match results here.
          </p>
        )}

        {/* Leaderboard */}
        <Leaderboard players={session.players} matchCount={session.recentMatches.length} />

        {/* Match history */}
        <MatchHistory session={session} />
      </main>
    </div>
  );
}
