import { useState, useEffect } from "react";
import { useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shield, Loader2 } from "lucide-react";
import { adminFetch } from "./useAdmin";
import { PlayersTab } from "./PlayersTab";
import { MatchesTab } from "./MatchesTab";
import { TournamentsTab } from "./TournamentsTab";
import { RatingsTab } from "./RatingsTab";
import { RanksTab } from "./RanksTab";
import { BadgesTab } from "./BadgesTab";
import { SettingsTab } from "./SettingsTab";

const TABS = [
  { id: "players",     label: "👤 Players" },
  { id: "matches",     label: "🏓 Matches" },
  { id: "tournaments", label: "🏆 Tournaments" },
  { id: "ratings",     label: "📊 Ratings" },
  { id: "ranks",       label: "🥇 Rankings" },
  { id: "badges",      label: "🏅 Badges" },
  { id: "settings",    label: "⚙️ Settings" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const CODE_KEY = "pbj_admin_code";

export default function AdminPage() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const urlCode = params.get("code") ?? "";

  const [code, setCode] = useState(() => localStorage.getItem(CODE_KEY) ?? urlCode);
  const [input, setInput] = useState(urlCode);
  const [status, setStatus] = useState<"idle" | "checking" | "authed" | "denied">(
    urlCode ? "checking" : localStorage.getItem(CODE_KEY) ? "checking" : "idle",
  );
  const [activeTab, setActiveTab] = useState<TabId>("players");

  useEffect(() => {
    const tryCode = urlCode || localStorage.getItem(CODE_KEY);
    if (!tryCode) { setStatus("idle"); return; }
    setCode(tryCode);
    verify(tryCode);
  }, []);

  const verify = async (c: string) => {
    setStatus("checking");
    try {
      const res = await adminFetch(c, "/verify");
      if (res.ok) {
        localStorage.setItem(CODE_KEY, c);
        setStatus("authed");
      } else {
        localStorage.removeItem(CODE_KEY);
        setStatus("denied");
      }
    } catch {
      setStatus("denied");
    }
  };

  if (status === "checking") {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (status !== "authed") {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center px-4">
        <div className="bg-card border border-border/50 rounded-3xl p-8 w-full max-w-sm space-y-6 shadow-2xl">
          <div className="text-center space-y-2">
            <Shield className="w-12 h-12 text-primary mx-auto" />
            <h1 className="text-2xl font-extrabold">Admin Access</h1>
            <p className="text-muted-foreground text-sm">Enter the admin passcode to continue.</p>
          </div>
          {status === "denied" && (
            <p className="text-red-400 text-sm text-center font-medium">Incorrect passcode. Try again.</p>
          )}
          <div className="space-y-3">
            <Input
              type="password"
              placeholder="Passcode"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && verify(input)}
              autoFocus
            />
            <Button className="w-full" onClick={() => verify(input)} disabled={!input}>
              Enter Admin
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] w-full max-w-2xl mx-auto px-2 py-4 space-y-4">
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary" />
          <h1 className="font-display text-xl">PB&J Admin</h1>
        </div>
        <button
          className="text-xs text-muted-foreground hover:text-foreground"
          onClick={() => { localStorage.removeItem(CODE_KEY); setStatus("idle"); setInput(""); }}
        >
          Lock
        </button>
      </div>

      <div className="overflow-x-auto pb-1">
        <div className="flex gap-1 min-w-max px-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-bold whitespace-nowrap transition-colors ${
                activeTab === t.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-2 pb-8">
        {activeTab === "players"     && <PlayersTab code={code} />}
        {activeTab === "matches"     && <MatchesTab code={code} />}
        {activeTab === "tournaments" && <TournamentsTab code={code} />}
        {activeTab === "ratings"     && <RatingsTab code={code} />}
        {activeTab === "ranks"       && <RanksTab code={code} />}
        {activeTab === "badges"      && <BadgesTab code={code} />}
        {activeTab === "settings"    && <SettingsTab code={code} />}
      </div>
    </div>
  );
}
