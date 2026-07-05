import { useState, useEffect } from "react";
import { adminGet, adminPatch, adminDelete, adminPost } from "./useAdmin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Pencil, Trash2, GitMerge, X, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Player {
  id: string;
  firstName: string;
  lastName: string;
  partnerName: string | null;
  teamName: string | null;
  eloRating: number;
  avatarUrl: string | null;
  clerkUserId: string | null;
  tournamentId: string;
  rank: { title: string; emoji: string };
}

export function PlayersTab({ code }: { code: string }) {
  const { toast } = useToast();
  const [players, setPlayers] = useState<Player[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Player>>({});
  const [mergeMode, setMergeMode] = useState(false);
  const [mergeA, setMergeA] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const data = await adminGet<Player[]>(code, "/players");
      setPlayers(data);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = players.filter((p) => {
    const q = search.toLowerCase();
    return (
      p.firstName.toLowerCase().includes(q) ||
      p.lastName.toLowerCase().includes(q) ||
      (p.teamName ?? "").toLowerCase().includes(q)
    );
  });

  const startEdit = (p: Player) => {
    setEditId(p.id);
    setEditForm({ firstName: p.firstName, lastName: p.lastName, partnerName: p.partnerName ?? "", eloRating: p.eloRating, avatarUrl: p.avatarUrl ?? "" });
  };

  const saveEdit = async () => {
    if (!editId) return;
    setSaving(true);
    try {
      await adminPatch(code, `/players/${editId}`, editForm);
      toast({ title: "Player updated" });
      setEditId(null);
      await load();
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    }
    setSaving(false);
  };

  const deletePlayer = async (id: string, name: string) => {
    if (!confirm(`Delete ${name}? This cannot be undone.`)) return;
    try {
      await adminDelete(code, `/players/${id}`);
      toast({ title: "Player deleted" });
      await load();
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    }
  };

  const handleMergeClick = (id: string) => {
    if (!mergeMode) { setMergeMode(true); setMergeA(id); return; }
    if (mergeA === id) { setMergeMode(false); setMergeA(null); return; }
    const a = players.find((p) => p.id === mergeA);
    const b = players.find((p) => p.id === id);
    if (!a || !b) return;
    if (!confirm(`Merge "${b.firstName} ${b.lastName}" INTO "${a.firstName} ${a.lastName}"?\n\nAll matches and badges from the merged player will move to the kept player, and the merged player will be deleted.`)) {
      setMergeMode(false); setMergeA(null); return;
    }
    adminPost(code, "/players/merge", { keepId: mergeA, mergeId: id })
      .then(() => { toast({ title: "Players merged" }); load(); })
      .catch((e) => toast({ title: "Error", description: String(e), variant: "destructive" }))
      .finally(() => { setMergeMode(false); setMergeA(null); });
  };

  if (loading) return <p className="text-muted-foreground p-4">Loading players…</p>;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search players…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        {mergeMode && (
          <Button variant="outline" size="sm" onClick={() => { setMergeMode(false); setMergeA(null); }}>
            <X className="w-4 h-4 mr-1" /> Cancel Merge
          </Button>
        )}
        {!mergeMode && (
          <Button variant="outline" size="sm" onClick={() => setMergeMode(true)}>
            <GitMerge className="w-4 h-4 mr-1" /> Merge
          </Button>
        )}
      </div>

      {mergeMode && (
        <p className="text-sm text-orange-400 font-medium">
          {mergeA ? "Now tap the duplicate player to merge into the selected one." : "Tap the player to KEEP."}
        </p>
      )}

      <div className="space-y-2">
        {filtered.map((p) => {
          const isEditTarget = editId === p.id;
          const isMergeA = mergeA === p.id;
          return (
            <div key={p.id} className={`bg-card border rounded-xl p-3 space-y-2 transition-colors ${isMergeA ? "border-orange-500" : "border-border/50"}`}>
              {isEditTarget ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Input placeholder="First" value={editForm.firstName ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, firstName: e.target.value }))} />
                    <Input placeholder="Last" value={editForm.lastName ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, lastName: e.target.value }))} />
                  </div>
                  <Input placeholder="Partner name" value={editForm.partnerName ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, partnerName: e.target.value }))} />
                  <div className="flex gap-2 items-center">
                    <label className="text-xs text-muted-foreground w-12 shrink-0">ELO</label>
                    <Input type="number" value={editForm.eloRating ?? 1200} onChange={(e) => setEditForm((f) => ({ ...f, eloRating: Number(e.target.value) }))} />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" onClick={saveEdit} disabled={saving}><Check className="w-3 h-3 mr-1" />Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-sm font-bold overflow-hidden shrink-0">
                    {p.avatarUrl ? <img src={p.avatarUrl} className="w-full h-full object-cover" /> : `${p.firstName[0]}${p.lastName[0]}`}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate">{p.firstName} {p.lastName}{p.partnerName ? ` + ${p.partnerName}` : ""}</p>
                    <p className="text-xs text-muted-foreground">{p.rank.emoji} {p.rank.title} · {Math.round(p.eloRating)} ELO</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {mergeMode ? (
                      <Button size="sm" variant={isMergeA ? "default" : "outline"} onClick={() => handleMergeClick(p.id)}>
                        <GitMerge className="w-3 h-3" />
                      </Button>
                    ) : (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => startEdit(p)}><Pencil className="w-3 h-3" /></Button>
                        <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300" onClick={() => deletePlayer(p.id, `${p.firstName} ${p.lastName}`)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && <p className="text-muted-foreground text-sm py-4 text-center">No players found.</p>}
      </div>
    </div>
  );
}
