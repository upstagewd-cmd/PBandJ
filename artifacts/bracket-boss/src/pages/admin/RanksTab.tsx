import { useState, useEffect } from "react";
import { adminGet, adminPatch, adminPost, adminDelete } from "./useAdmin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pencil, Trash2, Plus, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface RankTier {
  id: string; title: string; emoji: string;
  minElo: number; displayOrder: number; playerCount: number;
}

export function RanksTab({ code }: { code: string }) {
  const { toast } = useToast();
  const [ranks, setRanks] = useState<RankTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<RankTier>>({});
  const [adding, setAdding] = useState(false);
  const [newForm, setNewForm] = useState({ title: "", emoji: "🏅", minElo: 0, displayOrder: 0 });

  const load = async () => {
    try {
      const data = await adminGet<RankTier[]>(code, "/ranks");
      setRanks(data);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const saveEdit = async (id: string) => {
    try {
      await adminPatch(code, `/ranks/${id}`, editForm);
      toast({ title: "Rank updated" });
      setEditId(null);
      await load();
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    }
  };

  const addRank = async () => {
    try {
      await adminPost(code, "/ranks", newForm);
      toast({ title: "Rank added" });
      setAdding(false);
      setNewForm({ title: "", emoji: "🏅", minElo: 0, displayOrder: ranks.length });
      await load();
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    }
  };

  const [pendingDelete, setPendingDelete] = useState<{ id: string; title: string } | null>(null);

  const deleteRank = (id: string, title: string) => setPendingDelete({ id, title });

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await adminDelete(code, `/ranks/${pendingDelete.id}`);
      toast({ title: "Rank deleted" });
      await load();
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    }
    setPendingDelete(null);
  };

  if (loading) return <p className="text-muted-foreground p-4">Loading ranks…</p>;

  return (
    <div className="space-y-4">
      {pendingDelete && (
        <div className="bg-red-500/10 border border-red-500/40 rounded-xl p-4 space-y-3">
          <p className="text-sm font-bold text-red-400">Delete rank "{pendingDelete.title}"?</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={confirmDelete} variant="destructive">Delete</Button>
            <Button size="sm" variant="ghost" onClick={() => setPendingDelete(null)}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{ranks.length} rank tiers · tap ELO to edit</p>
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          <Plus className="w-3 h-3 mr-1" /> Add Rank
        </Button>
      </div>

      {adding && (
        <div className="bg-card border border-primary/40 rounded-xl p-3 space-y-2">
          <p className="text-sm font-bold text-primary">New Rank Tier</p>
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Title" value={newForm.title} onChange={(e) => setNewForm((f) => ({ ...f, title: e.target.value }))} />
            <Input placeholder="Emoji" value={newForm.emoji} onChange={(e) => setNewForm((f) => ({ ...f, emoji: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">Min ELO</label>
              <Input type="number" value={newForm.minElo} onChange={(e) => setNewForm((f) => ({ ...f, minElo: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Display Order</label>
              <Input type="number" value={newForm.displayOrder} onChange={(e) => setNewForm((f) => ({ ...f, displayOrder: Number(e.target.value) }))} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={addRank}><Check className="w-3 h-3 mr-1" />Add</Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {ranks.map((r) => (
          <div key={r.id} className="bg-card border border-border/50 rounded-xl p-3">
            {editId === r.id ? (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="Title" value={editForm.title ?? r.title} onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))} />
                  <Input placeholder="Emoji" value={editForm.emoji ?? r.emoji} onChange={(e) => setEditForm((f) => ({ ...f, emoji: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground">Min ELO</label>
                    <Input type="number" value={editForm.minElo ?? r.minElo} onChange={(e) => setEditForm((f) => ({ ...f, minElo: Number(e.target.value) }))} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Display Order</label>
                    <Input type="number" value={editForm.displayOrder ?? r.displayOrder} onChange={(e) => setEditForm((f) => ({ ...f, displayOrder: Number(e.target.value) }))} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => saveEdit(r.id)}><Check className="w-3 h-3 mr-1" />Save</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-2xl">{r.emoji}</span>
                <div className="flex-1">
                  <p className="font-bold">{r.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-sm font-bold text-primary">{r.minElo}+ pts</span>
                    <span className="text-xs text-muted-foreground">· {r.playerCount} player{r.playerCount !== 1 ? "s" : ""}</span>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => { setEditId(r.id); setEditForm({}); }}>
                    <Pencil className="w-3 h-3" />
                  </Button>
                  <Button size="sm" variant="ghost" className="text-red-400" onClick={() => deleteRank(r.id, r.title)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
