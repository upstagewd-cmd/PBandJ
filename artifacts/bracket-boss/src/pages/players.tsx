import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlayerAvatar } from "@/components/ui/player-avatar";
import { ArrowLeft, Search, Trophy, TrendingUp, Users } from "lucide-react";

type PlayerSummary = {
  id: string;
  firstName: string;
  lastName: string;
  teamName: string | null;
  avatarUrl: string | null;
  eloRating: number;
  rankTitle: string;
  rankEmoji: string;
  skillLevel: string | null;
  wins: number;
  losses: number;
  matchesPlayed: number;
  winPct: number;
  badgeCount: number;
  joinedAt: string;
};

const baseApiPath = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/players`;

export default function PlayersPage() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"elo" | "wins" | "matches">("elo");

  const { data: players = [], isLoading, error } = useQuery<PlayerSummary[]>({
    queryKey: ["players-directory"],
    queryFn: async () => {
      const response = await fetch(baseApiPath, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to load players");
      return response.json() as Promise<PlayerSummary[]>;
    },
  });

  const visiblePlayers = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = query
      ? players.filter((player) => {
          const name = `${player.firstName} ${player.lastName}`.toLowerCase();
          const teamName = (player.teamName ?? "").toLowerCase();
          return name.includes(query) || teamName.includes(query);
        })
      : players;

    return [...filtered].sort((a, b) => {
      if (sortBy === "wins") return b.wins - a.wins;
      if (sortBy === "matches") return b.matchesPlayed - a.matchesPlayed;
      return b.eloRating - a.eloRating;
    });
  }, [players, search, sortBy]);

  return (
    <div className="min-h-[100dvh] w-full px-4 py-8 max-w-5xl mx-auto space-y-6">
      <Button variant="ghost" size="sm" onClick={() => history.back()} className="gap-2">
        <ArrowLeft className="w-4 h-4" /> Back
      </Button>

      <div className="bg-card border border-border/50 rounded-3xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-muted-foreground">Community</p>
            <h1 className="text-2xl font-extrabold">Players</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Browse the local player roster and tap into a read-only profile for stats, badges, and recent matches.
            </p>
          </div>
          <Button variant="outline" onClick={() => setLocation("/")}>
            Home
          </Button>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <label className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or nickname"
              className="pl-9 h-11"
            />
          </label>
          <label className="sm:w-44">
            <span className="sr-only">Sort by</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "elo" | "wins" | "matches")}
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-medium"
            >
              <option value="elo">Sort: ELO</option>
              <option value="wins">Sort: Wins</option>
              <option value="matches">Sort: Matches</option>
            </select>
          </label>
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-3xl border border-border/50 bg-card/70 p-8 text-center text-sm text-muted-foreground">
          Loading players...
        </div>
      ) : error ? (
        <div className="rounded-3xl border border-destructive/20 bg-destructive/10 p-8 text-center text-sm text-destructive">
          We couldn’t load the player directory right now.
        </div>
      ) : visiblePlayers.length === 0 ? (
        <div className="rounded-3xl border border-border/50 bg-card/70 p-8 text-center text-sm text-muted-foreground">
          No players match your search yet.
        </div>
      ) : (
        <div className="space-y-3">
          {visiblePlayers.map((player, index) => {
            const displayName = player.teamName || `${player.firstName} ${player.lastName}`;
            const fullName = `${player.firstName} ${player.lastName}`;
            return (
              <button
                key={player.id}
                type="button"
                onClick={() => setLocation(`/player/${player.id}`)}
                className="w-full rounded-3xl border border-border/50 bg-card/90 p-4 text-left shadow-sm transition-all hover:border-primary/40 hover:shadow-md"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-sm font-extrabold text-primary shrink-0">
                      {index + 1}
                    </div>
                    <PlayerAvatar player={player as any} size="md" />
                    <div className="min-w-0">
                      <p className="text-base font-bold truncate">{displayName}</p>
                      {player.teamName && <p className="text-sm text-muted-foreground truncate">{fullName}</p>}
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground">{player.rankEmoji} {player.rankTitle}</span>
                        <span>· {Math.round(player.eloRating)} ELO</span>
                        {player.skillLevel && <span>· {player.skillLevel}</span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 sm:ml-auto">
                    <div className="rounded-2xl border border-border/50 bg-muted/40 px-3 py-2 text-sm">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <TrendingUp className="w-4 h-4 text-green-400" />
                        <span className="font-semibold text-foreground">{player.wins}W</span>
                        <span>/{player.losses}L</span>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-border/50 bg-muted/40 px-3 py-2 text-sm">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Trophy className="w-4 h-4 text-yellow-500" />
                        <span className="font-semibold text-foreground">{player.matchesPlayed}</span>
                        <span>matches</span>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-border/50 bg-muted/40 px-3 py-2 text-sm">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Users className="w-4 h-4 text-primary" />
                        <span className="font-semibold text-foreground">{player.badgeCount}</span>
                        <span>badges</span>
                      </div>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
