import { useState } from "react";
import { useGetOpenPlayPool, useLogOpenPlayMatch } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { PlayerAvatar } from "@/components/ui/player-avatar";
import { useToast } from "@/hooks/use-toast";
import { Users, Plus, Trophy, Loader2, X } from "lucide-react";

interface OpenPlayProps {
  tournamentId: string;
  hostToken: string | null;
}

type PoolPlayer = {
  id: string;
  firstName: string;
  lastName: string;
  teamName?: string | null;
  avatarUrl?: string | null;
  eloRating?: number;
  rankTitle?: string | null;
  rankEmoji?: string | null;
  partnerId?: string | null;
};

function displayName(p: PoolPlayer) {
  return p.teamName || `${p.firstName} ${p.firstName.charAt(0)}.`;
}

export function OpenPlaySection({ tournamentId, hostToken }: OpenPlayProps) {
  const isHost = !!hostToken;
  const { toast } = useToast();

  const { data, isLoading, refetch } = useGetOpenPlayPool(tournamentId, {
    query: { refetchInterval: 8000, queryKey: ["openPlayPool", tournamentId] },
  });

  const logMatch = useLogOpenPlayMatch();

  // Team builder state
  const [teamOneIds, setTeamOneIds] = useState<string[]>([]);
  const [teamTwoIds, setTeamTwoIds] = useState<string[]>([]);
  const [scoreOne, setScoreOne] = useState("");
  const [scoreTwo, setScoreTwo] = useState("");
  const [building, setBuilding] = useState(false);

  const pool: PoolPlayer[] = (data?.pool ?? []) as PoolPlayer[];
  const recentMatches = data?.recentMatches ?? [];

  // Group paired players; singletons remain separate
  const pairedIds = new Set<string>();
  const pairs: [PoolPlayer, PoolPlayer][] = [];
  const singles: PoolPlayer[] = [];
  for (const p of pool) {
    if (pairedIds.has(p.id)) continue;
    const partner = p.partnerId ? pool.find((x) => x.id === p.partnerId) : null;
    if (partner) {
      pairs.push([p, partner]);
      pairedIds.add(p.id);
      pairedIds.add(partner.id);
    } else {
      singles.push(p);
    }
  }

  const selectedIds = new Set([...teamOneIds, ...teamTwoIds]);

  const togglePlayer = (id: string, team: 1 | 2) => {
    const setters = team === 1 ? [teamOneIds, setTeamOneIds] : [teamTwoIds, setTeamTwoIds];
    const [ids, setIds] = setters as [string[], (v: string[]) => void];
    if (ids.includes(id)) {
      setIds(ids.filter((x) => x !== id));
    } else if (ids.length < 2) {
      setIds([...ids, id]);
    }
  };

  const handleLogMatch = (winnerTeam: 1 | 2) => {
    if (!hostToken || teamOneIds.length === 0 || teamTwoIds.length === 0) return;
    logMatch.mutate(
      {
        tournamentId,
        data: {
          hostToken,
          teamOnePOneId: teamOneIds[0],
          teamOnePTwoId: teamOneIds[1],
          teamTwoPOneId: teamTwoIds[0],
          teamTwoPTwoId: teamTwoIds[1],
          winnerTeam,
          scoreOne: scoreOne ? parseInt(scoreOne) : undefined,
          scoreTwo: scoreTwo ? parseInt(scoreTwo) : undefined,
        },
      },
      {
        onSuccess: () => {
          setTeamOneIds([]);
          setTeamTwoIds([]);
          setScoreOne("");
          setScoreTwo("");
          setBuilding(false);
          toast({ title: "Match logged! ELO updated." });
          refetch();
        },
        onError: () => toast({ title: "Failed to log match", variant: "destructive" }),
      }
    );
  };

  if (isLoading) {
    return <div className="text-center py-8 text-muted-foreground animate-pulse">Loading open play...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Pool */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <Users className="w-4 h-4" /> Open Play Pool
            <span className="text-xs font-normal normal-case tracking-normal">({pool.length} available)</span>
          </h3>
          {isHost && pool.length >= 2 && !building && (
            <Button size="sm" variant="outline" onClick={() => setBuilding(true)} className="gap-1.5 text-xs font-bold">
              <Plus className="w-3.5 h-3.5" /> Log Match
            </Button>
          )}
        </div>

        {pool.length === 0 ? (
          <div className="bg-muted/20 border border-border/30 rounded-2xl p-8 text-center text-muted-foreground">
            <Users className="w-10 h-10 opacity-20 mx-auto mb-2" />
            <p className="text-sm font-medium">No players in the open play pool yet.</p>
            <p className="text-xs mt-1 opacity-60">Players join automatically after being eliminated from the bracket.</p>
          </div>
        ) : (
          <div className="bg-card border border-border/50 rounded-2xl p-4 space-y-3">
            {/* Bracket pairs */}
            {pairs.map(([p1, p2], i) => {
              const pairSelected = selectedIds.has(p1.id) || selectedIds.has(p2.id);
              const onT1 = teamOneIds.includes(p1.id) || teamOneIds.includes(p2.id);
              const onT2 = teamTwoIds.includes(p1.id) || teamTwoIds.includes(p2.id);
              const usePair = (team: 1 | 2) => {
                if (team === 1) setTeamOneIds([p1.id, p2.id]);
                else setTeamTwoIds([p1.id, p2.id]);
              };
              return (
                <div key={p1.id} className={`rounded-xl border p-2.5 transition-colors ${pairSelected ? "bg-primary/5 border-primary/30" : "bg-muted/20 border-border/40"}`}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Pair {i + 1}</span>
                    {building && isHost && (
                      <div className="flex gap-1 ml-auto">
                        <button
                          onClick={() => usePair(1)}
                          disabled={pairSelected && !onT1}
                          className={`text-xs font-bold px-2 py-0.5 rounded-lg transition-colors border ${
                            onT1 ? "bg-primary text-white border-primary" : "border-border text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-30"
                          }`}
                        >→ T1</button>
                        <button
                          onClick={() => usePair(2)}
                          disabled={pairSelected && !onT2}
                          className={`text-xs font-bold px-2 py-0.5 rounded-lg transition-colors border ${
                            onT2 ? "bg-blue-500 text-white border-blue-500" : "border-border text-muted-foreground hover:border-blue-500 hover:text-blue-500 disabled:opacity-30"
                          }`}
                        >→ T2</button>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {[p1, p2].map((p, j) => (
                      <div key={p.id} className="flex items-center gap-2 flex-1 min-w-0">
                        {j === 1 && <span className="text-muted-foreground text-xs">&amp;</span>}
                        <PlayerAvatar player={p} size="sm" />
                        <div className="min-w-0">
                          <p className="font-bold text-sm truncate">{`${p.firstName} ${p.lastName.charAt(0)}.`}</p>
                          {p.rankTitle && <p className="text-[10px] text-muted-foreground">{p.rankEmoji} {Math.round(p.eloRating ?? 1200)}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Singles */}
            {singles.map((p) => (
              <div key={p.id} className={`flex items-center gap-3 rounded-xl p-2.5 transition-colors ${selectedIds.has(p.id) ? "bg-primary/10" : "bg-muted/30"}`}>
                <PlayerAvatar player={p} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm truncate">{`${p.firstName} ${p.lastName.charAt(0)}.`}</p>
                  {p.rankTitle && (
                    <p className="text-[10px] text-muted-foreground">{p.rankEmoji} {p.rankTitle} · {Math.round(p.eloRating ?? 1200)} ELO</p>
                  )}
                </div>
                {building && isHost && (
                  <div className="flex gap-1.5 shrink-0">
                    <button
                      onClick={() => togglePlayer(p.id, 1)}
                      disabled={!teamOneIds.includes(p.id) && (selectedIds.has(p.id) || teamOneIds.length >= 2)}
                      className={`text-xs font-bold px-2 py-1 rounded-lg transition-colors border ${
                        teamOneIds.includes(p.id)
                          ? "bg-primary text-white border-primary"
                          : "border-border text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-30"
                      }`}
                    >T1</button>
                    <button
                      onClick={() => togglePlayer(p.id, 2)}
                      disabled={!teamTwoIds.includes(p.id) && (selectedIds.has(p.id) || teamTwoIds.length >= 2)}
                      className={`text-xs font-bold px-2 py-1 rounded-lg transition-colors border ${
                        teamTwoIds.includes(p.id)
                          ? "bg-blue-500 text-white border-blue-500"
                          : "border-border text-muted-foreground hover:border-blue-500 hover:text-blue-500 disabled:opacity-30"
                      }`}
                    >T2</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Match builder */}
      {building && isHost && (
        <div className="bg-card border border-border/50 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-sm">Log Match</h4>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setBuilding(false); setTeamOneIds([]); setTeamTwoIds([]); }}>
              <X className="w-4 h-4" />
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-primary mb-1.5">Team 1</p>
              {teamOneIds.length === 0
                ? <p className="text-muted-foreground italic text-xs">Select players above</p>
                : teamOneIds.map((id) => {
                    const p = pool.find((x) => x.id === id);
                    return p ? <p key={id} className="font-bold truncate">{p.teamName || `${p.firstName} ${p.lastName}`}</p> : null;
                  })
              }
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-blue-400 mb-1.5">Team 2</p>
              {teamTwoIds.length === 0
                ? <p className="text-muted-foreground italic text-xs">Select players above</p>
                : teamTwoIds.map((id) => {
                    const p = pool.find((x) => x.id === id);
                    return p ? <p key={id} className="font-bold truncate">{p.teamName || `${p.firstName} ${p.lastName}`}</p> : null;
                  })
              }
            </div>
          </div>
          <div className="flex items-center gap-2 justify-center">
            <input
              type="number" min={0} value={scoreOne}
              onChange={(e) => setScoreOne(e.target.value)}
              placeholder="T1 score"
              className="w-20 h-9 text-center rounded-lg border border-border bg-muted/50 text-sm font-bold focus:outline-none focus:border-primary"
            />
            <span className="text-muted-foreground font-bold">–</span>
            <input
              type="number" min={0} value={scoreTwo}
              onChange={(e) => setScoreTwo(e.target.value)}
              placeholder="T2 score"
              className="w-20 h-9 text-center rounded-lg border border-border bg-muted/50 text-sm font-bold focus:outline-none focus:border-blue-400"
            />
          </div>
          {teamOneIds.length > 0 && teamTwoIds.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              <Button
                onClick={() => handleLogMatch(1)}
                disabled={logMatch.isPending}
                className="font-bold bg-primary/90 hover:bg-primary"
              >
                {logMatch.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Trophy className="w-4 h-4 mr-1.5" /> Team 1 Won</>}
              </Button>
              <Button
                onClick={() => handleLogMatch(2)}
                disabled={logMatch.isPending}
                variant="outline"
                className="font-bold border-blue-500/50 text-blue-400 hover:bg-blue-500/10"
              >
                {logMatch.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Trophy className="w-4 h-4 mr-1.5" /> Team 2 Won</>}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Recent open play matches */}
      {recentMatches.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Recent Games</h3>
          <div className="bg-card border border-border/50 rounded-2xl divide-y divide-border/30 overflow-hidden">
            {recentMatches.map((m: any) => {
              const winners = m.winnerTeam === 1 ? m.teamOnePlayers : m.teamTwoPlayers;
              const losers = m.winnerTeam === 1 ? m.teamTwoPlayers : m.teamOnePlayers;
              const winnerNames = winners.map((p: PoolPlayer) => p.teamName || `${p.firstName} ${p.lastName}`).join(" & ");
              const loserNames = losers.map((p: PoolPlayer) => p.teamName || `${p.firstName} ${p.lastName}`).join(" & ");
              return (
                <div key={m.id} className="px-4 py-3 flex items-center gap-3">
                  <Trophy className="w-4 h-4 text-yellow-500 shrink-0" />
                  <div className="min-w-0 flex-1 text-sm">
                    <span className="font-bold text-primary">{winnerNames}</span>
                    <span className="text-muted-foreground mx-1.5">beat</span>
                    <span className="text-muted-foreground">{loserNames}</span>
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
      )}
    </div>
  );
}
