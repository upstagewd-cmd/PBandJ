import { useState, useEffect } from "react";
import { adminGet, adminPatch, adminDelete } from "./useAdmin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Pencil, Trash2, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface BracketMatch {
  match: {
    id: string; tournamentId: string; round: number; bracket: string;
    playerOneId: string | null; playerTwoId: string | null; winnerId: string | null;
    scoreOne: number | null; scoreTwo: number | null; status: string; completedAt: string | null;
  };
  tournament: { id: string; name: string } | null;
}

interface OpenMatch {
  match: {
    id: string; tournamentId: string; winnerTeam: number;
    scoreOne: number | null; scoreTwo: number | null; playedAt: string;
  };
  tournament: { id: string; name: string } | null;
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    + " · "
    + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function MatchesTab({ code }: { code: string }) {
  const { toast } = useToast();
  const [bracket, setBracket] = useState<BracketMatch[]>([]);
  const [openPlay, setOpenPlay] = useState<OpenMatch[]>([]);
  const [tab, setTab] = useState<"bracket" | "open">("bracket");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Record<string, unknown>>({});

  const load = async () => {
    try {
      const data = await adminGet<{ bracket: BracketMatch[]; openPlay: OpenMatch[] }>(code, "/matches");
      setBracket(data.bracket);
      setOpenPlay(data.openPlay);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filteredBracket = bracket.filter((b) =>
    (b.tournament?.name ?? "").toLowerCase().includes(search.toLowerCase()) ||
    b.match.bracket.includes(search.toLowerCase()),
  );
  const filteredOpen = openPlay.filter((m) =>
    (m.tournament?.name ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  const saveBracket = async (id: string) => {
    try {
      await adminPatch(code, `/matches/${id}`, editForm);
      toast({ title: "Match updated" });
      setEditId(null);
      await load();
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    }
  };

  const saveOpen = async (id: string) => {
    try {
      await adminPatch(code, `/matches/open-play/${id}`, editForm);
      toast({ title: "Match updated" });
      setEditId(null);
      await load();
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    }
  };

  const [pendingDelete, setPendingDelete] = useState<{ id: string; type: "bracket" | "open_play" } | null>(null);

  const deleteMatch = (id: string, type: "bracket" | "open_play") => {
    setPendingDelete({ id, type });
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await adminDelete(code, `/matches/${pendingDelete.id}?type=${pendingDelete.type}`);
      toast({ title: "Match deleted" });
      await load();
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    }
    setPendingDelete(null);
  };

  if (loading) return <p className="text-muted-foreground p-4">Loading matches…</p>;

  const bracketLabel: Record<string, string> = {
    winner: "WB", loser: "LB", grand_finals: "GF", grand_finals_reset: "GF Reset",
  };

  return (
    <div className="space-y-4">
      {pendingDelete && (
        <div className="bg-red-500/10 border border-red-500/40 rounded-xl p-4 space-y-3">
          <p className="text-sm font-bold text-red-400">Delete this match? This cannot be undone.</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={confirmDelete} variant="destructive">Delete</Button>
            <Button size="sm" variant="ghost" onClick={() => setPendingDelete(null)}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search by tournament…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      <div className="flex gap-2">
        {(["bracket", "open"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            {t === "bracket" ? `Bracket (${bracket.length})` : `Open Play (${openPlay.length})`}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {tab === "bracket" && filteredBracket.map(({ match: m, tournament: t }) => (
          <div key={m.id} className="bg-card border border-border/50 rounded-xl p-3">
            {editId === m.id ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">{t?.name} · {bracketLabel[m.bracket] ?? m.bracket} R{m.round}</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground">Score 1</label>
                    <Input type="number" value={String(editForm.scoreOne ?? "")} onChange={(e) => setEditForm((f) => ({ ...f, scoreOne: e.target.value === "" ? null : Number(e.target.value) }))} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Score 2</label>
                    <Input type="number" value={String(editForm.scoreTwo ?? "")} onChange={(e) => setEditForm((f) => ({ ...f, scoreTwo: e.target.value === "" ? null : Number(e.target.value) }))} />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Winner ID</label>
                  <Input value={String(editForm.winnerId ?? "")} onChange={(e) => setEditForm((f) => ({ ...f, winnerId: e.target.value || null }))} placeholder="Player ID" />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => saveBracket(m.id)}><Check className="w-3 h-3 mr-1" />Save</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-primary">{t?.name}</p>
                  <p className="text-sm font-bold">{bracketLabel[m.bracket] ?? m.bracket} · Round {m.round}</p>
                  <p className="text-xs text-muted-foreground">
                    {m.scoreOne !== null ? `${m.scoreOne}–${m.scoreTwo}` : "No score"}
                    {m.winnerId ? " · Has winner" : ""}
                  </p>
                  <p className="text-xs text-muted-foreground/60 mt-0.5">
                    {m.completedAt
                      ? `Completed ${fmtDateTime(m.completedAt)}`
                      : `Status: ${m.status}`}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => { setEditId(m.id); setEditForm({ scoreOne: m.scoreOne, scoreTwo: m.scoreTwo, winnerId: m.winnerId }); }}>
                    <Pencil className="w-3 h-3" />
                  </Button>
                  <Button size="sm" variant="ghost" className="text-red-400" onClick={() => deleteMatch(m.id, "bracket")}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}

        {tab === "open" && filteredOpen.map(({ match: m, tournament: t }) => (
          <div key={m.id} className="bg-card border border-border/50 rounded-xl p-3">
            {editId === m.id ? (
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground">Winner Team</label>
                    <Input type="number" min={1} max={2} value={String(editForm.winnerTeam ?? m.winnerTeam)} onChange={(e) => setEditForm((f) => ({ ...f, winnerTeam: Number(e.target.value) }))} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Score 1</label>
                    <Input type="number" value={String(editForm.scoreOne ?? "")} onChange={(e) => setEditForm((f) => ({ ...f, scoreOne: e.target.value === "" ? null : Number(e.target.value) }))} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Score 2</label>
                    <Input type="number" value={String(editForm.scoreTwo ?? "")} onChange={(e) => setEditForm((f) => ({ ...f, scoreTwo: e.target.value === "" ? null : Number(e.target.value) }))} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => saveOpen(m.id)}><Check className="w-3 h-3 mr-1" />Save</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <p className="text-xs font-bold text-primary">{t?.name}</p>
                  <p className="text-sm font-bold">Open Play · Team {m.winnerTeam} won</p>
                  <p className="text-xs text-muted-foreground">
                    {m.scoreOne !== null ? `${m.scoreOne}–${m.scoreTwo}` : "No score"}
                  </p>
                  <p className="text-xs text-muted-foreground/60 mt-0.5">{fmtDateTime(m.playedAt)}</p>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => { setEditId(m.id); setEditForm({ winnerTeam: m.winnerTeam, scoreOne: m.scoreOne, scoreTwo: m.scoreTwo }); }}>
                    <Pencil className="w-3 h-3" />
                  </Button>
                  <Button size="sm" variant="ghost" className="text-red-400" onClick={() => deleteMatch(m.id, "open_play")}>
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
