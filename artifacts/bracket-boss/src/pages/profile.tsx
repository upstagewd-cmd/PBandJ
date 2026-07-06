import { useRef, useState } from "react";
import { useLocation } from "wouter";
import { useUser, useClerk, Show } from "@clerk/react";
import { useGetMyProfile } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Trophy, Target, TrendingUp, Star, LogOut, User, Camera, Users, Pencil, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AvatarCropModal } from "@/components/AvatarCropModal";
import { PlayerAvatar } from "@/components/ui/player-avatar";

const SKILL_LEVELS = [
  { value: "beginner", label: "Beginner", emoji: "🟢", desc: "New to pickleball" },
  { value: "intermediate", label: "Intermediate", emoji: "🔵", desc: "Comfortable with doubles" },
  { value: "advanced", label: "Advanced", emoji: "🔴", desc: "Experienced competitor" },
] as const;

export default function ProfilePage() {
  const [, setLocation] = useLocation();
  const { user } = useUser();
  const { signOut } = useClerk();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [savingSkill, setSavingSkill] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameFirst, setNameFirst] = useState("");
  const [nameLast, setNameLast] = useState("");
  const [savingName, setSavingName] = useState(false);
  const queryClient = useQueryClient();

  const { data: profile, isLoading } = useGetMyProfile({
    query: { retry: false, queryKey: ["myProfile"] },
  });

  const setSkillLevel = async (level: string) => {
    setSavingSkill(true);
    try {
      const res = await fetch("/api/profile/me/skill", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skillLevel: level }),
      });
      if (!res.ok) throw new Error("Failed");
      queryClient.invalidateQueries({ queryKey: ["myProfile"] });
      toast({ title: "Skill level saved!" });
    } catch {
      toast({ title: "Couldn't save skill level", variant: "destructive" });
    } finally {
      setSavingSkill(false);
    }
  };

  const displayName =
    user?.fullName ??
    user?.firstName ??
    user?.emailAddresses?.[0]?.emailAddress?.split("@")[0] ??
    "Player";

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCropSrc(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleCropConfirm = async (blob: Blob) => {
    if (!user) return;
    const file = new File([blob], "avatar.jpg", { type: "image/jpeg" });
    await user.setProfileImage({ file });
    await user.reload();
    setCropSrc(null);
    toast({ title: "Photo updated!", description: "Your profile picture has been changed." });
  };

  const handleCropCancel = () => {
    setCropSrc(null);
  };

  const startEditingName = () => {
    setNameFirst(user?.firstName ?? "");
    setNameLast(user?.lastName ?? "");
    setEditingName(true);
  };

  const cancelEditingName = () => {
    setEditingName(false);
  };

  const saveName = async () => {
    if (!user || !nameFirst.trim() || !nameLast.trim()) return;
    setSavingName(true);
    try {
      await user.update({ firstName: nameFirst.trim(), lastName: nameLast.trim() });
      await user.reload();
      setEditingName(false);
      toast({ title: "Name updated!" });
    } catch {
      toast({ title: "Couldn't save name", variant: "destructive" });
    } finally {
      setSavingName(false);
    }
  };

  return (
    <>
      {cropSrc && (
        <AvatarCropModal
          srcUrl={cropSrc}
          onConfirm={handleCropConfirm}
          onCancel={handleCropCancel}
        />
      )}

      <div className="min-h-[100dvh] w-full px-4 py-8 max-w-2xl mx-auto space-y-8">
        {/* Back */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => history.back()} className="gap-2">
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
          <Show when="signed-in">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground gap-2"
              onClick={() => signOut({ redirectUrl: "/" })}
            >
              <LogOut className="w-4 h-4" /> Sign Out
            </Button>
          </Show>
        </div>

        <Show when="signed-out">
          <div className="text-center py-20 space-y-4">
            <User className="w-16 h-16 text-muted-foreground/30 mx-auto" />
            <p className="text-muted-foreground font-medium">Sign in to view your profile.</p>
            <Button onClick={() => setLocation("/sign-in")}>Sign In</Button>
          </div>
        </Show>

        <Show when="signed-in">
          {/* Hero card */}
          <div className="bg-card border border-border/50 rounded-3xl p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-4">
              {/* Clickable avatar */}
              <button
                onClick={handleAvatarClick}
                className="relative w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center overflow-hidden border border-primary/20 shrink-0 group hover:opacity-90 transition-opacity"
                title="Change profile photo"
              >
                {user?.imageUrl ? (
                  <img src={user.imageUrl} alt="" className="w-16 h-16 object-cover" />
                ) : (
                  <User className="w-8 h-8 text-primary" />
                )}
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Camera className="w-5 h-5 text-white" />
                </div>
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileSelected}
              />

              <div className="min-w-0 flex-1">
                {editingName ? (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Input
                        value={nameFirst}
                        onChange={(e) => setNameFirst(e.target.value)}
                        placeholder="First"
                        className="h-8 text-sm"
                        autoFocus
                      />
                      <Input
                        value={nameLast}
                        onChange={(e) => setNameLast(e.target.value)}
                        placeholder="Last"
                        className="h-8 text-sm"
                        onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") cancelEditingName(); }}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" className="h-7 px-3 text-xs gap-1" onClick={saveName} disabled={savingName || !nameFirst.trim() || !nameLast.trim()}>
                        <Check className="w-3 h-3" /> Save
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-3 text-xs gap-1" onClick={cancelEditingName} disabled={savingName}>
                        <X className="w-3 h-3" /> Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <h1 className="text-2xl font-extrabold truncate">{displayName}</h1>
                    <button
                      onClick={startEditingName}
                      className="text-muted-foreground active:text-foreground shrink-0"
                      title="Edit name"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  </div>
                )}
                {!editingName && user?.emailAddresses?.[0]?.emailAddress && (
                  <p className="text-muted-foreground text-sm truncate">
                    {user.emailAddresses[0].emailAddress}
                  </p>
                )}
                {!isLoading && profile && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-lg">{profile.rankEmoji}</span>
                    <span className="text-sm font-bold text-primary">{profile.rankTitle}</span>
                    <span className="text-xs text-muted-foreground ml-1">
                      · {Math.round(profile.eloRating)} ELO
                    </span>
                  </div>
                )}
              </div>
            </div>
            {!isLoading && profile && (profile as any).badges?.length > 0 && (
              <div className="space-y-2 pt-1">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Badges</p>
                <div className="flex flex-wrap gap-2">
                  {((profile as any).badges as Array<{ id: string; name: string; icon: string; description: string }>).map((b) => (
                    <div key={b.id} title={b.description}
                      className="flex items-center gap-1.5 bg-primary/10 border border-primary/20 rounded-full px-3 py-1">
                      <span className="text-base leading-none">{b.icon}</span>
                      <span className="text-xs font-bold text-primary">{b.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <p className="text-xs text-muted-foreground/60 text-center">
              Tap your photo to change it
            </p>
          </div>

          {/* Skill Level */}
          {!isLoading && profile && (
            <div className="bg-card border border-border/50 rounded-2xl p-4 space-y-3">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Skill Level</p>
              {(profile as any).skillLevel ? (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    {SKILL_LEVELS.map((s) => {
                      const selected = (profile as any).skillLevel === s.value;
                      return (
                        <div
                          key={s.value}
                          className={`flex flex-col items-center gap-1 rounded-xl p-3 border-2 transition-all ${
                            selected
                              ? "border-primary bg-primary/10"
                              : "border-border/30 bg-muted/10 opacity-40"
                          }`}
                        >
                          <span className="text-xl">{s.emoji}</span>
                          <span className="text-xs font-bold">{s.label}</span>
                          <span className="text-[10px] text-muted-foreground text-center leading-tight">{s.desc}</span>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground/60 text-center">
                    To change your skill level, ask an admin.
                  </p>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    {SKILL_LEVELS.map((s) => {
                      return (
                        <button
                          key={s.value}
                          onClick={() => setSkillLevel(s.value)}
                          disabled={savingSkill}
                          className="flex flex-col items-center gap-1 rounded-xl p-3 border-2 border-border/50 bg-muted/30 hover:border-primary/50 hover:bg-primary/5 transition-all"
                        >
                          <span className="text-xl">{s.emoji}</span>
                          <span className="text-xs font-bold">{s.label}</span>
                          <span className="text-[10px] text-muted-foreground text-center leading-tight">{s.desc}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground text-center">
                    Set your skill level — you won't be able to change it yourself afterward.
                  </p>
                </>
              )}
            </div>
          )}

          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground animate-pulse font-bold">
              Loading stats...
            </div>
          ) : profile ? (
            <>
              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <StatCard
                  icon={<Target className="w-5 h-5 text-primary" />}
                  label="Matches"
                  value={profile.matchesPlayed}
                />
                <StatCard
                  icon={<TrendingUp className="w-5 h-5 text-green-400" />}
                  label="Wins"
                  value={profile.totalWins}
                  sub={`${profile.winPct}% win rate`}
                />
                <StatCard
                  icon={<Target className="w-5 h-5 text-muted-foreground" />}
                  label="Losses"
                  value={profile.totalLosses}
                />
                <StatCard
                  icon={<Trophy className="w-5 h-5 text-yellow-500" />}
                  label="Titles"
                  value={profile.tournamentWins}
                  sub={`${profile.tournamentsPlayed} tournament${profile.tournamentsPlayed !== 1 ? "s" : ""}`}
                />
              </div>

              {/* Recent matches */}
              {profile.recentMatches.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                    <Star className="w-4 h-4" /> Recent Matches
                  </h2>
                  <div className="bg-card border border-border/50 rounded-2xl divide-y divide-border/30 overflow-hidden">
                    {profile.recentMatches.map((m) => (
                      <div key={m.matchId} className="flex items-center gap-3 px-4 py-3">
                        <span
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-extrabold shrink-0 ${
                            m.won ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                          }`}
                        >
                          {m.won ? "W" : "L"}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold truncate">
                            vs <span className="text-foreground">{m.opponentName}</span>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {m.tournamentName} ·{" "}
                            {m.bracket === "winner"
                              ? "WB"
                              : m.bracket === "loser"
                              ? "LB"
                              : m.bracket === "grand_finals"
                              ? "GF"
                              : "GF Reset"}{" "}
                            R{m.round}
                          </p>
                        </div>
                        {(m.scoreOne !== null || m.scoreTwo !== null) && (
                          <span className="font-mono text-sm text-muted-foreground shrink-0">
                            {m.scoreOne ?? "–"}–{m.scoreTwo ?? "–"}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Partner Stats */}
              {profile.partnerStats && profile.partnerStats.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                    <Users className="w-4 h-4" /> Best Partners
                  </h2>
                  <div className="bg-card border border-border/50 rounded-2xl divide-y divide-border/30 overflow-hidden">
                    {profile.partnerStats.map((p) => {
                      const parts = p.name.trim().split(/\s+/);
                      const firstName = parts[0] ?? p.name;
                      const lastName = parts.slice(1).join(" ");
                      const lastInitial = lastName ? `${lastName[0]}.` : "";
                      return (
                        <div key={p.playerId} className="flex items-center gap-3 px-4 py-3">
                          <PlayerAvatar
                            player={{ firstName, lastName, avatarUrl: p.avatarUrl }}
                            size="md"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold truncate">{firstName}{lastInitial ? ` ${lastInitial}` : ""}</p>
                            <p className="text-xs text-muted-foreground">
                              {p.wins}W · {p.losses}L · {p.matches} match{p.matches !== 1 ? "es" : ""}
                            </p>
                          </div>
                          <span
                            className={`shrink-0 text-xs font-extrabold px-2 py-1 rounded-lg ${
                              p.winPct >= 60
                                ? "bg-green-500/20 text-green-400"
                                : p.winPct >= 40
                                ? "bg-yellow-500/20 text-yellow-400"
                                : "bg-red-500/20 text-red-400"
                            }`}
                          >
                            {p.winPct}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {profile.matchesPlayed === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <Star className="w-12 h-12 opacity-20 mx-auto mb-3" />
                  <p className="font-medium">No matches yet.</p>
                  <p className="text-sm mt-1">
                    Join a tournament while signed in to start tracking your stats.
                  </p>
                </div>
              )}
            </>
          ) : null}
        </Show>
      </div>
    </>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub?: string;
}) {
  return (
    <div className="bg-card border border-border/50 rounded-2xl p-4 flex flex-col gap-1 shadow-sm">
      {icon}
      <p className="text-2xl font-extrabold mt-1">{value}</p>
      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
