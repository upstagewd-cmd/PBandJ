import { useParams, useLocation } from "wouter";
import { useGetPlayerStats } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { PlayerAvatar } from "@/components/ui/player-avatar";
import { BadgeInfoChip } from "@/components/profile/BadgeInfoChip";
import { getPlayerDisplayName, getPlayerDisplaySubtext } from "@/lib/display-name";
import { ArrowLeft, Trophy, Target, TrendingUp, Star } from "lucide-react";

export default function PlayerStatsPage() {
  const params = useParams<{ playerId: string }>();
  const [, setLocation] = useLocation();
  const { data: stats, isLoading, error } = useGetPlayerStats(params.playerId ?? "");

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center">
        <div className="text-muted-foreground animate-pulse text-lg font-bold">Loading stats...</div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Player not found.</p>
        <Button variant="outline" onClick={() => setLocation("/")}>Go Home</Button>
      </div>
    );
  }

  const { player, wins, losses, matchesPlayed, winPct, tournamentWins, recentMatches } = stats;
  const badges = (stats as any).badges as Array<{ id: string; name: string; icon: string; description: string }> ?? [];
  const tournamentsPlayed = Number((stats as any).tournamentsPlayed ?? 0);

  const rankTitle = (player as any).rankTitle ?? "New Seed";
  const rankEmoji = (player as any).rankEmoji ?? "🌱";
  const eloRating = (player as any).eloRating ?? 1200;

  return (
    <div className="min-h-[100dvh] w-full px-4 py-8 max-w-2xl mx-auto space-y-8">
      <Button variant="ghost" size="sm" onClick={() => history.back()} className="gap-2">
        <ArrowLeft className="w-4 h-4" /> Back
      </Button>

      {/* Hero card */}
      <div className="bg-card border border-border/50 rounded-3xl p-6 shadow-xl space-y-4">
        <div className="flex items-center gap-4">
          <PlayerAvatar player={player} size="xl" />
          <div>
            <h1 className="text-2xl font-extrabold">{getPlayerDisplayName(player)}</h1>
            {getPlayerDisplaySubtext(player) && (
              <p className="text-muted-foreground text-sm">{getPlayerDisplaySubtext(player)}</p>
            )}
            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-lg">{rankEmoji}</span>
              <span className="text-sm font-bold text-primary">{rankTitle}</span>
              <span className="text-xs text-muted-foreground ml-1">· {Math.round(eloRating)} ELO</span>
            </div>
          </div>
        </div>

        {badges.length > 0 && (
          <div className="pt-1 space-y-2">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Badges</p>
            <div className="flex flex-wrap gap-2">
              {badges.map((b) => (
                <BadgeInfoChip key={b.id} badge={b} />
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground/70">Tap a badge to view details.</p>
          </div>
        )}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard icon={<Target className="w-5 h-5 text-primary" />} label="Matches" value={matchesPlayed} />
        <StatCard icon={<TrendingUp className="w-5 h-5 text-green-400" />} label="Wins" value={wins} sub={`${winPct}% win rate`} />
        <StatCard icon={<Target className="w-5 h-5 text-muted-foreground" />} label="Losses" value={losses} />
        <StatCard
          icon={<Trophy className="w-5 h-5 text-gold" />}
          label="Titles"
          value={tournamentWins}
          sub={`1st ${(stats as any).firstPlaceCount ?? 0} · 2nd ${(stats as any).secondPlaceCount ?? 0} · 3rd ${(stats as any).thirdPlaceCount ?? 0}`}
        />
      </div>

      {/* Recent matches */}
      {recentMatches.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <Star className="w-4 h-4" /> Recent Matches
          </h2>
          <div className="bg-card border border-border/50 rounded-2xl divide-y divide-border/30 overflow-hidden">
            {recentMatches.map((m) => {
              const matchLabel = m.bracket === "open_play"
                ? "Open Play"
                : m.bracket === "winner"
                ? "WB"
                : m.bracket === "loser"
                ? "LB"
                : m.bracket === "grand_finals"
                ? "GF"
                : "GF Reset";
              const roundLabel = m.bracket === "open_play" ? "" : ` R${m.round}`;

              return (
                <div key={m.matchId} className="flex items-center gap-3 px-4 py-3">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-extrabold shrink-0 ${m.won ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                    {m.won ? "W" : "L"}
                  </span>
                  <div className="min-w-0 flex-1">
                    {Array.isArray((m as any).opponentPlayers) && (m as any).opponentPlayers.length > 0 && (
                      <div className="flex -space-x-2 mb-1">
                        {(m as any).opponentPlayers.slice(0, 2).map((opponent: any) => (
                          <div key={opponent.id} className="ring-2 ring-card rounded-full">
                            <PlayerAvatar player={opponent} size="sm" />
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="text-sm font-bold truncate">
                      vs <span className="text-foreground">{m.opponentName}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {m.tournamentName} · {matchLabel}{roundLabel}
                    </p>
                  </div>
                  {(m.scoreOne !== null || m.scoreTwo !== null) && (
                    <span className="font-mono text-sm text-muted-foreground shrink-0">
                      {m.scoreOne ?? "–"}–{m.scoreTwo ?? "–"}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {matchesPlayed === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Star className="w-12 h-12 opacity-20 mx-auto mb-3" />
          <p className="font-medium">No matches played yet.</p>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: number; sub?: string }) {
  return (
    <div className="bg-card border border-border/50 rounded-2xl p-4 flex flex-col gap-1 shadow-sm">
      {icon}
      <p className="text-2xl font-extrabold mt-1">{value}</p>
      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
