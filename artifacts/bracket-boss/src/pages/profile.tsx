import { useRef, useState } from "react";
import { useLocation } from "wouter";
import { useUser, useClerk, Show } from "@clerk/react";
import { useGetMyProfile } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Trophy, Target, TrendingUp, Star, LogOut, User, Camera, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function ProfilePage() {
  const [, setLocation] = useLocation();
  const { user } = useUser();
  const { signOut } = useClerk();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { data: profile, isLoading } = useGetMyProfile({
    query: { retry: false, queryKey: ["myProfile"] },
  });

  const displayName =
    user?.fullName ??
    user?.firstName ??
    user?.emailAddresses?.[0]?.emailAddress?.split("@")[0] ??
    "Player";

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setUploading(true);
    try {
      await user.setProfileImage({ file });
      await user.reload();
      toast({ title: "Photo updated!", description: "Your profile picture has been changed." });
    } catch {
      toast({ title: "Upload failed", description: "Could not update your photo. Try again.", variant: "destructive" });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
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
              disabled={uploading}
              className="relative w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center overflow-hidden border border-primary/20 shrink-0 group hover:opacity-90 transition-opacity"
              title="Change profile photo"
            >
              {user?.imageUrl ? (
                <img src={user.imageUrl} alt="" className="w-16 h-16 object-cover" />
              ) : (
                <User className="w-8 h-8 text-primary" />
              )}
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                {uploading ? (
                  <Loader2 className="w-5 h-5 text-white animate-spin" />
                ) : (
                  <Camera className="w-5 h-5 text-white" />
                )}
              </div>
            </button>

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />

            <div className="min-w-0">
              <h1 className="text-2xl font-extrabold truncate">{displayName}</h1>
              {user?.emailAddresses?.[0]?.emailAddress && (
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
          <p className="text-xs text-muted-foreground/60 text-center">
            Tap your photo to change it
          </p>
        </div>

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
