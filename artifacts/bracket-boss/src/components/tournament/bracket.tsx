import { useState, useMemo, useRef, useEffect } from "react";
import {
  TournamentFull,
  Match,
  useUpdateMatch,
  useUndoLastMatch,
  useUpdateTournament,
  getGetTournamentQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlayerAvatar } from "@/components/ui/player-avatar";
import { Undo2, Crown, Trophy, Clock, Activity, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { OpenPlaySection } from "./open-play";
import { useLocation } from "wouter";

interface BracketProps {
  tournament: TournamentFull;
  hostToken: string | null;
}

export function TournamentBracket({ tournament, hostToken }: BracketProps) {
  const isHost = !!hostToken;
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const refetch = () => queryClient.invalidateQueries({ queryKey: getGetTournamentQueryKey(tournament.id) });
  const updateMatch = useUpdateMatch();
  const undoMatch = useUndoLastMatch();

  const getTeam = (id?: string | null) =>
    id ? (tournament.teams?.find((t) => t.id === id) ?? null) : null;

  const getPlayer = (id?: string | null) =>
    id ? (tournament.players.find((p) => p.id === id) ?? null) : null;

  // displayName now resolves a TEAM id to a readable name
  const displayName = (teamId?: string | null): string | null => {
    const team = getTeam(teamId);
    if (!team) return null;
    if (team.teamName) return team.teamName;
    const p1 = getPlayer(team.player1Id);
    const p2 = getPlayer(team.player2Id);
    if (p1 && p2) return `${p1.firstName} & ${p2.firstName}`;
    if (p1) return `${p1.firstName} ${p1.lastName.charAt(0)}.`;
    return null;
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
        onSettled: refetch,
        onError: () => toast({ title: "Failed to record winner", variant: "destructive" }),
      }
    );
  };

  const handleUndo = () => {
    if (!isHost) return;
    undoMatch.mutate(
      { tournamentId: tournament.id, data: { hostToken: hostToken! } },
      {
        onSettled: refetch,
        onError: () => toast({ title: "Nothing to undo", variant: "destructive" }),
      }
    );
  };

  const { rounds, maxRound } = useMemo(() => {
    const roundMap = new Map<number, Match[]>();
    for (const m of tournament.matches) {
      if (!roundMap.has(m.round)) roundMap.set(m.round, []);
      roundMap.get(m.round)!.push(m);
    }
    const max = Math.max(0, ...roundMap.keys());
    const sorted = Array.from(roundMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([round, matches]) => ({
        round,
        matches: [...matches].sort((a, b) => a.matchNumber - b.matchNumber),
        label:
          round === max ? "Championship"
          : round === max - 1 ? "Semifinals"
          : round === max - 2 ? "Quarterfinals"
          : `Round ${round}`,
      }));
    return { rounds: sorted, maxRound: max };
  }, [tournament.matches]);

  const completedMatches = useMemo(() => {
    return [...tournament.matches]
      .filter((m) => m.status === "completed" && !m.isBye)
      .sort((a, b) => {
        if (a.completedAt && b.completedAt) {
          return new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime();
        }
        if (a.round !== b.round) return b.round - a.round;
        return b.matchNumber - a.matchNumber;
      });
  }, [tournament.matches]);

  const roundLabel = (m: Match) => {
    if (m.round === maxRound) return "Finals";
    if (m.round === maxRound - 1) return "Semis";
    return `R${m.round}`;
  };

  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(tournament.name);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const updateTournament = useUpdateTournament();

  useEffect(() => {
    if (!editingName) setNameValue(tournament.name);
  }, [tournament.name, editingName]);

  useEffect(() => {
    if (editingName) nameInputRef.current?.focus();
  }, [editingName]);

  const handleNameBlur = () => {
    setEditingName(false);
    const trimmed = nameValue.trim();
    if (trimmed && trimmed !== tournament.name && hostToken) {
      updateTournament.mutate(
        { tournamentId: tournament.id, data: { name: trimmed, hostToken } },
        { onError: () => setNameValue(tournament.name) }
      );
    }
  };

  return (
    <div className="flex flex-col gap-8 w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          {isHost && hostToken ? (
            <div className="group flex items-center gap-2">
              {editingName ? (
                <input
                  ref={nameInputRef}
                  className="text-2xl md:text-3xl font-extrabold tracking-tight bg-transparent text-primary border-none outline-none focus:ring-0 w-full max-w-xs"
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  onBlur={handleNameBlur}
                  onKeyDown={(e) => { if (e.key === "Enter") nameInputRef.current?.blur(); if (e.key === "Escape") { setNameValue(tournament.name); setEditingName(false); } }}
                />
              ) : (
                <button onClick={() => setEditingName(true)} className="flex items-center gap-2 group">
                  <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-primary">
                    {tournament.name}
                  </h1>
                  <Pencil className="w-4 h-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
                </button>
              )}
            </div>
          ) : (
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-primary">
              {tournament.name}
            </h1>
          )}
          <p className="text-muted-foreground text-sm uppercase tracking-widest font-bold">
            Active
          </p>
        </div>
        {isHost && (
          <Button variant="outline" size="sm" onClick={handleUndo} disabled={undoMatch.isPending}>
            <Undo2 className="w-4 h-4 mr-2" /> Undo Last
          </Button>
        )}
      </div>

      {/* ── Championship Bracket ─────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-bold uppercase tracking-widest text-primary">
            Championship Tournament
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
                    m.isBye ? null : (
                      <MatchCard
                        key={m.id}
                        match={m}
                        tournament={tournament}
                        displayName={displayName}
                        isHost={isHost}
                        onSetWinner={handleSetWinner}
                        isPending={updateMatch.isPending}
                        isChampionship={m.round === maxRound}
                        onPlayerClick={(id) => setLocation(`/player/${id}`)}
                      />
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Match History */}
        {completedMatches.length > 0 && (
          <div className="space-y-2 mt-2">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Match History
              </h3>
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
                        {roundLabel(m)}
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
      </section>

      {/* ── Open Play ───────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-orange-400" />
          <h2 className="text-sm font-bold uppercase tracking-widest text-orange-400">
            Open Play
          </h2>
        </div>
        <OpenPlaySection tournamentId={tournament.id} hostToken={hostToken} />
      </section>
    </div>
  );
}

// ── MatchCard ─────────────────────────────────────────────────────────────────

interface MatchCardProps {
  match: Match;
  tournament: TournamentFull;
  displayName: (id?: string | null) => string | null;
  isHost: boolean;
  onSetWinner: (matchId: string, winnerId: string, s1?: number, s2?: number) => void;
  isPending: boolean;
  isChampionship?: boolean;
  onPlayerClick: (id: string) => void;
}

function MatchCard({
  match, tournament, displayName, isHost, onSetWinner, isPending,
  isChampionship, onPlayerClick,
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

  const accentClass = isChampionship ? "border-yellow-500/40" : "border-primary/40";

  const rowBg = (playerId: string | null | undefined) => {
    if (!playerId || !isDone) return "";
    return match.winnerId === playerId ? "bg-primary/10" : "opacity-40 grayscale";
  };

  const getTeamPlayers = (teamId: string | null | undefined) => {
    const team = teamId ? tournament.teams?.find((t) => t.id === teamId) ?? null : null;
    if (!team) return [];
    return [team.player1Id, team.player2Id]
      .filter(Boolean)
      .map((pid) => tournament.players.find((p) => p.id === pid) ?? null)
      .filter(Boolean) as TournamentFull["players"];
  };

  return (
    <div
      className={`relative bg-card rounded-xl border-2 shadow-sm overflow-hidden flex flex-col transition-all
        ${isActive ? accentClass : "border-border"}
        ${isBye ? "opacity-50" : ""}
        ${isPendingStatus && !isBye ? "opacity-50" : ""}
        ${isChampionship ? "ring-2 ring-yellow-500/30" : ""}
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

      {/* Team 1 */}
      <div className={`p-3 flex items-center justify-between gap-2 transition-colors ${rowBg(match.playerOneId)}`}>
        <TeamSlot
          players={getTeamPlayers(match.playerOneId)}
          name={displayName(match.playerOneId)}
          isWinner={isDone && match.winnerId === match.playerOneId}
          isChampionship={isChampionship}
          onPlayerClick={onPlayerClick}
        />
        {canPickWinner && (
          <WinButton
            onClick={() => match.playerOneId && onSetWinner(match.id, match.playerOneId, parseScore(scoreOne), parseScore(scoreTwo))}
            disabled={isPending}
          />
        )}
        {isDone && match.winnerId === match.playerOneId && (
          isChampionship ? <Crown className="w-4 h-4 text-yellow-500 shrink-0" /> : <CheckMark />
        )}
      </div>

      <div className="h-px bg-border" />

      {/* Team 2 */}
      {isBye ? (
        <div className="p-2 text-center text-xs font-bold uppercase tracking-widest text-muted-foreground bg-muted/30">Bye</div>
      ) : (
        <div className={`p-3 flex items-center justify-between gap-2 transition-colors ${rowBg(match.playerTwoId)}`}>
          <TeamSlot
            players={getTeamPlayers(match.playerTwoId)}
            name={displayName(match.playerTwoId)}
            isWinner={isDone && match.winnerId === match.playerTwoId}
            isChampionship={isChampionship}
            onPlayerClick={onPlayerClick}
          />
          {canPickWinner && (
            <WinButton
              onClick={() => match.playerTwoId && onSetWinner(match.id, match.playerTwoId, parseScore(scoreOne), parseScore(scoreTwo))}
              disabled={isPending}
            />
          )}
          {isDone && match.winnerId === match.playerTwoId && (
            isChampionship ? <Crown className="w-4 h-4 text-yellow-500 shrink-0" /> : <CheckMark />
          )}
        </div>
      )}
    </div>
  );
}

// ── Small components ──────────────────────────────────────────────────────────

function TeamSlot({
  players, name, isWinner, isChampionship, onPlayerClick,
}: {
  players: TournamentFull["players"];
  name: string | null;
  isWinner: boolean;
  isChampionship?: boolean;
  onPlayerClick: (id: string) => void;
}) {
  if (!name && players.length === 0) {
    return (
      <div className="font-bold flex items-center gap-2 min-w-0 flex-1">
        <span className="text-muted-foreground/40 italic text-sm font-normal">TBD</span>
      </div>
    );
  }
  return (
    <div className="font-bold flex items-center gap-2 min-w-0 flex-1">
      {/* Stacked mini-avatars */}
      {players.length > 0 && (
        <div className="flex -space-x-2 shrink-0">
          {players.map((p) => (
            <button
              key={p.id}
              onClick={() => onPlayerClick(p.id)}
              className="hover:opacity-80 transition-opacity ring-2 ring-card rounded-full"
            >
              <PlayerAvatar player={p} size="sm" />
            </button>
          ))}
        </div>
      )}
      <div className="min-w-0 flex flex-col">
        <span className={`truncate text-sm ${isWinner && !isChampionship ? "text-primary" : ""}`}>
          {name ?? "TBD"}
        </span>
        {isWinner && isChampionship && (
          <span className="text-[10px] text-yellow-500 font-bold uppercase tracking-wider">Champions 🏆</span>
        )}
      </div>
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
