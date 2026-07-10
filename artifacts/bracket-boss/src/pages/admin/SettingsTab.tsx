import { useState, useEffect } from "react";
import { adminGet, adminPatch } from "./useAdmin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const SETTING_LABELS: Record<string, { label: string; description: string; type: "number" | "boolean" }> = {
  elo_k_factor:         { label: "ELO K-Factor", description: "Controls how much each match shifts ratings (default 32)", type: "number" },
  elo_initial:          { label: "Initial ELO", description: "Starting rating for all new players (default 1200)", type: "number" },
  elo_minimum:          { label: "Minimum ELO", description: "Lowest a rating can fall to (default 800)", type: "number" },
  skill_beginner:       { label: "Beginner Seed ELO", description: "Starting ELO when skill level is Beginner", type: "number" },
  skill_intermediate:   { label: "Intermediate Seed ELO", description: "Starting ELO when skill level is Intermediate", type: "number" },
  skill_advanced:       { label: "Advanced Seed ELO", description: "Starting ELO when skill level is Advanced", type: "number" },
  badge_system_enabled: { label: "Badge System", description: "Enable or disable the badge system entirely", type: "boolean" },
  rank_system_enabled:  { label: "Rank System", description: "Enable or disable rank display throughout the app", type: "boolean" },
};

export function SettingsTab({ code }: { code: string }) {
  const { toast } = useToast();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [local, setLocal] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const data = await adminGet<Record<string, string>>(code, "/settings");
      setSettings(data);
      setLocal(data);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      const changed: Record<string, string> = {};
      for (const [k, v] of Object.entries(local)) {
        if (v !== settings[k]) changed[k] = v;
      }
      if (Object.keys(changed).length === 0) {
        toast({ title: "No changes to save" });
        setSaving(false);
        return;
      }
      await adminPatch(code, "/settings", changed);
      toast({ title: "Settings saved" });
      await load();
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    }
    setSaving(false);
  };

  if (loading) return <p className="text-muted-foreground p-4">Loading settings…</p>;

  const hasChanges = Object.entries(local).some(([k, v]) => v !== settings[k]);

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {Object.entries(SETTING_LABELS).map(([key, meta]) => (
          <div key={key} className="bg-card border border-border/50 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <p className="font-bold text-sm">{meta.label}</p>
                <p className="text-xs text-muted-foreground">{meta.description}</p>
              </div>
              {meta.type === "boolean" ? (
                <button
                  onClick={() => setLocal((l) => ({ ...l, [key]: l[key] === "true" ? "false" : "true" }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${local[key] === "true" ? "bg-primary" : "bg-muted"}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${local[key] === "true" ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              ) : (
                <Input
                  type="number"
                  value={local[key] ?? ""}
                  onChange={(e) => setLocal((l) => ({ ...l, [key]: e.target.value }))}
                  className={`w-28 text-right ${local[key] !== settings[key] ? "border-primary" : ""}`}
                />
              )}
            </div>
          </div>
        ))}
      </div>

      <Button onClick={save} disabled={saving || !hasChanges} className="w-full">
        <Save className="w-4 h-4 mr-2" />
        {saving ? "Saving…" : hasChanges ? "Save Changes" : "No Changes"}
      </Button>

      <p className="text-xs text-muted-foreground text-center">
        Note: ELO parameters apply to new matches. Use "Recalc All" in the Ratings tab to reapply to history.
      </p>
    </div>
  );
}
