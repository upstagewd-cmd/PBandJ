import { useEffect } from "react";
import confetti from "canvas-confetti";
import { TournamentFull, useGetTournamentSummary, getGetTournamentSummaryQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { getPlayerDisplayName } from "@/lib/display-name";
import { Trophy, Clock, Users, Hash, Loader2 } from "lucide-react";

interface ChampionshipProps {
  tournament: TournamentFull;
}

function getTeamLines(team: any): string[] {
  if (!team) return [];
  if (Array.isArray(team.members) && team.members.length > 0) {
    return team.members.map((member: any) => member.nickname || `${member.firstName} ${member.lastName}`.trim()).filter(Boolean);
  }
  return [getPlayerDisplayName(team)];
}

export function TournamentChampionship({ tournament }: ChampionshipProps) {
  const [, setLocation] = useLocation();
  
  const { data: summary, isLoading } = useGetTournamentSummary(tournament.id, {
    query: { enabled: !!tournament.id, queryKey: getGetTournamentSummaryQueryKey(tournament.id) }
  });

  useEffect(() => {
    // Fire confetti on mount
    const duration = 3000;
    const end = Date.now() + duration;

    const frame = () => {
      confetti({
        particleCount: 5,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: ['#ff4500', '#ff8c00', '#ffd700']
      });
      confetti({
        particleCount: 5,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: ['#ff4500', '#ff8c00', '#ffd700']
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    };
    frame();
  }, []);

  if (isLoading || !summary) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
      </div>
    );
  }

  const championLines = getTeamLines((summary as any).champion);
  const runnerUpLines = getTeamLines((summary as any).runnerUp);
  const thirdPlaceLines = getTeamLines((summary as any).thirdPlace);

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-12 animate-in fade-in zoom-in-95 duration-700">
      
      <div className="text-center space-y-4">
        <div className="mx-auto w-20 h-20 bg-yellow-500/20 rounded-full flex items-center justify-center mb-6">
          <Trophy className="w-10 h-10 text-yellow-500" />
        </div>
        <h1 className="text-5xl md:text-7xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-yellow-400 to-orange-600 pb-2">
          CHAMPION
        </h1>
        <p className="text-2xl font-bold text-muted-foreground">{tournament.name}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
        
        {/* Runner Up */}
        <div className="order-2 md:order-1 bg-card border border-border/50 rounded-3xl p-6 text-center shadow-lg transform md:-translate-y-4">
          <div className="text-4xl mb-4">🥈</div>
          <h3 className="text-muted-foreground uppercase text-xs tracking-widest font-bold mb-2">Runner Up</h3>
          <div className="text-2xl font-bold leading-tight space-y-0.5">
            {runnerUpLines.length > 0 ? runnerUpLines.map((line) => <p key={line}>{line}</p>) : <p>—</p>}
          </div>
        </div>

        {/* First Place */}
        <div className="order-1 md:order-2 bg-gradient-to-b from-primary/20 to-card border-2 border-primary rounded-3xl p-8 text-center shadow-[0_0_40px_rgba(255,100,50,0.3)] z-10">
          <div className="text-6xl mb-6">🥇</div>
          <h3 className="text-primary uppercase text-sm tracking-widest font-black mb-2">1st Place</h3>
          <div className="text-3xl md:text-4xl font-extrabold leading-tight space-y-1">
            {championLines.length > 0 ? championLines.map((line) => <p key={line}>{line}</p>) : <p>{getPlayerDisplayName((summary as any).champion)}</p>}
          </div>
        </div>

        {/* Third Place */}
        {summary.thirdPlace ? (
          <div className="order-3 bg-card border border-border/50 rounded-3xl p-6 text-center shadow-lg transform md:-translate-y-8">
            <div className="text-4xl mb-4">🥉</div>
            <h3 className="text-muted-foreground uppercase text-xs tracking-widest font-bold mb-2">Third Place</h3>
            <div className="text-2xl font-bold leading-tight space-y-0.5">
              {thirdPlaceLines.length > 0 ? thirdPlaceLines.map((line) => <p key={line}>{line}</p>) : <p>{getPlayerDisplayName((summary as any).thirdPlace)}</p>}
            </div>
          </div>
        ) : (
          <div className="order-3 hidden md:block"></div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 bg-muted/30 border border-border/50 rounded-3xl p-6">
        <div className="flex flex-col items-center justify-center text-center p-4">
          <Users className="w-6 h-6 text-muted-foreground mb-2" />
          <p className="text-3xl font-black">{summary.playerCount}</p>
          <p className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Players</p>
        </div>
        <div className="flex flex-col items-center justify-center text-center p-4 border-x border-border/50">
          <Hash className="w-6 h-6 text-muted-foreground mb-2" />
          <p className="text-3xl font-black">{summary.totalMatches}</p>
          <p className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Matches</p>
        </div>
        <div className="flex flex-col items-center justify-center text-center p-4">
          <Clock className="w-6 h-6 text-muted-foreground mb-2" />
          <p className="text-3xl font-black">{summary.durationMinutes || '< 1'}</p>
          <p className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Minutes</p>
        </div>
      </div>

      <div className="flex justify-center pt-8">
        <Button 
          size="lg" 
          className="h-16 px-12 text-xl font-bold rounded-2xl transition-transform active:scale-95 shadow-[0_0_20px_rgba(255,100,50,0.3)] hover:shadow-[0_0_30px_rgba(255,100,50,0.4)]"
          onClick={() => setLocation('/')}
        >
          CREATE NEW TOURNAMENT
        </Button>
      </div>
    </div>
  );
}
