import { useState, useEffect, useRef } from "react";
import { useParams, useLocation, useSearch } from "wouter";
import {
  useGetSession,
  getGetSessionQueryKey,
  useAddSessionPlayer,
  useGetMyProfile,
  useLogSessionMatch,
  useUpdateSession,
  usePairSessionPlayers,
  useUnpairSessionPlayer,
  useReshuffleSession,
  useAutoPairSession,
  useRemoveSessionPlayer,
  SessionFull,
  SessionPlayer,
  KnownPlayer,
} from "@workspace/api-client-react";
import { KnownPlayerPicker } from "@/components/ui/known-player-picker";
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
  Shuffle,
  RefreshCw,
  UserMinus,
  Sparkles,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { upsertHistory, removeHistory } from "@/lib/history";
import { PlayerAvatar } from "@/components/ui/player-avatar";
import { getPlayerDisplayName, getPlayerDisplaySubtext } from "@/lib/display-name";
import { NICKNAME_MAX_LENGTH } from "@/lib/nickname";

// ─── Header ───────────────────────────────────────────────────────────────────

function EditableSessionTitle({
  session,
  hostToken,
  isHost,
}: {
  session: SessionFull;
  hostToken: string | null;
  isHost: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(session.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const updateSession = useUpdateSession();

  useEffect(() => { if (!editing) setValue(session.name); }, [session.name, editing]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const save = () => {
    setEditing(false);
    const trimmed = value.trim();
    if (trimmed && trimmed !== session.name && hostToken) {
      updateSession.mutate(
        { sessionId: session.id, data: { name: trimmed, hostToken } },
        { onError: () => setValue(session.name) }
      );
    }
  };

  if (!isHost || !hostToken) {
    return <h1 className="text-2xl font-extrabold tracking-tight text-primary">{session.name}</h1>;
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="text-2xl font-extrabold tracking-tight bg-transparent text-primary border-none outline-none focus:ring-0 w-full"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") inputRef.current?.blur();
          if (e.key === "Escape") { setValue(session.name); setEditing(false); }
        }}
      />
    );
  }

  return (
    <button onClick={() => setEditing(true)} className="flex items-center gap-2 group">
      <h1 className="text-2xl font-extrabold tracking-tight text-primary">{session.name}</h1>
      <Pencil className="w-4 h-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
    </button>
  );
}

function SessionHeader({ isHost }: { isHost: boolean }) {
  const [, setLocation] = useLocation();
  return (
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

// ─── Who's Here pool list ─────────────────────────────────────────────────────

const SKILL_EMOJI: Record<string, string> = { beginner: "🟢", intermediate: "🟡", advanced: "🔴" };

function PlayerPool({
  players,
  sessionId,
  hostToken,
  onRemoved,
}: {
  players: SessionPlayer[];
  sessionId: string;
  hostToken: string | null;
  onRemoved: () => void;
}) {
  const [, setLocation] = useLocation();
  const removePlayer = useRemoveSessionPlayer();
  const { toast } = useToast();

  const handleRemove = (playerId: string, name: string) => {
    if (!hostToken) return;
    removePlayer.mutate(
      { sessionId, playerId, data: { hostToken } },
      {
        onSuccess: onRemoved,
        onError: () => toast({ title: `Couldn't remove ${name}`, variant: "destructive" }),
      }
    );
  };

  return (
    <div className="rounded-[24px] border border-border/50 bg-card/90 p-5 shadow-sm space-y-3">
      <h3 className="font-bold text-sm uppercase tracking-widest text-muted-foreground flex items-center gap-2">
        <Users className="w-4 h-4" /> Roster
        <span className="ml-auto text-xs font-normal normal-case">{players.length} {players.length === 1 ? "player" : "players"}</span>
      </h3>
      {players.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-2">No players yet — be the first to join!</p>
      ) : (
        <ul className="space-y-2">
          {players.map((p) => {
            const name = getPlayerDisplayName(p);
            const subtext = getPlayerDisplaySubtext(p);
            return (
              <li key={p.id} className="flex items-center gap-3">
                <PlayerAvatar player={p} size="sm" />
                <div className="flex-1 min-w-0">
                  <button
                    type="button"
                    onClick={() => setLocation(`/player/${p.id}`)}
                    className="text-sm font-medium truncate text-left bg-transparent border-0 p-0 m-0 appearance-none"
                    title="View player profile"
                  >
                    {name}
                  </button>
                  {subtext && <p className="text-[10px] text-muted-foreground truncate">{subtext}</p>}
                </div>
                {p.skillLevel && <span className="text-sm shrink-0">{SKILL_EMOJI[p.skillLevel] ?? ""}</span>}
                <span className="text-xs text-muted-foreground shrink-0">{p.rankEmoji} {Math.round(p.eloRating)}</span>
                {hostToken && (
                  <button
                    onClick={() => handleRemove(p.id, name)}
                    disabled={removePlayer.isPending}
                    className="shrink-0 p-1 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <UserMinus className="w-4 h-4" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ─── Quick join for signed-in users ───────────────────────────────────────────

function QuickJoinCard({ sessionId, players, onJoined }: { sessionId: string; players: SessionPlayer[]; onJoined: () => void }) {
  const { user } = useUser();
  const addPlayer = useAddSessionPlayer();
  const { toast } = useToast();
  const [alreadyAdded, setAlreadyAdded] = useState(false);
  const { data: profile } = useGetMyProfile({
    query: { retry: false, queryKey: ["myProfile"], enabled: !!user },
  });

  if (!user) return null;

  const alreadyIn = players.some((p) => p.clerkUserId === user.id);

  if (alreadyIn) {
    return (
      <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-green-500/20 flex items-center justify-center shrink-0">
          <Check className="w-5 h-5 text-green-400" />
        </div>
        <div>
          <p className="text-sm font-bold text-green-400">You're in ✓</p>
          <p className="text-xs text-muted-foreground">You've been added to the pool</p>
        </div>
      </div>
    );
  }

  if (alreadyAdded) {
    return (
      <div className="bg-muted/50 border border-border/50 rounded-2xl p-4 text-sm text-muted-foreground text-center">
        You've already been added by the host — look for your name in the list above.
      </div>
    );
  }

  // No name on Clerk profile — let JoinForm handle it (it pre-fills + attaches clerkUserId)
  if (!user.firstName || !user.lastName) return null;
  const nickname = ((profile as any)?.nickname ?? "").trim();
  const displayName = nickname || `${user.firstName} ${user.lastName}`;
  const displaySubtext = nickname ? `${user.firstName} ${user.lastName[0]}.` : null;

  const handleQuickJoin = () => {
    addPlayer.mutate(
      { sessionId, data: { firstName: user.firstName!, lastName: user.lastName!, clerkUserId: user.id } },
      {
        onSuccess: () => { onJoined(); toast({ title: "You're in the pool! Start playing." }); },
        onError: (err: unknown) => {
          const status = (err as { status?: number })?.status;
          const code = (err as { error?: string; body?: { error?: string } })?.error
            ?? (err as { body?: { error?: string } })?.body?.error;
          if (status === 409 && code === "already_added") {
            setAlreadyAdded(true);
          } else if (status === 409 && code === "nickname_taken") {
            toast({ title: "That nickname is already taken. Try another one.", variant: "destructive" });
          } else {
            toast({ title: "Failed to join", variant: "destructive" });
          }
        },
      }
    );
  };

  return (
    <div className="bg-card border border-primary/30 rounded-2xl p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-full overflow-hidden bg-primary/20 shrink-0 flex items-center justify-center">
        {user.imageUrl ? (
          <img src={user.imageUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <User className="w-5 h-5 text-primary" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold truncate">Join as {displayName}</p>
        {displaySubtext && <p className="text-xs text-muted-foreground truncate">{displaySubtext}</p>}
        <p className="text-xs text-muted-foreground">Signed in · your real ELO will be used</p>
      </div>
      <Button size="sm" className="shrink-0 font-bold" onClick={handleQuickJoin} disabled={addPlayer.isPending}>
        {addPlayer.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Join"}
      </Button>
    </div>
  );
}

// ─── Join Form ────────────────────────────────────────────────────────────────

const SKILL_LEVELS = [
  { value: "beginner", label: "Beginner", emoji: "🟢", desc: "New to pickleball" },
  { value: "intermediate", label: "Intermediate", emoji: "🔵", desc: "Comfortable with doubles" },
  { value: "advanced", label: "Advanced", emoji: "🔴", desc: "Experienced competitor" },
] as const;

function JoinForm({ sessionId, onJoined, isHost }: { sessionId: string; onJoined: () => void; isHost?: boolean }) {
  const { user } = useUser();
  const { data: profile } = useGetMyProfile({
    query: { retry: false, queryKey: ["myProfile"], enabled: !!user && !isHost },
  });
  const [first, setFirst] = useState(() => user?.firstName ?? "");
  const [last, setLast] = useState(() => user?.lastName ?? "");
  const [team, setTeam] = useState("");
  const [skill, setSkill] = useState<string>("intermediate");
  const [alreadyAdded, setAlreadyAdded] = useState(false);
  const addPlayer = useAddSessionPlayer();
  const { toast } = useToast();

  const isLoggedIn = !!user;

  useEffect(() => {
    if (!isLoggedIn || isHost) return;
    if (!first && user?.firstName) setFirst(user.firstName);
    if (!last && user?.lastName) setLast(user.lastName);
    const nickname = ((profile as any)?.nickname ?? "").trim();
    if (!team && nickname) setTeam(nickname);
  }, [isLoggedIn, isHost, user, profile, first, last, team]);

  if (alreadyAdded) {
    return (
      <div className="bg-muted/50 border border-border/50 rounded-2xl p-4 text-sm text-muted-foreground text-center">
        You've already been added by the host — look for your name in the list above.
      </div>
    );
  }

  const handleJoin = () => {
    if (!first.trim() || !last.trim()) return;
    addPlayer.mutate(
      {
        sessionId,
        data: {
          firstName: first.trim(),
          lastName: last.trim(),
          teamName: team.trim() || undefined,
          skillLevel: skill as "beginner" | "intermediate" | "advanced",
          clerkUserId: isHost ? undefined : (isLoggedIn ? user.id : undefined),
        },
      },
      {
        onSuccess: () => {
          setFirst(""); setLast(""); setTeam("");
          onJoined();
          toast({ title: "You're in the pool! Start playing." });
        },
        onError: (err: unknown) => {
          const status = (err as { status?: number })?.status;
          const code = (err as { error?: string; body?: { error?: string } })?.error
            ?? (err as { body?: { error?: string } })?.body?.error;
          if (status === 409 && code === "already_added") {
            setAlreadyAdded(true);
          } else if (status === 409 && code === "nickname_taken") {
            toast({ title: "That nickname is already taken. Try another one.", variant: "destructive" });
          } else {
            toast({ title: "Failed to join", variant: "destructive" });
          }
        },
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
          Nickname <span className="normal-case font-normal">(optional)</span>
        </label>
        <Input
          value={team}
          onChange={(e) => setTeam(e.target.value)}
          placeholder="e.g. The Smashers"
          onKeyDown={(e) => e.key === "Enter" && handleJoin()}
          maxLength={NICKNAME_MAX_LENGTH}
        />
      </div>
      <div>
        <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground block mb-2">
          Skill Level
        </label>
        <div className="grid grid-cols-3 gap-2">
          {SKILL_LEVELS.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setSkill(s.value)}
              className={`flex flex-col items-center gap-1 rounded-xl p-3 border-2 transition-all ${
                skill === s.value
                  ? "border-primary bg-primary/10"
                  : "border-border/50 bg-muted/30 hover:border-border"
              }`}
            >
              <span className="text-xl">{s.emoji}</span>
              <span className="text-xs font-bold">{s.label}</span>
              <span className="text-[10px] text-muted-foreground text-center leading-tight">{s.desc}</span>
            </button>
          ))}
        </div>
        {isLoggedIn && (
          <p className="mt-2 text-xs text-muted-foreground bg-muted/30 rounded-xl px-3 py-2.5">
            ✓ Signed in — your real ELO will be used when available, and this skill level will be used as a fallback.
          </p>
        )}
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

// ─── Host: add existing (Clerk) player ────────────────────────────────────────

function HostAddExistingPlayer({
  sessionId,
  players,
  onAdded,
}: {
  sessionId: string;
  players: SessionPlayer[];
  onAdded: () => void;
}) {
  const addPlayer = useAddSessionPlayer();
  const { toast } = useToast();

  const existingClerkIds = new Set(
    players.map((p) => p.clerkUserId).filter((id): id is string => !!id)
  );

  const handleSelect = (player: KnownPlayer) => {
    addPlayer.mutate(
      {
        sessionId,
        data: {
          firstName: player.firstName,
          lastName: player.lastName,
          clerkUserId: player.clerkUserId ?? undefined,
        },
      },
      {
        onSuccess: () => {
          onAdded();
          toast({ title: `${player.firstName} ${player.lastName} added to the pool!` });
        },
        onError: (err: unknown) => {
          const status = (err as { status?: number })?.status;
          if (status === 409) {
            toast({ title: `${player.firstName} is already in the pool.` });
          } else {
            toast({ title: "Failed to add player", variant: "destructive" });
          }
        },
      }
    );
  };

  return (
    <KnownPlayerPicker
      onSelect={handleSelect}
      isPending={addPlayer.isPending}
      disabledClerkIds={existingClerkIds}
    />
  );
}

// ─── Pair helpers ─────────────────────────────────────────────────────────────

function derivePairs(players: SessionPlayer[]): [SessionPlayer, SessionPlayer][] {
  const pairs: [SessionPlayer, SessionPlayer][] = [];
  const seen = new Set<string>();
  for (const p of players) {
    if (seen.has(p.id) || !p.partnerId) continue;
    const partner = players.find((x) => x.id === p.partnerId);
    if (partner) {
      pairs.push([p, partner]);
      seen.add(p.id);
      seen.add(partner.id);
    }
  }
  return pairs;
}

// ─── Pairing Manager ──────────────────────────────────────────────────────────

function PairingManager({
  sessionId,
  players,
  hostToken,
  onChanged,
}: {
  sessionId: string;
  players: SessionPlayer[];
  hostToken: string;
  onChanged: () => void;
}) {
  const [selecting, setSelecting] = useState<string | null>(null);
  const pair = usePairSessionPlayers();
  const unpair = useUnpairSessionPlayer();
  const reshuffle = useReshuffleSession();
  const autoPair = useAutoPairSession();
  const { toast } = useToast();

  const pairs = derivePairs(players);
  const freeAgents = players.filter((p) => !p.partnerId);
  const pName = (p: SessionPlayer) => getPlayerDisplayName(p);

  const handleTap = (playerId: string) => {
    if (selecting === null) {
      setSelecting(playerId);
      return;
    }
    if (selecting === playerId) {
      setSelecting(null);
      return;
    }
    pair.mutate(
      { sessionId, data: { hostToken, player1Id: selecting, player2Id: playerId } },
      {
        onSuccess: () => { setSelecting(null); onChanged(); },
        onError: () => toast({ title: "Failed to pair players", variant: "destructive" }),
      }
    );
  };

  const handleUnpair = (playerId: string) => {
    unpair.mutate(
      { sessionId, data: { hostToken, playerId } },
      {
        onSuccess: onChanged,
        onError: () => toast({ title: "Failed to unpair", variant: "destructive" }),
      }
    );
  };

  const handleReshuffle = () => {
    setSelecting(null);
    reshuffle.mutate(
      { sessionId, data: { hostToken } },
      {
        onSuccess: onChanged,
        onError: () => toast({ title: "Failed to reshuffle", variant: "destructive" }),
      }
    );
  };

  const handleAutoPair = () => {
    setSelecting(null);
    autoPair.mutate(
      { sessionId, data: { hostToken } },
      {
        onSuccess: () => { onChanged(); toast({ title: "Pairs balanced by skill level!" }); },
        onError: () => toast({ title: "Failed to auto-pair", variant: "destructive" }),
      }
    );
  };

  const canPair = players.length >= 2;
  const isActing = reshuffle.isPending || autoPair.isPending;

  return (
    <div className="bg-card border border-border/50 rounded-2xl p-5 space-y-4">
      <h3 className="font-bold text-sm uppercase tracking-widest text-muted-foreground flex items-center gap-2">
        <Users className="w-4 h-4" /> Pairings
      </h3>
      {canPair && (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="flex-1 h-8 text-xs gap-1.5 font-bold uppercase tracking-wider"
            onClick={handleAutoPair}
            disabled={isActing}
          >
            {autoPair.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Shuffle className="w-3 h-3" />}
            {pairs.length > 0 ? "Regenerate" : "Generate"} Balanced
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="flex-1 h-8 text-xs gap-1.5 font-bold uppercase tracking-wider"
            onClick={handleReshuffle}
            disabled={isActing}
          >
            {reshuffle.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Random
          </Button>
        </div>
      )}

      {/* Current pairs */}
      {pairs.length > 0 && (
        <div className="space-y-2">
          {pairs.map(([p1, p2], i) => (
            <div key={p1.id} className="flex items-center gap-2 bg-muted/30 rounded-xl px-3 py-2.5">
              <span className="text-xs font-bold text-muted-foreground w-5 shrink-0 text-center">#{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm truncate">
                  {pName(p1)} <span className="text-muted-foreground font-normal">&amp;</span> {pName(p2)}
                </p>
              </div>
              <button
                onClick={() => handleUnpair(p1.id)}
                disabled={unpair.isPending}
                className="text-muted-foreground hover:text-red-400 transition-colors shrink-0 p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Free agents */}
      {freeAgents.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {selecting ? "Now tap a second player to complete the pair" : "Tap two players to pair them"}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {freeAgents.map((p) => (
              <button
                key={p.id}
                onClick={() => handleTap(p.id)}
                disabled={pair.isPending}
                className={`text-left rounded-xl px-3 py-2.5 border transition-all ${
                  selecting === p.id
                    ? "border-primary bg-primary/10 ring-1 ring-primary"
                    : "border-border bg-muted/20 hover:border-primary/50 active:bg-muted/40"
                }`}
              >
                <p className="font-bold text-sm truncate">{pName(p)}</p>
                <p className="text-[10px] text-muted-foreground">{p.eloRating} ELO</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {pairs.length === 0 && freeAgents.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-2">No players yet</p>
      )}
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
  const [t1Key, setT1Key] = useState<string | null>(null);
  const [t2Key, setT2Key] = useState<string | null>(null);
  const [t1Ids, setT1Ids] = useState<string[]>([]);
  const [t2Ids, setT2Ids] = useState<string[]>([]);
  const [scoreOne, setScoreOne] = useState("");
  const [scoreTwo, setScoreTwo] = useState("");
  const logMatch = useLogSessionMatch();
  const { toast } = useToast();

  const pairs = derivePairs(players);
  const hasPairs = pairs.length >= 2;

  const reset = () => {
    setOpen(false);
    setT1Key(null); setT2Key(null);
    setT1Ids([]); setT2Ids([]);
    setScoreOne(""); setScoreTwo("");
  };

  const togglePair = (key: string) => {
    if (t1Key === key) { setT1Key(null); return; }
    if (t2Key === key) { setT2Key(null); return; }
    if (!t1Key) { setT1Key(key); }
    else if (!t2Key) { setT2Key(key); }
  };

  const handleLog = (winnerTeam: 1 | 2) => {
    if (hasPairs) {
      if (!t1Key || !t2Key) return;
      const p1 = pairs.find(([a]) => a.id === t1Key)!;
      const p2 = pairs.find(([a]) => a.id === t2Key)!;
      logMatch.mutate(
        {
          sessionId,
          data: {
            hostToken,
            team1P1Id: p1[0].id,
            team1P2Id: p1[1].id,
            team2P1Id: p2[0].id,
            team2P2Id: p2[1].id,
            winnerTeam,
            scoreOne: scoreOne ? parseInt(scoreOne) : undefined,
            scoreTwo: scoreTwo ? parseInt(scoreTwo) : undefined,
          },
        },
        {
          onSuccess: () => { reset(); onLogged(); toast({ title: "Match logged! Ratings updated." }); },
          onError: () => toast({ title: "Failed to log match", variant: "destructive" }),
        }
      );
    } else {
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
          onSuccess: () => { reset(); onLogged(); toast({ title: "Match logged! Ratings updated." }); },
          onError: () => toast({ title: "Failed to log match", variant: "destructive" }),
        }
      );
    }
  };

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} disabled={players.length < 2} className="w-full font-bold gap-2">
        <Plus className="w-4 h-4" /> Log Match
      </Button>
    );
  }

  const pName = (p: SessionPlayer) => getPlayerDisplayName(p);

  // ── PAIRS MODE ──────────────────────────────────────────────────────────────
  if (hasPairs) {
    const selectedT1 = t1Key ? pairs.find(([a]) => a.id === t1Key) : null;
    const selectedT2 = t2Key ? pairs.find(([a]) => a.id === t2Key) : null;

    return (
      <div className="bg-card border border-border/50 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="font-bold text-sm">Log Match</h4>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={reset}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">Tap a pair for Team 1, then tap another for Team 2</p>

        <div className="space-y-2">
          {pairs.map(([p1, p2]) => {
            const isT1 = t1Key === p1.id;
            const isT2 = t2Key === p1.id;
            const bothChosen = !!(t1Key && t2Key);
            return (
              <button
                key={p1.id}
                onClick={() => togglePair(p1.id)}
                className={`w-full text-left rounded-xl px-3 py-2.5 border transition-all ${
                  isT1
                    ? "border-primary bg-primary/10 ring-1 ring-primary"
                    : isT2
                    ? "border-blue-500 bg-blue-500/10 ring-1 ring-blue-500"
                    : bothChosen
                    ? "opacity-40 border-border"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="font-bold text-sm">
                    {pName(p1)} <span className="text-muted-foreground font-normal">&amp;</span> {pName(p2)}
                  </p>
                  {isT1 && <span className="text-xs font-bold text-primary shrink-0 ml-2">Team 1</span>}
                  {isT2 && <span className="text-xs font-bold text-blue-400 shrink-0 ml-2">Team 2</span>}
                </div>
              </button>
            );
          })}
        </div>

        {(t1Key || t2Key) && (
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-primary mb-1">Team 1</p>
              {selectedT1 ? (
                <>
                  <p className="font-bold text-sm truncate">{pName(selectedT1[0])}</p>
                  <p className="font-bold text-sm truncate">{pName(selectedT1[1])}</p>
                </>
              ) : <p className="text-muted-foreground italic text-xs">Not selected</p>}
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-blue-400 mb-1">Team 2</p>
              {selectedT2 ? (
                <>
                  <p className="font-bold text-sm truncate">{pName(selectedT2[0])}</p>
                  <p className="font-bold text-sm truncate">{pName(selectedT2[1])}</p>
                </>
              ) : <p className="text-muted-foreground italic text-xs">Not selected</p>}
            </div>
          </div>
        )}

        <div className="flex items-center justify-center gap-3">
          <input type="number" min={0} value={scoreOne} onChange={(e) => setScoreOne(e.target.value)} placeholder="T1"
            className="w-20 h-10 text-center rounded-xl border border-border bg-muted/50 text-sm font-bold focus:outline-none focus:border-primary" />
          <span className="text-muted-foreground font-bold text-lg">–</span>
          <input type="number" min={0} value={scoreTwo} onChange={(e) => setScoreTwo(e.target.value)} placeholder="T2"
            className="w-20 h-10 text-center rounded-xl border border-border bg-muted/50 text-sm font-bold focus:outline-none focus:border-blue-400" />
        </div>

        {t1Key && t2Key && (
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

  // ── MANUAL MODE (no pairs) ──────────────────────────────────────────────────
  const selectedIds = new Set([...t1Ids, ...t2Ids]);
  const toggle = (id: string, team: 1 | 2) => {
    const [ids, setIds] = team === 1 ? [t1Ids, setT1Ids] : [t2Ids, setT2Ids];
    if (ids.includes(id)) { setIds(ids.filter((x) => x !== id)); }
    else if (ids.length < 2) { setIds([...ids, id]); }
  };

  return (
    <div className="bg-card border border-border/50 rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-bold text-sm">Log Match</h4>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={reset}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Select players for each team (up to 2 per team)</p>
        <div className="space-y-1.5">
          {players.map((p) => (
            <div key={p.id} className={`flex items-center justify-between rounded-xl px-3 py-2.5 transition-colors ${selectedIds.has(p.id) ? "bg-muted/60" : "bg-muted/20"}`}>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-sm truncate">{pName(p)}</p>
                <p className="text-[10px] text-muted-foreground">{p.rankEmoji} {p.rankTitle} · {p.eloRating} ELO</p>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button onClick={() => toggle(p.id, 1)} disabled={!t1Ids.includes(p.id) && (selectedIds.has(p.id) || t1Ids.length >= 2)}
                  className={`text-xs font-bold px-2 py-1 rounded-lg border transition-colors ${t1Ids.includes(p.id) ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-30"}`}>T1</button>
                <button onClick={() => toggle(p.id, 2)} disabled={!t2Ids.includes(p.id) && (selectedIds.has(p.id) || t2Ids.length >= 2)}
                  className={`text-xs font-bold px-2 py-1 rounded-lg border transition-colors ${t2Ids.includes(p.id) ? "bg-blue-500 text-white border-blue-500" : "border-border text-muted-foreground hover:border-blue-500 hover:text-blue-500 disabled:opacity-30"}`}>T2</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {(t1Ids.length > 0 || t2Ids.length > 0) && (
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-primary mb-1">Team 1</p>
            {t1Ids.length === 0 ? <p className="text-muted-foreground italic text-xs">None selected</p>
              : t1Ids.map((id) => { const p = players.find((x) => x.id === id); return p ? <p key={id} className="font-bold truncate text-sm">{pName(p)}</p> : null; })}
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-blue-400 mb-1">Team 2</p>
            {t2Ids.length === 0 ? <p className="text-muted-foreground italic text-xs">None selected</p>
              : t2Ids.map((id) => { const p = players.find((x) => x.id === id); return p ? <p key={id} className="font-bold truncate text-sm">{pName(p)}</p> : null; })}
          </div>
        </div>
      )}

      <div className="flex items-center justify-center gap-3">
        <input type="number" min={0} value={scoreOne} onChange={(e) => setScoreOne(e.target.value)} placeholder="T1"
          className="w-20 h-10 text-center rounded-xl border border-border bg-muted/50 text-sm font-bold focus:outline-none focus:border-primary" />
        <span className="text-muted-foreground font-bold text-lg">–</span>
        <input type="number" min={0} value={scoreTwo} onChange={(e) => setScoreTwo(e.target.value)} placeholder="T2"
          className="w-20 h-10 text-center rounded-xl border border-border bg-muted/50 text-sm font-bold focus:outline-none focus:border-blue-400" />
      </div>

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
    <div className="rounded-[32px] border border-border/50 bg-card/90 p-6 shadow-[0_20px_60px_-24px_rgba(0,0,0,0.28)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">Share session</p>
          <h3 className="mt-2 text-xl font-semibold text-foreground">Bring the crew to the court</h3>
          <p className="mt-1 text-sm text-muted-foreground">Send the link so everyone can join the pool and get paired up.</p>
        </div>
        <div className="rounded-2xl bg-primary/10 p-3 text-primary">
          <QrCode className="h-5 w-5" />
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-6 lg:flex-row">
        <div className="rounded-[24px] border border-border/50 bg-background/70 p-4 lg:min-w-[188px]">
          <div className="mx-auto flex w-fit items-center justify-center rounded-2xl bg-white p-3 shadow-sm">
            <QRCodeSVG value={url} size={148} level="H" includeMargin={false} />
          </div>
        </div>

        <div className="flex-1 space-y-3">
          <div className="rounded-2xl border border-border/50 bg-background/70 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Session link</p>
              <Button size="sm" variant="secondary" className="rounded-full px-3 py-1 text-xs font-semibold" onClick={copy}>
                {copied ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <div className="mt-3 rounded-xl border border-border/50 bg-muted/40 px-3 py-2.5 text-xs font-mono text-muted-foreground truncate">
              {url}
            </div>
          </div>
        </div>
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
                {getPlayerDisplayName(p)}
              </p>
              {getPlayerDisplaySubtext(p) && (
                <p className="text-[10px] text-muted-foreground truncate">{getPlayerDisplaySubtext(p)}</p>
              )}
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
  const pName = (p: SessionPlayer) => getPlayerDisplayName(p);
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
  const { isSignedIn } = useUser();
  const sessionId = params.sessionId!;
  const [showGuestJoin, setShowGuestJoin] = useState(false);

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

  // Track visit history — must be before early returns to keep hooks order stable
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

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center space-y-4">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
        <p className="text-muted-foreground font-bold uppercase tracking-widest animate-pulse">Loading...</p>
      </div>
    );
  }

  if (isError || !session) {
    if (sessionId) removeHistory(sessionId);
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
  const isClosed = session.status === "closed";
  const signupPath = `/sign-up?next=${encodeURIComponent(`/s/${sessionId}${search || ""}`)}`;
  const signinPath = `/sign-in?next=${encodeURIComponent(`/s/${sessionId}${search || ""}`)}`;

  return (
    <div className="min-h-[100dvh] w-full flex flex-col">
      <SessionHeader isHost={isHost} />

      <main className="flex-1 w-full max-w-2xl mx-auto p-4 md:p-6 py-6 space-y-6">
        <div className="rounded-[32px] border border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background p-6 shadow-[0_20px_60px_-24px_rgba(0,0,0,0.28)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-background/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">
                <Sparkles className="h-3.5 w-3.5" />
                {isClosed ? "Session closed" : "Open play session"}
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Activity className={`w-5 h-5 ${isClosed ? "text-muted-foreground" : "text-primary"}`} />
                  <EditableSessionTitle session={session} hostToken={isClosed ? null : hostToken} isHost={isHost && !isClosed} />
                </div>
                <p className="text-sm text-muted-foreground">
                  {isClosed
                    ? "This session is wrapped up. Scores and history remain visible below."
                    : session.players.length > 0
                      ? `${session.players.length} player${session.players.length === 1 ? "" : "s"} are already in the pool.`
                      : "Invite your crew, then start pairing players for the next game."}
                </p>
              </div>
            </div>
            <div className="rounded-2xl border border-border/50 bg-background/80 px-4 py-3 text-right shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">Players</p>
              <p className="text-2xl font-bold text-foreground">{session.players.length}</p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {[
              { title: "Invite", description: "Share the link", active: true },
              { title: "Join", description: "Add to the pool", active: session.players.length > 0 },
              { title: "Pair", description: "Log results", active: session.players.length >= 2 },
            ].map((step) => (
              <div
                key={step.title}
                className={`rounded-2xl border px-3 py-3 ${step.active ? "border-primary/20 bg-primary/10" : "border-border/40 bg-background/50"}`}
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">{step.title}</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{step.description}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-start gap-3">
            <p className="text-muted-foreground uppercase tracking-widest text-sm font-bold">
              {isClosed ? "Session Closed" : "Open Play"}
            </p>
            {isHost && (
              <CloseSessionButton
                sessionId={sessionId}
                hostToken={hostToken!}
                isClosed={isClosed}
                onChanged={refetch}
              />
            )}
          </div>
        </div>

        {/* Closed banner for non-hosts */}
        {isClosed && !isHost && (
          <div className="bg-muted/60 border border-border/60 rounded-2xl p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
              <X className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <p className="font-bold text-sm">This session has ended</p>
              <p className="text-xs text-muted-foreground">The host has closed it. Scores and history are preserved below.</p>
            </div>
          </div>
        )}

        {!isClosed && <ShareCard sessionId={sessionId} />}

        <div className="rounded-[24px] border border-primary/20 bg-gradient-to-br from-primary/10 to-background p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-primary">Ready to play?</p>
          <h2 className="mt-1 text-xl font-semibold text-foreground">Join the session pool</h2>
          <p className="mt-2 text-sm text-muted-foreground">Add yourself to the pool, then let the host pair players and log match results.</p>
        </div>

        <PlayerPool
          players={session.players}
          sessionId={session.id}
          hostToken={isClosed ? null : hostToken}
          onRemoved={refetch}
        />

        {/* Host: add existing / quick-join / join form — active only */}
        {!isClosed && (
          <>
            {isHost && (
              <HostAddExistingPlayer
                sessionId={sessionId}
                players={session.players}
                onAdded={() => refetch()}
              />
            )}

            <Show when="signed-in">
              <QuickJoinCard sessionId={sessionId} players={session.players} onJoined={() => refetch()} />
            </Show>

            {!isHost && !isSignedIn && (
              <div className="bg-card border border-primary/30 rounded-2xl p-5 space-y-4 shadow-sm">
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-primary">Account recommended</p>
                  <h3 className="text-lg font-bold text-foreground">Play with your PB&amp;J account</h3>
                  <p className="text-sm text-muted-foreground">Track your rank, badges, and match history.</p>
                </div>
                <Button className="w-full h-11 font-bold" onClick={() => setLocation(signupPath)}>
                  Create account
                </Button>
                <Button variant="outline" className="w-full h-11 font-bold" onClick={() => setLocation(signinPath)}>
                  Already have an account? Sign in
                </Button>
                <button
                  type="button"
                  onClick={() => setShowGuestJoin((prev) => !prev)}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Continue as guest
                </button>
              </div>
            )}

            {(isHost || isSignedIn || showGuestJoin) && (
              <JoinForm sessionId={sessionId} onJoined={() => refetch()} isHost={isHost} />
            )}

            {isHost && session.players.length >= 2 && (
              <PairingManager
                sessionId={sessionId}
                players={session.players}
                hostToken={hostToken!}
                onChanged={() => refetch()}
              />
            )}

            {isHost && session.players.length >= 2 && (
              <MatchLogger
                sessionId={sessionId}
                players={session.players}
                hostToken={hostToken!}
                onLogged={() => refetch()}
              />
            )}

            {!isHost && session.players.length >= 2 && session.recentMatches.length === 0 && (
              <p className="text-center text-muted-foreground text-sm">
                The host can record match results here.
              </p>
            )}
          </>
        )}

        {/* Leaderboard + history — always visible */}
        <Leaderboard players={session.players} matchCount={session.recentMatches.length} />
        <MatchHistory session={session} />
      </main>
    </div>
  );
}

// ─── Close Session Button ──────────────────────────────────────────────────────

function CloseSessionButton({
  sessionId,
  hostToken,
  isClosed,
  onChanged,
}: {
  sessionId: string;
  hostToken: string;
  isClosed: boolean;
  onChanged: () => void;
}) {
  const updateSession = useUpdateSession();
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(false);

  const handleClose = () => {
    updateSession.mutate(
      { sessionId, data: { hostToken, status: "closed" } },
      {
        onSuccess: () => { onChanged(); setConfirming(false); toast({ title: "Session closed" }); },
        onError: () => toast({ title: "Failed to close session", variant: "destructive" }),
      }
    );
  };

  const handleReopen = () => {
    updateSession.mutate(
      { sessionId, data: { hostToken, status: "active" } },
      {
        onSuccess: () => { onChanged(); toast({ title: "Session reopened" }); },
        onError: () => toast({ title: "Failed to reopen session", variant: "destructive" }),
      }
    );
  };

  if (isClosed) {
    return (
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs gap-1.5 font-bold uppercase tracking-wider"
        onClick={handleReopen}
        disabled={updateSession.isPending}
      >
        {updateSession.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Activity className="w-3 h-3" />}
        Reopen
      </Button>
    );
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground">Close session?</span>
        <Button
          size="sm"
          variant="destructive"
          className="h-7 text-xs font-bold uppercase tracking-wider"
          onClick={handleClose}
          disabled={updateSession.isPending}
        >
          {updateSession.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Yes, close"}
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setConfirming(false)}>
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-destructive font-bold uppercase tracking-wider"
      onClick={() => setConfirming(true)}
    >
      <X className="w-3 h-3" /> Close Session
    </Button>
  );
}
