import { useState, useEffect } from "react";
import { adminGet, adminPatch, adminPost, adminDelete } from "./useAdmin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KnownPlayerPicker } from "@/components/ui/known-player-picker";
import { Pencil, Trash2, Plus, Check, ToggleLeft, ToggleRight, UserPlus, UserMinus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Grant { grant: { id: string; playerId: string; grantedBy: string }; player: { id: string; firstName: string; lastName: string } | null }
interface Badge {
  id: string; name: string; description: string; ruleType: string;
  threshold: number; icon: string; enabled: boolean; grants: Grant[];
}

const RULE_TYPES = ["wins", "matches", "tournaments", "streaks", "partners"];

export function BadgesTab({ code }: { code: string }) {
  const { toast } = useToast();
  const [badges, setBadges] = useState<Badge[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Badge>>({});
  const [adding, setAdding] = useState(false);
  const [newForm, setNewForm] = useState({ name: "", description: "", ruleType: "wins", threshold: 1, icon: "🏅", enabled: true });
  const [grantPlayerId, setGrantPlayerId] = useState<Record<string, string>>({});
  const [grantPlayerSelection, setGrantPlayerSelection] = useState<Record<string, { id: string; firstName: string; lastName: string } | null>>({});

  const load = async () => {
    try {
      const data = await adminGet<Badge[]>(code, "/badges");
      setBadges(data);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const toggle = async (b: Badge) => {
    try {
      await adminPatch(code, `/badges/${b.id}`, { enabled: !b.enabled });
      await load();
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    }
  };

  const saveEdit = async (id: string) => {
    try {
      await adminPatch(code, `/badges/${id}`, editForm);
      toast({ title: "Badge updated" });
      setEditId(null);
      await load();
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    }
  };

  const addBadge = async () => {
    try {
      await adminPost(code, "/badges", newForm);
      toast({ title: "Badge created" });
      setAdding(false);
      setNewForm({ name: "", description: "", ruleType: "wins", threshold: 1, icon: "🏅", enabled: true });
      await load();
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    }
  };

  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);

  const deleteBadge = (id: string, name: string) => setPendingDelete({ id, name });

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await adminDelete(code, `/badges/${pendingDelete.id}`);
      toast({ title: "Badge deleted" });
      await load();
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    }
    setPendingDelete(null);
  };

  const selectGrantPlayer = (badgeId: string, player: { id: string; firstName: string; lastName: string }) => {
    setGrantPlayerId((prev) => ({ ...prev, [badgeId]: player.id }));
    setGrantPlayerSelection((prev) => ({ ...prev, [badgeId]: player }));
  };

  const grantBadge = async (badgeId: string) => {
    const playerId = grantPlayerId[badgeId]?.trim();
    if (!playerId) return;
    try {
      await adminPost(code, `/badges/${badgeId}/grants`, { playerId });
      toast({ title: "Badge granted" });
      setGrantPlayerId((prev) => ({ ...prev, [badgeId]: "" }));
      setGrantPlayerSelection((prev) => ({ ...prev, [badgeId]: null }));
      await load();
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    }
  };

  const revokeBadge = async (badgeId: string, playerId: string) => {
    try {
      await adminDelete(code, `/badges/${badgeId}/grants/${playerId}`);
      toast({ title: "Badge revoked" });
      await load();
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    }
  };

  if (loading) return <p className="text-muted-foreground p-4">Loading badges…</p>;

  return (
    <div className="space-y-4">
      {pendingDelete && (
        <div className="bg-red-500/10 border border-red-500/40 rounded-xl p-4 space-y-3">
          <p className="text-sm font-bold text-red-400">Delete badge "{pendingDelete.name}"?</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={confirmDelete} variant="destructive">Delete</Button>
            <Button size="sm" variant="ghost" onClick={() => setPendingDelete(null)}>Cancel</Button>
          </div>
        </div>
      )}
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{badges.length} badges defined</p>
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          <Plus className="w-3 h-3 mr-1" /> New Badge
        </Button>
      </div>

      {adding && (
        <div className="bg-card border border-primary/40 rounded-xl p-3 space-y-2">
          <p className="text-sm font-bold text-primary">New Badge</p>
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Name" value={newForm.name} onChange={(e) => setNewForm((f) => ({ ...f, name: e.target.value }))} />
            <Input placeholder="Icon emoji" value={newForm.icon} onChange={(e) => setNewForm((f) => ({ ...f, icon: e.target.value }))} />
          </div>
          <Input placeholder="Description" value={newForm.description} onChange={(e) => setNewForm((f) => ({ ...f, description: e.target.value }))} />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">Rule Type</label>
              <select className="w-full bg-input border border-border rounded-md px-2 py-1.5 text-sm text-foreground" value={newForm.ruleType} onChange={(e) => setNewForm((f) => ({ ...f, ruleType: e.target.value }))}>
                {RULE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Threshold</label>
              <Input type="number" value={newForm.threshold} onChange={(e) => setNewForm((f) => ({ ...f, threshold: Number(e.target.value) }))} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={addBadge}><Check className="w-3 h-3 mr-1" />Create</Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {badges.map((b) => (
          <div key={b.id} className={`bg-card border rounded-xl p-3 space-y-2 ${b.enabled ? "border-border/50" : "border-border/20 opacity-60"}`}>
            {editId === b.id ? (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="Name" value={editForm.name ?? b.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
                  <Input placeholder="Icon" value={editForm.icon ?? b.icon} onChange={(e) => setEditForm((f) => ({ ...f, icon: e.target.value }))} />
                </div>
                <Input placeholder="Description" value={editForm.description ?? b.description} onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))} />
                <div className="grid grid-cols-2 gap-2">
                  <select className="w-full bg-input border border-border rounded-md px-2 py-1.5 text-sm text-foreground" value={editForm.ruleType ?? b.ruleType} onChange={(e) => setEditForm((f) => ({ ...f, ruleType: e.target.value }))}>
                    {RULE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <Input type="number" value={editForm.threshold ?? b.threshold} onChange={(e) => setEditForm((f) => ({ ...f, threshold: Number(e.target.value) }))} />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => saveEdit(b.id)}><Check className="w-3 h-3 mr-1" />Save</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{b.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold">{b.name}</p>
                    {b.description && <p className="text-sm text-foreground/80 mt-0.5">{b.description}</p>}
                    <p className="text-xs text-muted-foreground mt-1">Rule: {b.ruleType} ≥ {b.threshold} · {b.grants.length} granted</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => toggle(b)} className="text-muted-foreground hover:text-foreground">
                      {b.enabled ? <ToggleRight className="w-5 h-5 text-green-400" /> : <ToggleLeft className="w-5 h-5" />}
                    </button>
                    <Button size="sm" variant="ghost" onClick={() => { setEditId(b.id); setEditForm({}); }}>
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button size="sm" variant="ghost" className="text-red-400" onClick={() => deleteBadge(b.id, b.name)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
                {b.grants.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {b.grants.map((g) => (
                      <span key={g.grant.id} className="flex items-center gap-1 bg-primary/10 text-primary text-xs font-bold px-2 py-0.5 rounded-full">
                        {g.player ? `${g.player.firstName} ${g.player.lastName}` : g.grant.playerId}
                        <button onClick={() => revokeBadge(b.id, g.grant.playerId)} className="text-red-400 hover:text-red-300">
                          <UserMinus className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="space-y-2 pt-1">
                  <KnownPlayerPicker onSelect={(player) => selectGrantPlayer(b.id, player)} />
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-muted-foreground flex-1">
                      {grantPlayerSelection[b.id]
                        ? `Selected: ${grantPlayerSelection[b.id]?.firstName} ${grantPlayerSelection[b.id]?.lastName}`
                        : "Choose a player to grant this badge to."}
                    </p>
                    <Button size="sm" className="h-7 px-2" onClick={() => grantBadge(b.id)} disabled={!grantPlayerId[b.id]}>
                      <UserPlus className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        ))}
        {badges.length === 0 && <p className="text-muted-foreground text-sm py-4 text-center">No badges yet. Create your first one!</p>}
      </div>
    </div>
  );
}
