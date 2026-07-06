import { useState } from "react";
import { useGetKnownPlayers, KnownPlayer } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { PlayerAvatar } from "@/components/ui/player-avatar";
import { ChevronDown, Search, UserPlus, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface KnownPlayerPickerProps {
  onSelect: (player: KnownPlayer) => void;
  isPending?: boolean;
  disabledClerkIds?: Set<string>;
}

export function KnownPlayerPicker({ onSelect, isPending = false, disabledClerkIds = new Set() }: KnownPlayerPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [recentlyAdded, setRecentlyAdded] = useState<Set<string>>(new Set());

  const { data: knownPlayers = [] } = useGetKnownPlayers();

  const query = search.toLowerCase().trim();
  const filtered = query
    ? knownPlayers.filter((p) => `${p.firstName} ${p.lastName}`.toLowerCase().includes(query))
    : knownPlayers;

  const handleSelect = (player: KnownPlayer) => {
    if (isPending) return;
    onSelect(player);
    setRecentlyAdded((prev) => new Set([...prev, player.clerkUserId]));
  };

  return (
    <div className="bg-card border border-primary/20 rounded-2xl overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-primary/5 transition-colors"
        onClick={() => setIsOpen((v) => !v)}
      >
        <div className="flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-primary" />
          <span className="text-sm font-bold text-primary uppercase tracking-widest">Add Existing Player</span>
        </div>
        <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform duration-200", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <div className="border-t border-border/50 p-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name…"
              className="pl-9 h-10 bg-muted/40 border-none"
              autoFocus
            />
          </div>

          {knownPlayers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No signed-in players on record yet.
            </p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No players match "{search}".
            </p>
          ) : (
            <ul className="space-y-0.5 max-h-56 overflow-y-auto -mx-1">
              {filtered.map((p) => {
                const alreadyIn = disabledClerkIds.has(p.clerkUserId) || recentlyAdded.has(p.clerkUserId);
                const justAdded = recentlyAdded.has(p.clerkUserId);
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      disabled={alreadyIn || isPending}
                      onClick={() => handleSelect(p)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors text-left",
                        alreadyIn
                          ? "opacity-50 cursor-default"
                          : "hover:bg-primary/10 active:bg-primary/15 cursor-pointer"
                      )}
                    >
                      <PlayerAvatar player={p} size="sm" />
                      <span className="flex-1 text-sm font-medium truncate">
                        {p.firstName} {p.lastName}
                      </span>
                      {justAdded ? (
                        <Check className="w-4 h-4 text-green-500 shrink-0" />
                      ) : (
                        <span className="text-xs text-muted-foreground shrink-0">
                          {Math.round(p.eloRating)} ELO
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
