import { useState, useEffect } from "react";
import { adminGet, adminPatch, adminDelete } from "./useAdmin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Pencil, Trash2, Check, Flag } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Tournament {
  id: string; name: string; status: string;
  playerCount: number; matchCount: number;
  createdAt: string; startedAt: string | null; completedAt: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  lobby: "text-blue-400",
  active: "text-green-400",
  completed: "text-muted-foreground",
};

export function TournamentsTab({ code }: { code: string }) {
  const { toast } = useToast();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const load = async () => {
    try {
      const data = await adminGet<Tournament[]>(code, "/tournaments");
      setTournaments(data);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = tournaments.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase()) || t.id.toLowerCase().includes(search.toLowerCase()),
  );

  const saveName = async (id: string) => {
    try {
      await adminPatch(code, `/tournaments/${id}`, { name: editName });
      toast({ title: "Tournament updated" });
      setEditId(null);
      await load();
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    }
  };

  const forceEnd = async (id: string, name: string) => {
    if (!confirm(`Force-complete "${name}"?`)) return;
    try {
      await adminPatch(code, `/tournaments/${id}`, { status: "completed" });
      toast({ title: "Tournament completed" });
      await load();
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    }
  };

  const deleteTournament = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}" and ALL its players and matches? This cannot be undone.`)) return;
    try {
      await adminDelete(code, `/tournaments/${id}`);
      toast({ title: "Tournament deleted" });
      await load();
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    }
  };

  if (loading) return <p className="text-muted-foreground p-4">Loading tournaments…</p>;

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search tournaments…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      <div className="space-y-2">
        {filtered.map((t) => (
          <div key={t.id} className="bg-card border border-border/50 rounded-xl p-4 space-y-2">
            {editId === t.id ? (
              <div className="flex gap-2">
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="flex-1" />
                <Button size="sm" onClick={() => saveName(t.id)}><Check className="w-3 h-3" /></Button>
                <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>✕</Button>
              </div>
            ) : (
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold truncate">{t.name}</p>
                    <span className={`text-xs font-bold uppercase ${STATUS_COLORS[t.status] ?? ""}`}>{t.status}</span>
                  </div>
                  <p className="text-xs text-muted-foreground font-mono">{t.id}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t.playerCount} players · {t.matchCount} matches · Created {new Date(t.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" variant="ghost" onClick={() => { setEditId(t.id); setEditName(t.name); }}><Pencil className="w-3 h-3" /></Button>
                  {t.status === "active" && (
                    <Button size="sm" variant="ghost" className="text-yellow-400" onClick={() => forceEnd(t.id, t.name)}>
                      <Flag className="w-3 h-3" />
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="text-red-400" onClick={() => deleteTournament(t.id, t.name)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && <p className="text-muted-foreground text-sm py-4 text-center">No tournaments found.</p>}
      </div>
    </div>
  );
}
