import { useState, useMemo } from "react";
import {
  TournamentFull,
  Match,
  useUpdateMatch,
  useUndoLastMatch,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
    id ? (tournament.players.find((p) => p.id === id) ?? null) : null;

  const playerName = (id?: string | null) => {
    const p = getPlayer(id);
    return p ? `${p.firstName} ${p.lastName.charAt(0)}.` : null;
  };

  const handleSetWinner = (
    matchId: string,
    winnerId: string,
    scoreOne?: number,
    scoreTwo?: number
  ) => {
    if (!isHost) return;
    updateMatch.mutate(
      {
        tournamentId: tournament.id,
        matchId,
        data: {
          hostToken: hostToken!,
          winnerId,
          ...(scoreOne !== undefined ? { scoreOne } : {}),
          ...(scoreTwo !== undefined ? { scoreTwo } : {}),
        },
      },
      {
        onError: () =>
          toast({ title: "Failed to record winner", variant: "destructive" }),
      }
    );
  };

  const handleUndo = () => {
    if (!isHost) return;
    undoMatch.mutate(
      { tournamentId: tournament.id, data: { hostToken: hostToken! } },
      {
        onError: () =>
          toast({ title: "Nothing to undo", variant: "destructive" }),
      }
    );
  };

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

      <BracketSection
        title="Winner's Bracket"
        icon={<Trophy className="w-4 h-4 text-primary" />}
        rounds={wbRounds}
        getPlayer={getPlayer}
        playerName={playerName}
        isHost={isHost}
        onSetWinner={handleSetWinner}
        isPending={updateMatch.isPending}
        accentClass="border-primary/40"
      />

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
          accentClass="border-blue-500/40"
          dimByes
        />
      )}

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
              <div key={m.id} className="min-w-[280px] max-w-sm flex-1">
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

// ── BracketSection ──────────────────────────────────────────────────────────

interface BracketSectionProps {
  title: string;
  icon: React.ReactNode;
  rounds: { round: number; label: string; matches: Match[] }[];
  getPlayer: (id?: string | null) => any;
  playerName: (id?: string | null) => string | null;
  isHost: boolean;
  onSetWinner: (matchId: string, winnerId: string, s1?: number, s2?: number) => void;
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
            <div key={r.round} className="flex flex-col min-w-[280px]">
              <h3 className="text-center font-bold text-muted-foreground uppercase tracking-widest text-xs mb-4">
                {r.label}
              </h3>
              <div className="flex flex-col justify-around gap-4 flex-1">
                {r.matches.map((m) =>
                  dimByes && m.isBye ? null : (
                    <MatchCard
                      key={m.id}
                      match={m}
                      getPlayer={getPlayer}
                      playerName={playerName}
                      isHost={isHost}
                      onSetWinner={onSetWinner}
                      isPending={isPending}
                      accentClass={accentClass}
                    />
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── MatchCard ───────────────────────────────────────────────────────────────

interface MatchCardProps {
  match: Match;
  getPlayer: (id?: string | null) => any;
  playerName: (id?: string | null) => string | null;
  isHost: boolean;
  onSetWinner: (matchId: string, winnerId: string, s1?: number, s2?: number) => void;
  isPending: boolean;
  accentClass?: string;
  isGrandFinal?: boolean;
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
}: MatchCardProps) {
  const [scoreOne, setScoreOne] = useState<string>(
    match.scoreOne !== null && match.scoreOne !== undefined ? String(match.scoreOne) : ""
  );
  const [scoreTwo, setScoreTwo] = useState<string>(
    match.scoreTwo !== null && match.scoreTwo !== undefined ? String(match.scoreTwo) : ""
  );

  const p1 = getPlayer(match.playerOneId);
  const p2 = getPlayer(match.playerTwoId);
  const isActive = match.status === "active";
  const isDone = match.status === "completed";
  const isBye = match.isBye;
  const isPendingStatus = match.status === "pending";

  const canPickWinner = isHost && isActive && p1 && p2;

  const parseScore = (s: string) => {
    const n = parseInt(s, 10);
    return isNaN(n) ? undefined : n;
  };

  const handleWin = (winnerId: string) => {
    onSetWinner(match.id, winnerId, parseScore(scoreOne), parseScore(scoreTwo));
  };

  const rowBg = (playerId: string | null | undefined) => {
    if (!playerId || !isDone) return "";
    return match.winnerId === playerId
      ? "bg-primary/10"
      : "opacity-40 grayscale";
  };

  return (
    <div
      className={`relative bg-card rounded-xl border-2 shadow-sm overflow-hidden flex flex-col transition-all
        ${isActive ? accentClass : "border-border"}
        ${isBye ? "opacity-50" : ""}
        ${isPendingStatus && !isBye ? "opacity-50" : ""}
        ${isGrandFinal ? "ring-2 ring-yellow-500/30 border-yellow-500/40" : ""}
      `}
    >
      {/* Score row — only for active or completed matches with scores */}
      {(isActive || (isDone && (match.scoreOne !== null || match.scoreTwo !== null))) && (
        <div className="flex items-center justify-center gap-2 px-3 pt-2.5 pb-1">
          {canPickWinner ? (
            <>
              <ScoreInput
                value={scoreOne}
                onChange={setScoreOne}
                placeholder="0"
                disabled={isPending}
              />
              <span className="text-muted-foreground font-bold text-sm">–</span>
              <ScoreInput
                value={scoreTwo}
                onChange={setScoreTwo}
                placeholder="0"
                disabled={isPending}
              />
            </>
          ) : isDone && (match.scoreOne !== null || match.scoreTwo !== null) ? (
            <span className="text-muted-foreground font-mono font-bold text-xs">
              {match.scoreOne ?? "–"} – {match.scoreTwo ?? "–"}
            </span>
          ) : null}
        </div>
      )}

      {/* Player 1 */}
      <div className={`p-3 flex items-center justify-between gap-2 transition-colors ${rowBg(match.playerOneId)}`}>
        <PlayerName
          name={playerName(match.playerOneId)}
          isWinner={isDone && match.winnerId === match.playerOneId}
          isGrandFinal={isGrandFinal}
          label={isGrandFinal ? "WB" : undefined}
        />
        {canPickWinner && (
          <WinButton onClick={() => match.playerOneId && handleWin(match.playerOneId)} disabled={isPending} />
        )}
        {isDone && match.winnerId === match.playerOneId && !isGrandFinal && (
          <CheckMark />
        )}
        {isDone && match.winnerId === match.playerOneId && isGrandFinal && (
          <Crown className="w-4 h-4 text-yellow-500 shrink-0" />
        )}
      </div>

      <div className="h-px bg-border" />

      {/* Player 2 or Bye */}
      {isBye ? (
        <div className="p-2 text-center text-xs font-bold uppercase tracking-widest text-muted-foreground bg-muted/30">
          Bye
        </div>
      ) : (
        <div className={`p-3 flex items-center justify-between gap-2 transition-colors ${rowBg(match.playerTwoId)}`}>
          <PlayerName
            name={playerName(match.playerTwoId)}
            isWinner={isDone && match.winnerId === match.playerTwoId}
            isGrandFinal={isGrandFinal}
            label={isGrandFinal ? "LB" : undefined}
          />
          {canPickWinner && (
            <WinButton onClick={() => match.playerTwoId && handleWin(match.playerTwoId)} disabled={isPending} />
          )}
          {isDone && match.winnerId === match.playerTwoId && !isGrandFinal && (
            <CheckMark />
          )}
          {isDone && match.winnerId === match.playerTwoId && isGrandFinal && (
            <Crown className="w-4 h-4 text-yellow-500 shrink-0" />
          )}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function ScoreInput({
  value,
  onChange,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  disabled: boolean;
}) {
  return (
    <Input
      type="number"
      min={0}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className="w-14 h-8 text-center font-bold text-base bg-muted/60 border-muted px-1 rounded-lg [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
    />
  );
}

function PlayerName({
  name,
  isWinner,
  isGrandFinal,
  label,
}: {
  name: string | null;
  isWinner: boolean;
  isGrandFinal?: boolean;
  label?: string;
}) {
  return (
    <div className="font-bold truncate flex items-center gap-2 min-w-0 flex-1">
      {label && (
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
          {label}
        </span>
      )}
      {name ? (
        <span className={`truncate ${isWinner && !isGrandFinal ? "text-primary" : ""}`}>
          {name}
        </span>
      ) : (
        <span className="text-muted-foreground/40 italic text-sm font-normal">TBD</span>
      )}
    </div>
  );
}

function WinButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <Button
      size="sm"
      variant="secondary"
      className="h-7 text-xs font-bold shrink-0"
      onClick={onClick}
      disabled={disabled}
    >
      Win
    </Button>
  );
}

function CheckMark() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-4 h-4 text-primary shrink-0"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
