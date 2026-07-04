import { useState, useMemo } from "react";
import {
  TournamentFull,
  Match,
  useUpdateMatch,
  useUndoLastMatch,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Undo2, Crown, Trophy, Shield, Clock } from "lucide-react";
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

  /** Display name: teamName → "First L." */
  const displayName = (id?: string | null): string | null => {
    const p = getPlayer(id);
    if (!p) return null;
    if (p.teamName) return p.teamName;
    return `${p.firstName} ${p.lastName.charAt(0)}.`;
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
      { onError: () => toast({ title: "Failed to record winner", variant: "destructive" }) }
    );
  };

  const handleUndo = () => {
    if (!isHost) return;
    undoMatch.mutate(
      { tournamentId: tournament.id, data: { hostToken: hostToken! } },
      { onError: () => toast({ title: "Nothing to undo", variant: "destructive" }) }
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
          r.round === wbMaxRound ? "WB Finals"
          : r.round === wbMaxRound - 1 ? "WB Semis"
          : `WB Round ${r.round}`,
      })),
      lbRounds: sortRounds(lb).map((r) => ({
        ...r,
        label:
          r.round === lbMaxRound ? "LB Finals"
          : r.round === lbMaxRound - 1 ? "LB Semis"
          : `LB Round ${r.round}`,
      })),
      gfMatches: gf.sort((a, b) => {
        const order = ["grand_finals", "grand_finals_reset"];
        return order.indexOf(a.bracket) - order.indexOf(b.bracket);
      }),
    };
  }, [tournament.matches]);

  // ── Match history ─────────────────────────────────────────────────────────
  const completedMatches = useMemo(() => {
    return [...tournament.matches]
      .filter((m) => m.status === "completed" && !m.isBye)
      .sort((a, b) => {
        // Sort by completedAt desc if available, else by round + matchNumber desc
        if (a.completedAt && b.completedAt) {
          return new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime();
        }
        if (a.round !== b.round) return b.round - a.round;
        return b.matchNumber - a.matchNumber;
      });
  }, [tournament.matches]);

  const bracketLabel = (m: Match) => {
    if (m.bracket === "grand_finals") return "Grand Finals";
    if (m.bracket === "grand_finals_reset") return "GF Reset";
    if (m.bracket === "winner") return `WB R${m.round}`;
    return `LB R${m.round}`;
  };

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
          <Button variant="outline" size="sm" onClick={handleUndo} disabled={undoMatch.isPending}>
            <Undo2 className="w-4 h-4 mr-2" /> Undo Last
          </Button>
        )}
      </div>

      {/* Winner Bracket */}
      <BracketSection
        title="Winner's Bracket"
        icon={<Trophy className="w-4 h-4 text-primary" />}
        rounds={wbRounds}
        displayName={displayName}
        isHost={isHost}
        onSetWinner={handleSetWinner}
        isPending={updateMatch.isPending}
        accentClass="border-primary/40"
      />

      {/* Loser Bracket */}
      {lbRounds.length > 0 && (
        <BracketSection
          title="Loser's Bracket"
          icon={<Shield className="w-4 h-4 text-blue-400" />}
          rounds={lbRounds}
          displayName={displayName}
          isHost={isHost}
          onSetWinner={handleSetWinner}
          isPending={updateMatch.isPending}
          accentClass="border-blue-500/40"
          dimByes
        />
      )}

      {/* Grand Finals */}
      {gfMatches.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-yellow-500" />
            <h2 className="text-sm font-bold uppercase tracking-widest text-yellow-500">Grand Finals</h2>
          </div>
          <div className="flex flex-wrap gap-6">
            {gfMatches.map((m) => (
              <div key={m.id} className="min-w-[280px] max-w-sm flex-1">
                <p className="text-center text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">
                  {m.bracket === "grand_finals_reset" ? "If Necessary" : "Grand Finals"}
                </p>
                <MatchCard
                  match={m}
                  displayName={displayName}
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

      {/* Match History */}
      {completedMatches.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
              Match History
            </h2>
          </div>
          <div className="bg-muted/10 border border-border/30 rounded-2xl divide-y divide-border/30">
            {completedMatches.map((m) => {
              const winner = displayName(m.winnerId);
              const loser = displayName(
                m.playerOneId === m.winnerId ? m.playerTwoId : m.playerOneId
              );
              const hasScore = m.scoreOne !== null || m.scoreTwo !== null;
              const winnerScore = m.playerOneId === m.winnerId ? m.scoreOne : m.scoreTwo;
              const loserScore = m.playerOneId === m.winnerId ? m.scoreTwo : m.scoreOne;
              return (
                <div key={m.id} className="flex items-center justify-between px-4 py-3 gap-4">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
                      {bracketLabel(m)}
                    </span>
                    <span className="font-bold text-sm truncate">
                      <span className="text-primary">{winner}</span>
                      <span className="text-muted-foreground mx-1.5">beat</span>
                      <span className="text-muted-foreground">{loser}</span>
                    </span>
                  </div>
                  {hasScore && (
                    <span className="font-mono font-bold text-sm text-muted-foreground shrink-0">
                      {winnerScore ?? "–"}–{loserScore ?? "–"}
                    </span>
                  )}
                </div>
              );
            })}
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
  displayName: (id?: string | null) => string | null;
  isHost: boolean;
  onSetWinner: (matchId: string, winnerId: string, s1?: number, s2?: number) => void;
  isPending: boolean;
  accentClass: string;
  dimByes?: boolean;
}

function BracketSection({
  title, icon, rounds, displayName, isHost, onSetWinner, isPending, accentClass, dimByes,
}: BracketSectionProps) {
  if (rounds.length === 0) return null;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">{title}</h2>
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
                      displayName={displayName}
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
  displayName: (id?: string | null) => string | null;
  isHost: boolean;
  onSetWinner: (matchId: string, winnerId: string, s1?: number, s2?: number) => void;
  isPending: boolean;
  accentClass?: string;
  isGrandFinal?: boolean;
}

function MatchCard({
  match, displayName, isHost, onSetWinner, isPending,
  accentClass = "border-primary/40", isGrandFinal,
}: MatchCardProps) {
  const [scoreOne, setScoreOne] = useState<string>(
    match.scoreOne !== null && match.scoreOne !== undefined ? String(match.scoreOne) : ""
  );
  const [scoreTwo, setScoreTwo] = useState<string>(
    match.scoreTwo !== null && match.scoreTwo !== undefined ? String(match.scoreTwo) : ""
  );

  const isActive = match.status === "active";
  const isDone = match.status === "completed";
  const isBye = match.isBye;
  const isPendingStatus = match.status === "pending";

  const canPickWinner = isHost && isActive && match.playerOneId && match.playerTwoId;

  const parseScore = (s: string) => { const n = parseInt(s, 10); return isNaN(n) ? undefined : n; };

  const rowBg = (playerId: string | null | undefined) => {
    if (!playerId || !isDone) return "";
    return match.winnerId === playerId ? "bg-primary/10" : "opacity-40 grayscale";
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
      {/* Score row */}
      {(isActive || (isDone && (match.scoreOne !== null || match.scoreTwo !== null))) && (
        <div className="flex items-center justify-center gap-2 px-3 pt-2.5 pb-1">
          {canPickWinner ? (
            <>
              <ScoreInput value={scoreOne} onChange={setScoreOne} disabled={isPending} />
              <span className="text-muted-foreground font-bold text-sm">–</span>
              <ScoreInput value={scoreTwo} onChange={setScoreTwo} disabled={isPending} />
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
        <NameSlot
          name={displayName(match.playerOneId)}
          isWinner={isDone && match.winnerId === match.playerOneId}
          isGrandFinal={isGrandFinal}
          label={isGrandFinal ? "WB" : undefined}
        />
        {canPickWinner && (
          <WinButton onClick={() => match.playerOneId && onSetWinner(match.id, match.playerOneId, parseScore(scoreOne), parseScore(scoreTwo))} disabled={isPending} />
        )}
        {isDone && match.winnerId === match.playerOneId && (
          isGrandFinal
            ? <Crown className="w-4 h-4 text-yellow-500 shrink-0" />
            : <CheckMark />
        )}
      </div>

      <div className="h-px bg-border" />

      {/* Player 2 */}
      {isBye ? (
        <div className="p-2 text-center text-xs font-bold uppercase tracking-widest text-muted-foreground bg-muted/30">Bye</div>
      ) : (
        <div className={`p-3 flex items-center justify-between gap-2 transition-colors ${rowBg(match.playerTwoId)}`}>
          <NameSlot
            name={displayName(match.playerTwoId)}
            isWinner={isDone && match.winnerId === match.playerTwoId}
            isGrandFinal={isGrandFinal}
            label={isGrandFinal ? "LB" : undefined}
          />
          {canPickWinner && (
            <WinButton onClick={() => match.playerTwoId && onSetWinner(match.id, match.playerTwoId, parseScore(scoreOne), parseScore(scoreTwo))} disabled={isPending} />
          )}
          {isDone && match.winnerId === match.playerTwoId && (
            isGrandFinal
              ? <Crown className="w-4 h-4 text-yellow-500 shrink-0" />
              : <CheckMark />
          )}
        </div>
      )}
    </div>
  );
}

// ── Small components ────────────────────────────────────────────────────────

function NameSlot({ name, isWinner, isGrandFinal, label }: { name: string | null; isWinner: boolean; isGrandFinal?: boolean; label?: string }) {
  return (
    <div className="font-bold truncate flex items-center gap-2 min-w-0 flex-1">
      {label && (
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
          {label}
        </span>
      )}
      {name
        ? <span className={`truncate ${isWinner && !isGrandFinal ? "text-primary" : ""}`}>{name}</span>
        : <span className="text-muted-foreground/40 italic text-sm font-normal">TBD</span>
      }
    </div>
  );
}

function ScoreInput({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled: boolean }) {
  return (
    <Input
      type="number" min={0}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="0"
      disabled={disabled}
      className="w-14 h-8 text-center font-bold text-base bg-muted/60 border-muted px-1 rounded-lg [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
    />
  );
}

function WinButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <Button size="sm" variant="secondary" className="h-7 text-xs font-bold shrink-0" onClick={onClick} disabled={disabled}>
      Win
    </Button>
  );
}

function CheckMark() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-primary shrink-0">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
