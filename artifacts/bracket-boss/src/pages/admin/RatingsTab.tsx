import { useState, useEffect } from "react";
import { adminGet, adminPatch, adminPost } from "./useAdmin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, RefreshCw, RotateCcw, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface RatedPlayer {
  id: string; firstName: string; lastName: string; partnerName: string | null;
  eloRating: number; avatarUrl: string | null;
  rank: { title: string; emoji: string };
}

export function RatingsTab({ code }: { code: string }) {
  const { toast } = useToast();
  const [players, setPlayers] = useState<RatedPlayer[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editElo, setEditElo] = useState("");

  const load = async () => {
    try {
      const data = await adminGet<RatedPlayer[]>(code, "/ratings");
      setPlayers([...data].sort((a, b) => b.eloRating - a.eloRating));
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = players.filter((p) => {
    const q = search.toLowerCase();
    return p.firstName.toLowerCase().includes(q) || p.lastName.toLowerCase().includes(q);
  });

  const saveElo = async (id: string) => {
    const elo = Number(editElo);
    if (isNaN(elo)) return;
    try {
      await adminPatch(code, `/ratings/${id}`, { eloRating: elo });
      toast({ title: "Rating updated" });
      setEditId(null);
      await load();
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    }
  };

  const [pendingReset, setPendingReset] = useState<{ id: string; name: string } | null>(null);
  const [pendingRecalc, setPendingRecalc] = useState(false);

  const resetElo = (id: string, name: string) => setPendingReset({ id, name });

  const confirmReset = async () => {
    if (!pendingReset) return;
    try {
      await adminPost(code, `/ratings/reset/${pendingReset.id}`, {});
      toast({ title: "Rating reset to 1200" });
      await load();
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    }
    setPendingReset(null);
  };

  const recalculate = async () => {
    if (!pendingRecalc) { setPendingRecalc(true); return; }
    setPendingRecalc(false);
    setRecalculating(true);
    try {
      const result = await adminPost<{ ok: boolean; updated: number }>(code, "/ratings/recalculate", {});
      toast({ title: `Recalculated ${result.updated} players` });
      await load();
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    }
    setRecalculating(false);
  };

  if (loading) return <p className="text-muted-foreground p-4">Loading ratings…</p>;

  return (
    <div className="space-y-4">
      {pendingReset && (
        <div className="bg-primary/10 border border-primary/40 rounded-xl p-4 space-y-3">
          <p className="text-sm font-bold text-primary">Reset {pendingReset.name}'s rating to 1200?</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={confirmReset} className="bg-primary hover:bg-primary/90 text-primary-foreground">Reset</Button>
            <Button size="sm" variant="ghost" onClick={() => setPendingReset(null)}>Cancel</Button>
          </div>
        </div>
      )}
      {pendingRecalc && (
        <div className="bg-primary/10 border border-primary/40 rounded-xl p-4 space-y-3">
          <p className="text-sm font-bold text-primary">Recalculate ALL ratings from match history? Current ratings will be overwritten.</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={recalculate} disabled={recalculating} className="bg-primary hover:bg-primary/90 text-primary-foreground">
              <RefreshCw className={`w-3 h-3 mr-1 ${recalculating ? "animate-spin" : ""}`} /> Confirm
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPendingRecalc(false)}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search players…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button variant="outline" size="sm" onClick={recalculate} disabled={recalculating}>
          <RefreshCw className={`w-4 h-4 mr-1 ${recalculating ? "animate-spin" : ""}`} />
          Recalc All
        </Button>
      </div>

      <div className="space-y-2">
        {filtered.map((p, i) => (
          <div key={p.id} className="bg-card border border-border/50 rounded-xl p-3 flex items-center gap-3">
            <span className="text-xs font-mono text-muted-foreground w-5 text-right shrink-0">{i + 1}</span>
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-xs font-bold overflow-hidden shrink-0">
              {p.avatarUrl ? <img src={p.avatarUrl} className="w-full h-full object-cover" /> : `${p.firstName[0]}${p.lastName[0]}`}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm truncate">{p.firstName} {p.lastName}{p.partnerName ? ` + ${p.partnerName}` : ""}</p>
              <p className="text-xs text-muted-foreground">{p.rank.emoji} {p.rank.title}</p>
            </div>

            {editId === p.id ? (
              <div className="flex gap-1 items-center">
                <Input type="number" value={editElo} onChange={(e) => setEditElo(e.target.value)} className="w-24 h-8 text-sm" />
                <Button size="sm" className="h-8 px-2" onClick={() => saveElo(p.id)}><Check className="w-3 h-3" /></Button>
                <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => setEditId(null)}>✕</Button>
              </div>
            ) : (
              <div className="flex gap-2 items-center shrink-0">
                <button className="text-sm font-mono font-bold hover:text-primary transition-colors" onClick={() => { setEditId(p.id); setEditElo(String(Math.round(p.eloRating))); }}>
                  {Math.round(p.eloRating)}
                </button>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-muted-foreground" onClick={() => resetElo(p.id, `${p.firstName} ${p.lastName}`)}>
                  <RotateCcw className="w-3 h-3" />
                </Button>
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && <p className="text-muted-foreground text-sm py-4 text-center">No players found.</p>}
      </div>
    </div>
  );
}
