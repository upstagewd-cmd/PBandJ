import { useMemo } from "react";
import {
  TournamentFull,
  Match,
  useUpdateMatch,
  useUndoLastMatch,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Undo2, Crown, Trophy, Shield } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface BracketProps {
  tournament: TournamentFull;
  hostToken: string | null;
}

export function TournamentBracket({ tournament, hostToken }: BracketProps) {
  const isHost = !!hostToken;
  const { toast } = useToast();
  const updateMatch = useUpdateMatch();
  const undoMatch = useUndoLastMatch();

  const getPlayer = (id?: string | null) =>
    id ? tournament.players.find((p) => p.id === id) ?? null : null;

  const playerName = (id?: string | null) => {
    const p = getPlayer(id);
    return p ? `${p.firstName} ${p.lastName.charAt(0)}.` : null;
  };

  const handleSetWinner = (matchId: string, winnerId: string) => {
    if (!isHost) return;
    updateMatch.mutate(
      { tournamentId: tournament.id, matchId, data: { hostToken, winnerId } },
      {
        onError: () =>
          toast({ title: "Failed to record winner", variant: "destructive" }),
      }
    );
  };

  const handleUndo = () => {
    if (!isHost) return;
    undoMatch.mutate(
      { tournamentId: tournament.id, data: { hostToken } },
      {
        onError: () =>
          toast({ title: "Nothing to undo", variant: "destructive" }),
      }
    );
  };

  // ── Split matches into brackets ───────────────────────────────────────────
  const { wbRounds, lbRounds, gfMatches } = useMemo(() => {
    const wb = new Map<number, Match[]>();
    const lb = new Map<number, Match[]>();
    const gf: Match[] = [];

    for (const m of tournament.matches) {
      if (m.bracket === "winner") {
        if (!wb.has(m.round)) wb.set(m.round, []);
        wb.get(m.round)!.push(m);
      } else if (m.bracket === "loser") {
        if (!lb.has(m.round)) lb.set(m.round, []);
        lb.get(m.round)!.push(m);
      } else {
        gf.push(m);
      }
    }

    // Sort within rounds
    const sortRounds = (map: Map<number, Match[]>) =>
      Array.from(map.entries())
        .sort(([a], [b]) => a - b)
        .map(([round, matches]) => ({
          round,
          matches: [...matches].sort((a, b) => a.matchNumber - b.matchNumber),
        }));

    const wbMaxRound = Math.max(0, ...wb.keys());
    const lbMaxRound = Math.max(0, ...lb.keys());

    return {
      wbRounds: sortRounds(wb).map((r) => ({
        ...r,
        label:
          r.round === wbMaxRound
            ? "WB Finals"
            : r.round === wbMaxRound - 1
            ? "WB Semis"
            : `WB Round ${r.round}`,
      })),
      lbRounds: sortRounds(lb).map((r) => ({
        ...r,
        label:
          r.round === lbMaxRound
            ? "LB Finals"
            : r.round === lbMaxRound - 1
            ? "LB Semis"
            : `LB Round ${r.round}`,
      })),
      gfMatches: gf.sort((a, b) => {
        const order = ["grand_finals", "grand_finals_reset"];
        return order.indexOf(a.bracket) - order.indexOf(b.bracket);
      }),
    };
  }, [tournament.matches]);

  return (
    <div className="flex flex-col gap-8 w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-primary">
            {tournament.name}
          </h1>
          <p className="text-muted-foreground text-sm uppercase tracking-widest font-bold">
            Double Elimination · Active
          </p>
        </div>
        {isHost && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleUndo}
            disabled={undoMatch.isPending}
          >
            <Undo2 className="w-4 h-4 mr-2" />
            Undo Last
          </Button>
        )}
      </div>

      {/* Winner Bracket */}
      <BracketSection
        title="Winner's Bracket"
        icon={<Trophy className="w-4 h-4 text-primary" />}
        rounds={wbRounds}
        getPlayer={getPlayer}
        playerName={playerName}
        isHost={isHost}
        onSetWinner={handleSetWinner}
        isPending={updateMatch.isPending}
        accentClass="border-primary/40 shadow-[0_0_15px_rgba(255,100,50,0.08)]"
      />

      {/* Loser Bracket */}
      {lbRounds.length > 0 && (
        <BracketSection
          title="Loser's Bracket"
          icon={<Shield className="w-4 h-4 text-blue-400" />}
          rounds={lbRounds}
          getPlayer={getPlayer}
          playerName={playerName}
          isHost={isHost}
          onSetWinner={handleSetWinner}
          isPending={updateMatch.isPending}
          accentClass="border-blue-500/40 shadow-[0_0_12px_rgba(59,130,246,0.08)]"
          dimByes
        />
      )}

      {/* Grand Finals */}
      {gfMatches.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-yellow-500" />
            <h2 className="text-sm font-bold uppercase tracking-widest text-yellow-500">
              Grand Finals
            </h2>
          </div>
          <div className="flex flex-wrap gap-6">
            {gfMatches.map((m) => (
              <div key={m.id} className="min-w-[280px] max-w-xs flex-1">
                <p className="text-center text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">
                  {m.bracket === "grand_finals_reset" ? "If Necessary" : "Grand Finals"}
                </p>
                <MatchCard
                  match={m}
                  getPlayer={getPlayer}
                  playerName={playerName}
                  isHost={isHost}
                  onSetWinner={handleSetWinner}
                  isPending={updateMatch.isPending}
                  isGrandFinal
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── BracketSection ─────────────────────────────────────────────────────────

interface BracketSectionProps {
  title: string;
  icon: React.ReactNode;
  rounds: { round: number; label: string; matches: Match[] }[];
  getPlayer: (id?: string | null) => ReturnType<typeof Array.prototype.find> | null;
  playerName: (id?: string | null) => string | null;
  isHost: boolean;
  onSetWinner: (matchId: string, winnerId: string) => void;
  isPending: boolean;
  accentClass: string;
  dimByes?: boolean;
}

function BracketSection({
  title,
  icon,
  rounds,
  getPlayer,
  playerName,
  isHost,
  onSetWinner,
  isPending,
  accentClass,
  dimByes,
}: BracketSectionProps) {
  if (rounds.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
          {title}
        </h2>
      </div>
      <div className="overflow-x-auto bg-muted/10 border border-border/30 rounded-2xl p-4">
        <div className="flex gap-8 min-w-max pb-2">
          {rounds.map((r) => (
            <div key={r.round} className="flex flex-col min-w-[260px]">
              <h3 className="text-center font-bold text-muted-foreground uppercase tracking-widest text-xs mb-4">
                {r.label}
              </h3>
              <div className="flex flex-col justify-around gap-4 flex-1">
                {r.matches.map((m) => (
                  <MatchCard
                    key={m.id}
                    match={m}
                    getPlayer={getPlayer}
                    playerName={playerName}
                    isHost={isHost}
                    onSetWinner={onSetWinner}
                    isPending={isPending}
                    accentClass={accentClass}
                    dimByes={dimByes}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── MatchCard ──────────────────────────────────────────────────────────────

interface MatchCardProps {
  match: Match;
  getPlayer: (id?: string | null) => any;
  playerName: (id?: string | null) => string | null;
  isHost: boolean;
  onSetWinner: (matchId: string, winnerId: string) => void;
  isPending: boolean;
  accentClass?: string;
  isGrandFinal?: boolean;
  dimByes?: boolean;
}

function MatchCard({
  match,
  getPlayer,
  playerName,
  isHost,
  onSetWinner,
  isPending,
  accentClass = "border-primary/40",
  isGrandFinal,
  dimByes,
}: MatchCardProps) {
  const p1 = getPlayer(match.playerOneId);
  const p2 = getPlayer(match.playerTwoId);
  const isActive = match.status === "active";
  const isDone = match.status === "completed";
  const isBye = match.isBye;
  const isPending_ = match.status === "pending";

  const canPickWinner = isHost && isActive && p1 && p2;

  const rowClass = (playerId: string | null | undefined) => {
    if (!playerId) return "";
    if (isDone && match.winnerId === playerId) return "bg-primary/10";
    if (isDone && match.winnerId !== playerId) return "opacity-40 grayscale";
    return "";
  };

  if (isBye && dimByes) return null;

  return (
    <div
      className={`relative bg-card rounded-xl border-2 shadow-sm overflow-hidden flex flex-col transition-all
        ${isActive ? accentClass : "border-border"}
        ${isBye ? "opacity-50" : ""}
        ${isGrandFinal ? "ring-2 ring-yellow-500/30 border-yellow-500/40" : ""}
        ${isPending_ && !isBye ? "opacity-50" : ""}
      `}
    >
      {/* Player 1 row */}
      <PlayerRow
        name={playerName(match.playerOneId)}
        isWinner={isDone && match.winnerId === match.playerOneId}
        showWinBtn={canPickWinner}
        onWin={() => match.playerOneId && onSetWinner(match.id, match.playerOneId)}
        rowClass={rowClass(match.playerOneId)}
        isGrandFinal={isGrandFinal}
        isFinalWinner={isDone && match.winnerId === match.playerOneId}
        isPending={isPending}
        label={isGrandFinal ? "WB" : undefined}
      />

      {/* Divider */}
      <div className="h-px bg-border" />

      {/* Player 2 row */}
      {isBye ? (
        <div className="p-2 text-center text-xs font-bold uppercase tracking-widest text-muted-foreground bg-muted/30">
          Bye
        </div>
      ) : (
        <PlayerRow
          name={playerName(match.playerTwoId)}
          isWinner={isDone && match.winnerId === match.playerTwoId}
          showWinBtn={canPickWinner}
          onWin={() => match.playerTwoId && onSetWinner(match.id, match.playerTwoId)}
          rowClass={rowClass(match.playerTwoId)}
          isGrandFinal={isGrandFinal}
          isFinalWinner={isDone && match.winnerId === match.playerTwoId}
          isPending={isPending}
          label={isGrandFinal ? "LB" : undefined}
        />
      )}
    </div>
  );
}

// ── PlayerRow ──────────────────────────────────────────────────────────────

interface PlayerRowProps {
  name: string | null;
  isWinner: boolean;
  showWinBtn: boolean;
  onWin: () => void;
  rowClass: string;
  isGrandFinal?: boolean;
  isFinalWinner?: boolean;
  isPending: boolean;
  label?: string;
}

function PlayerRow({
  name,
  isWinner,
  showWinBtn,
  onWin,
  rowClass,
  isGrandFinal,
  isFinalWinner,
  isPending,
  label,
}: PlayerRowProps) {
  return (
    <div className={`p-3 flex items-center justify-between transition-colors ${rowClass}`}>
      <div className="font-bold truncate pr-2 flex items-center gap-2 min-w-0">
        {label && (
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
            {label}
          </span>
        )}
        {name ? (
          <span className="truncate">{name}</span>
        ) : (
          <span className="text-muted-foreground/40 italic text-sm font-normal">TBD</span>
        )}
        {isFinalWinner && isGrandFinal && (
          <Crown className="w-4 h-4 text-yellow-500 shrink-0" />
        )}
      </div>
      <div className="shrink-0 flex items-center">
        {showWinBtn && (
          <Button
            size="sm"
            variant="secondary"
            className="h-7 text-xs font-bold"
            onClick={onWin}
            disabled={isPending}
          >
            Win
          </Button>
        )}
        {isWinner && !isGrandFinal && (
          <CheckIcon className="w-4 h-4 text-primary" />
        )}
      </div>
    </div>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
