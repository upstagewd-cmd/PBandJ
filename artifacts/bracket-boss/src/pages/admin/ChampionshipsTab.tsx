import { useEffect, useState } from "react";
import { adminDelete, adminGet, adminPatch, adminPost } from "./useAdmin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Championship = {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  enabled: boolean;
  currentPlayer1Id: string | null;
  currentPlayer2Id: string | null;
  lineage: Array<{ eventType: string; tournamentId: string | null }>;
};

export function ChampionshipsTab({ code }: { code: string }) {
  const { toast } = useToast();
  const [items, setItems] = useState<Championship[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", description: "" });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [transferIds, setTransferIds] = useState<Record<string, { player1Id: string; player2Id: string }>>({});

  const load = async () => {
    try { setItems(await adminGet<Championship[]>(code, "/championships")); } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const create = async () => {
    if (!imageFile) return;
    setUploading(true);
    try {
      const upload = await fetch("/api/storage/championships", {
        method: "POST",
        headers: { "Content-Type": "image/png", "x-admin-code": code },
        body: imageFile,
      });
      const uploadBody = await upload.json().catch(() => ({} as { objectPath?: string; error?: string }));
      if (!upload.ok || !uploadBody.objectPath) throw new Error(uploadBody.error || "Artwork upload failed");
      await adminPost(code, "/championships", { ...form, imageUrl: `/api/storage${uploadBody.objectPath}` });
      setForm({ name: "", description: "" });
      setImageFile(null);
      setAdding(false);
      toast({ title: "Championship created" });
      await load();
    } catch (error) { toast({ title: "Couldn't create championship", description: String(error), variant: "destructive" }); }
    finally { setUploading(false); }
  };

  const toggle = async (item: Championship) => {
    try { await adminPatch(code, `/championships/${item.id}`, { enabled: !item.enabled }); await load(); }
    catch (error) { toast({ title: "Couldn't update championship", description: String(error), variant: "destructive" }); }
  };

  const remove = async (item: Championship) => {
    if (!window.confirm(`Delete ${item.name}?`)) return;
    try { await adminDelete(code, `/championships/${item.id}`); await load(); }
    catch (error) { toast({ title: "Couldn't delete championship", description: String(error), variant: "destructive" }); }
  };

  const transfer = async (item: Championship) => {
    const ids = transferIds[item.id];
    if (!ids?.player1Id || !ids.player2Id) return;
    try { await adminPost(code, `/championships/${item.id}/transfer`, ids); toast({ title: "Championship transferred" }); await load(); }
    catch (error) { toast({ title: "Couldn't transfer championship", description: String(error), variant: "destructive" }); }
  };

  const revoke = async (item: Championship) => {
    try { await adminPost(code, `/championships/${item.id}/revoke`, {}); toast({ title: "Championship revoked" }); await load(); }
    catch (error) { toast({ title: "Couldn't revoke championship", description: String(error), variant: "destructive" }); }
  };

  if (loading) return <p className="p-4 text-muted-foreground">Loading championships...</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{items.length} championships defined</p>
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}><Plus className="mr-1 h-3 w-3" /> New Championship</Button>
      </div>
      {adding && (
        <div className="space-y-2 rounded-xl border border-primary/40 bg-card p-3">
          <Input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <Input type="file" accept="image/png" onChange={(e) => setImageFile(e.target.files?.[0] ?? null)} />
          <p className="text-xs text-muted-foreground">PNG only, maximum 6 MB and 1600x1200 pixels.</p>
          <div className="flex gap-2"><Button size="sm" onClick={create} disabled={!form.name || !imageFile || uploading}>{uploading ? "Uploading..." : "Create"}</Button><Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button></div>
        </div>
      )}
      {items.map((item) => {
        const ids = transferIds[item.id] ?? { player1Id: "", player2Id: "" };
        return (
          <div key={item.id} className="space-y-3 rounded-xl border border-border/50 bg-card p-4">
            <div className="flex items-start gap-3">
              <img src={item.imageUrl} alt="" className="h-16 w-24 rounded-lg bg-background object-contain p-1" />
              <div className="min-w-0 flex-1"><p className="font-bold">{item.name}</p><p className="text-xs text-muted-foreground">{item.description}</p><p className="text-xs text-muted-foreground">{item.currentPlayer1Id ? `Holder: ${item.currentPlayer1Id} + ${item.currentPlayer2Id}` : "Unclaimed"}</p></div>
              <button title={item.enabled ? "Disable" : "Enable"} onClick={() => toggle(item)}>{item.enabled ? <ToggleRight className="text-primary" /> : <ToggleLeft className="text-muted-foreground" />}</button>
              <button title="Delete" onClick={() => remove(item)}><Trash2 className="h-4 w-4 text-red-400" /></button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2"><Input placeholder="Holder player 1 ID" value={ids.player1Id} onChange={(e) => setTransferIds({ ...transferIds, [item.id]: { ...ids, player1Id: e.target.value } })} /><Input placeholder="Holder player 2 ID" value={ids.player2Id} onChange={(e) => setTransferIds({ ...transferIds, [item.id]: { ...ids, player2Id: e.target.value } })} /></div>
            <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => transfer(item)}>Transfer</Button><Button size="sm" variant="ghost" onClick={() => revoke(item)} disabled={!item.currentPlayer1Id}>Revoke holder</Button><span className="ml-auto text-xs text-muted-foreground">{item.lineage.length} history events</span></div>
          </div>
        );
      })}
    </div>
  );
}