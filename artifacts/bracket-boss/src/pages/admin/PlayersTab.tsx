import { useState, useEffect, useRef } from "react";
import { adminGet, adminPatch, adminDelete, adminPost } from "./useAdmin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Pencil, Trash2, GitMerge, X, Check, Camera, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PlayerAvatar } from "@/components/ui/player-avatar";

const SKILL_LEVELS = [
  { value: "beginner", label: "Beginner", emoji: "🟢" },
  { value: "intermediate", label: "Intermediate", emoji: "🔵" },
  { value: "advanced", label: "Advanced", emoji: "🔴" },
] as const;

interface Player {
  id: string;
  firstName: string;
  lastName: string;
  partnerName: string | null;
  teamName: string | null;
  eloRating: number;
  skillLevel: string | null;
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
  const [pendingMerge, setPendingMerge] = useState<{ keepId: string; mergeId: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const contentType = file.type || "application/octet-stream";
      let objectPath: string | null = null;

      try {
        const urlRes = await fetch("/api/storage/uploads/request-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: file.name, size: file.size, contentType }),
        });
        if (!urlRes.ok) {
          const body = await urlRes.text();
          throw new Error(body || "Failed to get upload URL");
        }
        const signed = await urlRes.json() as { uploadURL: string; objectPath: string };
        const uploadRes = await fetch(signed.uploadURL, { method: "PUT", body: file });
        if (!uploadRes.ok) {
          const body = await uploadRes.text();
          throw new Error(body || "Upload failed");
        }
        objectPath = signed.objectPath;
      } catch {
        const fallbackRes = await fetch(
          `/api/storage/uploads/direct?name=${encodeURIComponent(file.name)}&contentType=${encodeURIComponent(contentType)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/octet-stream" },
            body: file,
          }
        );
        if (!fallbackRes.ok) {
          const body = await fallbackRes.text();
          throw new Error(body || "Fallback upload failed");
        }
        const fallback = await fallbackRes.json() as { objectPath: string };
        objectPath = fallback.objectPath;
      }

      if (!objectPath) throw new Error("Missing uploaded object path");
      setEditForm((f) => ({ ...f, avatarUrl: objectPath }));
    } catch (err) {
      toast({
        title: "Avatar upload failed",
        description: err instanceof Error ? err.message : "Could not upload image",
        variant: "destructive",
      });
    } finally {
      setUploadingAvatar(false);
      e.target.value = "";
    }
  };

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
    setEditForm({
      firstName: p.firstName,
      lastName: p.lastName,
      teamName: p.teamName ?? "",
      eloRating: p.eloRating,
      skillLevel: p.skillLevel ?? "",
      avatarUrl: p.avatarUrl ?? "",
    });
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

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await adminDelete(code, `/players/${pendingDelete.id}`);
      toast({ title: "Player deleted" });
      await load();
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    }
    setPendingDelete(null);
  };

  const handleMergeClick = (id: string) => {
    if (!mergeMode) { setMergeMode(true); setMergeA(id); return; }
    if (!mergeA) { setMergeA(id); return; }
    if (mergeA === id) { setMergeMode(false); setMergeA(null); return; }
    const a = players.find((p) => p.id === mergeA);
    const b = players.find((p) => p.id === id);
    if (!a || !b) return;
    setPendingMerge({ keepId: mergeA!, mergeId: id });
    setMergeMode(false);
    setMergeA(null);
  };

  const confirmMerge = async () => {
    if (!pendingMerge) return;
    try {
      await adminPost(code, "/players/merge", pendingMerge);
      toast({ title: "Players merged" });
      await load();
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    }
    setPendingMerge(null);
  };

  const skillLabel = (level: string | null) => {
    const found = SKILL_LEVELS.find((s) => s.value === level);
    return found ? `${found.emoji} ${found.label}` : "—";
  };

  const cancelAll = () => {
    setMergeMode(false);
    setMergeA(null);
    setPendingMerge(null);
    setPendingDelete(null);
  };

  const startMergeMode = () => {
    setEditId(null);
    setPendingDelete(null);
    setPendingMerge(null);
    setMergeA(null);
    setMergeMode(true);
  };

  if (loading) return <p className="text-muted-foreground p-4">Loading players…</p>;

  const keepPlayer = pendingMerge ? players.find((p) => p.id === pendingMerge.keepId) : null;
  const mergePlayer = pendingMerge ? players.find((p) => p.id === pendingMerge.mergeId) : null;

  return (
    <div className="space-y-4">
      {/* Inline merge confirmation */}
      {pendingMerge && keepPlayer && mergePlayer && (
        <div className="bg-primary/10 border border-primary/40 rounded-xl p-4 space-y-3">
          <p className="text-sm font-bold text-primary">Confirm Merge</p>
          <p className="text-sm text-muted-foreground">
            Merge <span className="font-bold text-foreground">{mergePlayer.firstName} {mergePlayer.lastName}</span> into{" "}
            <span className="font-bold text-foreground">{keepPlayer.firstName} {keepPlayer.lastName}</span>?
            All matches and badges will transfer. The merged player will be deleted.
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={confirmMerge} className="bg-primary hover:bg-primary/90 text-primary-foreground">
              <Check className="w-3 h-3 mr-1" /> Confirm Merge
            </Button>
            <Button size="sm" variant="ghost" onClick={cancelAll}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Inline delete confirmation */}
      {pendingDelete && (
        <div className="bg-red-500/10 border border-red-500/40 rounded-xl p-4 space-y-3">
          <p className="text-sm font-bold text-red-400">Delete Player</p>
          <p className="text-sm text-muted-foreground">
            Delete <span className="font-bold text-foreground">{pendingDelete.name}</span>? This cannot be undone.
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={confirmDelete} variant="destructive">
              <Trash2 className="w-3 h-3 mr-1" /> Delete
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPendingDelete(null)}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search players…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        {mergeMode ? (
          <Button variant="outline" size="sm" onClick={cancelAll}>
            <X className="w-4 h-4 mr-1" /> Cancel
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={startMergeMode}>
            <GitMerge className="w-4 h-4 mr-1" /> Merge
          </Button>
        )}
      </div>

      {mergeMode && (
        <div className="rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 space-y-2">
          <p className="text-sm font-bold text-primary flex items-center gap-2">
            <GitMerge className="w-4 h-4" /> Merge mode active
          </p>
          <p className="text-sm text-muted-foreground">
            {mergeA
              ? "First player selected. Tap a second player to merge into the first, then confirm."
              : "Tap the player you want to keep first, then tap the player you want to merge into them."}
          </p>
        </div>
      )}

      <div className="space-y-2">
        {filtered.map((p) => {
          const isEditTarget = editId === p.id;
          const isMergeA = mergeA === p.id;
          const isMergeTarget = mergeMode && !isMergeA;
          return (
            <div
              key={p.id}
              className={`relative bg-card border rounded-xl p-3 space-y-2 transition-all ${
                isMergeA
                  ? "border-primary ring-2 ring-primary/20"
                  : isMergeTarget
                    ? "border-primary/20 hover:border-primary/40"
                    : "border-border/50"
              } ${mergeMode ? "cursor-pointer hover:shadow-sm" : ""}`}
            >
              {mergeMode && !isEditTarget && (
                <button
                  type="button"
                  className="absolute inset-0 z-10 rounded-xl"
                  onClick={() => handleMergeClick(p.id)}
                  aria-label={`Select ${p.firstName} ${p.lastName} for merge`}
                />
              )}
              {isEditTarget ? (
                <div className="space-y-2">
                  {/* Avatar picker */}
                  <div className="flex items-center gap-3">
                    <div className="relative shrink-0">
                      <PlayerAvatar
                        player={{ firstName: editForm.firstName ?? p.firstName, lastName: editForm.lastName ?? p.lastName, avatarUrl: editForm.avatarUrl ?? null }}
                        size="lg"
                      />
                      <button
                        type="button"
                        onClick={() => avatarInputRef.current?.click()}
                        disabled={uploadingAvatar}
                        className="absolute inset-0 rounded-full flex items-center justify-center bg-black/50 opacity-0 hover:opacity-100 transition-opacity"
                      >
                        {uploadingAvatar
                          ? <Loader2 className="w-5 h-5 text-primary-foreground animate-spin" />
                          : <Camera className="w-5 h-5 text-primary-foreground" />}
                      </button>
                      <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                    </div>
                    <div className="flex-1 space-y-1">
                      <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest">Photo</p>
                      <div className="flex gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => avatarInputRef.current?.click()} disabled={uploadingAvatar}>
                          {uploadingAvatar ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Camera className="w-3 h-3 mr-1" />}
                          {editForm.avatarUrl ? "Replace" : "Upload"}
                        </Button>
                        {editForm.avatarUrl && (
                          <Button type="button" size="sm" variant="ghost" className="text-red-400 hover:text-red-300" onClick={() => setEditForm((f) => ({ ...f, avatarUrl: "" }))}>
                            Remove
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input placeholder="First" value={editForm.firstName ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, firstName: e.target.value }))} />
                    <Input placeholder="Last" value={editForm.lastName ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, lastName: e.target.value }))} />
                  </div>
                  <Input placeholder="Nickname" value={editForm.teamName ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, teamName: e.target.value }))} />
                  <div className="flex gap-2 items-center">
                    <label className="text-xs text-muted-foreground w-12 shrink-0">ELO</label>
                    <Input type="number" value={editForm.eloRating ?? 1200} onChange={(e) => setEditForm((f) => ({ ...f, eloRating: Number(e.target.value) }))} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground font-bold uppercase tracking-widest">Skill Level</label>
                    <div className="flex gap-2">
                      {SKILL_LEVELS.map((s) => (
                        <button
                          key={s.value}
                          type="button"
                          onClick={() => setEditForm((f) => ({ ...f, skillLevel: s.value }))}
                          className={`flex-1 flex flex-col items-center gap-0.5 rounded-lg p-2 border-2 text-xs font-bold transition-all ${
                            editForm.skillLevel === s.value
                              ? "border-primary bg-primary/10"
                              : "border-border/50 bg-muted/30 hover:border-border"
                          }`}
                        >
                          <span>{s.emoji}</span>
                          <span>{s.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" onClick={saveEdit} disabled={saving}><Check className="w-3 h-3 mr-1" />Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <PlayerAvatar player={p} size="md" className="rounded-xl" />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate">{p.firstName} {p.lastName}{p.partnerName ? ` + ${p.partnerName}` : ""}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.rank.emoji} {p.rank.title} · {Math.round(p.eloRating)} ELO · {skillLabel(p.skillLevel)}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {mergeMode ? (
                      <Button
                        type="button"
                        size="sm"
                        variant={isMergeA ? "default" : "outline"}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMergeClick(p.id);
                        }}
                        className={`relative z-20 min-w-16 ${isMergeA ? "shadow-md shadow-primary/20" : ""}`}
                      >
                        {isMergeA ? "Keep" : "Select"}
                      </Button>
                    ) : (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => startEdit(p)}><Pencil className="w-3 h-3" /></Button>
                        <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300" onClick={() => setPendingDelete({ id: p.id, name: `${p.firstName} ${p.lastName}` })}>
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
