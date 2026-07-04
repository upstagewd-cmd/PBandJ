import { useMemo } from "react";
import { TournamentFull, Match, Player, useUpdateMatch, useUndoLastMatch } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trophy, Undo2, Crown } from "lucide-react";
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

  // Group matches by round
  const rounds = useMemo(() => {
    const grouped = new Map<number, Match[]>();
    let maxRound = 0;
    
    tournament.matches.forEach(m => {
      if (!grouped.has(m.round)) grouped.set(m.round, []);
      grouped.get(m.round)!.push(m);
      if (m.round > maxRound) maxRound = m.round;
    });
    
    // Sort matches within each round
    for (const [round, matches] of grouped.entries()) {
      matches.sort((a, b) => a.matchNumber - b.matchNumber);
    }
    
    const result = [];
    for (let i = 1; i <= maxRound; i++) {
      result.push({
        round: i,
        name: i === maxRound ? "Finals" : i === maxRound - 1 ? "Semifinals" : `Round ${i}`,
        matches: grouped.get(i) || []
      });
    }
    return result;
  }, [tournament.matches]);

  const getPlayer = (id?: string | null) => {
    if (!id) return null;
    return tournament.players.find(p => p.id === id);
  };

  const handleSetWinner = (matchId: string, winnerId: string) => {
    if (!isHost) return;
    updateMatch.mutate({
      tournamentId: tournament.id,
      matchId,
      data: { hostToken, winnerId }
    });
  };

  const handleUndo = () => {
    if (!isHost) return;
    undoMatch.mutate({
      tournamentId: tournament.id,
      data: { hostToken }
    });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] w-full">
      <div className="flex items-center justify-between mb-6 px-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-primary">
            {tournament.name}
          </h1>
          <p className="text-muted-foreground text-sm uppercase tracking-widest font-bold">Tournament Active</p>
        </div>
        {isHost && (
          <Button variant="outline" size="sm" onClick={handleUndo} disabled={undoMatch.isPending}>
            <Undo2 className="w-4 h-4 mr-2" />
            Undo Last
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-x-auto overflow-y-auto bg-muted/20 border-y border-border/50 rounded-xl p-6 snap-x snap-mandatory hide-scrollbar">
        <div className="flex gap-12 min-w-max pb-8 h-full">
          {rounds.map((r, rIdx) => (
            <div key={r.round} className="flex flex-col min-w-[280px] snap-center h-full">
              <h3 className="text-center font-bold text-muted-foreground uppercase tracking-widest mb-6">
                {r.name}
              </h3>
              
              <div className="flex-1 flex flex-col justify-around gap-6">
                {r.matches.map((m, mIdx) => {
                  const p1 = getPlayer(m.playerOneId);
                  const p2 = getPlayer(m.playerTwoId);
                  
                  const isFinal = r.round === rounds.length;

                  return (
                    <div 
                      key={m.id} 
                      className={`relative bg-card rounded-xl border-2 shadow-sm overflow-hidden flex flex-col transition-colors
                        ${m.status === 'active' ? 'border-primary shadow-[0_0_15px_rgba(255,100,50,0.1)]' : 'border-border'}
                        ${m.isBye ? 'opacity-60 grayscale' : ''}
                      `}
                    >
                      {/* Player 1 Slot */}
                      <div 
                        className={`p-3 flex items-center justify-between border-b border-border transition-colors
                          ${m.winnerId === m.playerOneId ? 'bg-primary/10' : ''}
                          ${m.winnerId && m.winnerId !== m.playerOneId ? 'opacity-40 grayscale' : ''}
                        `}
                      >
                        <div className="font-bold truncate pr-2 flex items-center gap-2">
                          {p1 ? `${p1.firstName} ${p1.lastName.charAt(0)}.` : <span className="text-muted-foreground/50 italic text-sm">TBD</span>}
                          {m.winnerId === m.playerOneId && isFinal && <Crown className="w-4 h-4 text-yellow-500" />}
                        </div>
                        {isHost && m.status === 'active' && p1 && p2 && (
                          <Button 
                            size="sm" 
                            variant="secondary"
                            className="h-7 text-xs font-bold shrink-0" 
                            onClick={() => handleSetWinner(m.id, p1.id)}
                          >
                            Win
                          </Button>
                        )}
                        {m.winnerId === m.playerOneId && !isFinal && (
                          <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs shrink-0">
                            <Check className="w-3 h-3" />
                          </div>
                        )}
                      </div>

                      {/* Player 2 Slot */}
                      {!m.isBye && (
                        <div 
                          className={`p-3 flex items-center justify-between transition-colors
                            ${m.winnerId === m.playerTwoId ? 'bg-primary/10' : ''}
                            ${m.winnerId && m.winnerId !== m.playerTwoId ? 'opacity-40 grayscale' : ''}
                          `}
                        >
                          <div className="font-bold truncate pr-2 flex items-center gap-2">
                            {p2 ? `${p2.firstName} ${p2.lastName.charAt(0)}.` : <span className="text-muted-foreground/50 italic text-sm">TBD</span>}
                            {m.winnerId === m.playerTwoId && isFinal && <Crown className="w-4 h-4 text-yellow-500" />}
                          </div>
                          {isHost && m.status === 'active' && p1 && p2 && (
                            <Button 
                              size="sm" 
                              variant="secondary"
                              className="h-7 text-xs font-bold shrink-0" 
                              onClick={() => handleSetWinner(m.id, p2.id)}
                            >
                              Win
                            </Button>
                          )}
                          {m.winnerId === m.playerTwoId && !isFinal && (
                            <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs shrink-0">
                              <Check className="w-3 h-3" />
                            </div>
                          )}
                        </div>
                      )}
                      
                      {m.isBye && (
                        <div className="p-2 text-center text-xs font-bold uppercase tracking-widest text-muted-foreground bg-muted/30">
                          BYE
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Check({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
  );
}
