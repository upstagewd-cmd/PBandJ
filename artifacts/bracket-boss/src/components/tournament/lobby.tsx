import { useState, useEffect, useRef } from "react";
import { useUser, Show } from "@clerk/react";
import { QRCodeSVG } from "qrcode.react";
import {
  TournamentFull,
  Team,
  KnownPlayer,
  useUpdateTournament,
  useStartTournament,
  useJoinTournament,
  useRemovePlayer,
  useUpdatePlayer,
  useGenerateTeams,
  useResetTeams,
  useUpdateTeam,
  useGetMyProfile,
  getGetTournamentQueryKey,
} from "@workspace/api-client-react";
import { KnownPlayerPicker } from "@/components/ui/known-player-picker";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Copy,
  Users,
  Play,
  UserMinus,
  Lock,
  Unlock,
  Loader2,
  Check,
  Link,
  Pencil,
  Shuffle,
  RefreshCw,
  X,
  ArrowLeftRight,
  User,
} from "lucide-react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation } from "wouter";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { PlayerAvatar } from "@/components/ui/player-avatar";
import { getPlayerDisplayName, getPlayerDisplaySubtext } from "@/lib/display-name";
import { NICKNAME_MAX_LENGTH } from "@/lib/nickname";

interface LobbyProps {
  tournament: TournamentFull;
  hostToken: string | null;
  returnPath?: string;
}

const SKILL_LEVELS = [
  { value: "beginner", label: "Beginner", emoji: "🟢", desc: "New to pickleball" },
  { value: "intermediate", label: "Intermediate", emoji: "🔵", desc: "Comfortable with doubles" },
  { value: "advanced", label: "Advanced", emoji: "🔴", desc: "Experienced competitor" },
] as const;

const joinSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  teamName: z.string().max(NICKNAME_MAX_LENGTH, `Nickname must be ${NICKNAME_MAX_LENGTH} characters or fewer.`).optional(),
  skillLevel: z.enum(["beginner", "intermediate", "advanced"]),
});

function useCopyButton() {
  const [copied, setCopied] = useState(false);
  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return { copied, copy };
}

function getMyPlayerToken(tournamentId: string, playerId: string): string | null {
  return localStorage.getItem(`playerToken_${tournamentId}_${playerId}`);
}

// ─── Quick join card for signed-in users ──────────────────────────────────────

function QuickJoinCard({ tournament, onJoined }: { tournament: TournamentFull; onJoined: () => void }) {
  const { user } = useUser();
  const joinTournament = useJoinTournament();
  const { toast } = useToast();
  const [alreadyAdded, setAlreadyAdded] = useState(false);
  const { data: profile } = useGetMyProfile({
    query: { retry: false, queryKey: ["myProfile"], enabled: !!user },
  });

  if (!user) return null;

  const alreadyIn = tournament.players.some((p) => (p as any).clerkUserId === user.id);

  if (alreadyIn) {
    return (
      <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-green-500/20 flex items-center justify-center shrink-0">
          <Check className="w-5 h-5 text-green-400" />
        </div>
        <div>
          <p className="text-sm font-bold text-green-400">You're in ✓</p>
          <p className="text-xs text-muted-foreground">You've been added to the pool</p>
        </div>
      </div>
    );
  }

  if (alreadyAdded) {
    return (
      <div className="bg-muted/50 border border-border/50 rounded-2xl p-4 text-sm text-muted-foreground text-center">
        You've already been added by the host — look for your name in the player list.
      </div>
    );
  }

  if (!user.firstName || !user.lastName) return null;
  const nickname = ((profile as any)?.nickname ?? "").trim();
  const displayName = nickname || `${user.firstName} ${user.lastName}`;

  const handleQuickJoin = () => {
    joinTournament.mutate(
      {
        tournamentId: tournament.id,
        data: { firstName: user.firstName!, lastName: user.lastName!, skillLevel: "intermediate" },
      },
      {
        onSuccess: (data: any) => {
          if (data?.playerToken) {
            localStorage.setItem(`playerToken_${tournament.id}_${data.id}`, data.playerToken);
          }
          onJoined();
          toast({ title: "You're in the pool! Start playing." });
        },
        onError: (err: unknown) => {
          const status = (err as { status?: number })?.status;
          const code = (err as { error?: string; body?: { error?: string } })?.error
            ?? (err as { body?: { error?: string } })?.body?.error;
          if (status === 409 && code === "already_added") {
            setAlreadyAdded(true);
          } else if (status === 409 && code === "nickname_taken") {
            toast({ title: "That nickname is already taken. Try another one.", variant: "destructive" });
          } else {
            toast({ title: "Could not join", variant: "destructive" });
          }
        },
      }
    );
  };

  return (
    <div className="bg-card border border-primary/30 rounded-2xl p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-full overflow-hidden bg-primary/20 shrink-0 flex items-center justify-center">
        {user.imageUrl ? (
          <img src={user.imageUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <User className="w-5 h-5 text-primary" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold truncate">Join as {displayName}</p>
        {nickname && <p className="text-xs text-muted-foreground truncate">{user.firstName} {user.lastName?.[0] ? `${user.lastName[0]}.` : ""}</p>}
        <p className="text-xs text-muted-foreground">Signed in · your real ELO will be used</p>
      </div>
      <Button size="sm" className="shrink-0 font-bold" onClick={handleQuickJoin} disabled={joinTournament.isPending}>
        {joinTournament.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Join"}
      </Button>
    </div>
  );
}

export function TournamentLobby({ tournament, hostToken, returnPath }: LobbyProps) {
  const { toast } = useToast();
  const { user } = useUser();
  const [, setLocation] = useLocation();
  const { data: profile } = useGetMyProfile({
    query: { retry: false, queryKey: ["myProfile"], enabled: !!user && !hostToken },
  });
  const isHost = !!hostToken;
  const isCancelled = tournament.status === "cancelled";
  const queryClient = useQueryClient();
  const refetch = () => queryClient.invalidateQueries({ queryKey: getGetTournamentQueryKey(tournament.id) });

  const playerUrl = `${window.location.origin}/t/${tournament.id}`;
  const hostUrl = hostToken
    ? `${window.location.origin}/t/${tournament.id}?token=${hostToken}`
    : null;

  const playerCopy = useCopyButton();
  const hostCopy = useCopyButton();

  const [isEditingName, setIsEditingName] = useState(false);
  const [tournamentName, setTournamentName] = useState(tournament.name);
  const [showGuestJoin, setShowGuestJoin] = useState(false);
  const [showInviteQr, setShowInviteQr] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [teamGenerateMode, setTeamGenerateMode] = useState<"balanced" | "random" | null>(null);

  const updateTournament = useUpdateTournament();
  const startTournament = useStartTournament();
  const joinTournament = useJoinTournament();
  const removePlayer = useRemovePlayer();
  const generateTeams = useGenerateTeams();
  const resetTeams = useResetTeams();

  const joinForm = useForm<z.infer<typeof joinSchema>>({
    resolver: zodResolver(joinSchema),
    defaultValues: { firstName: "", lastName: "", teamName: "", skillLevel: "intermediate" },
  });

  const [joinAlreadyAdded, setJoinAlreadyAdded] = useState(false);
  const signupPath = `/sign-up?next=${encodeURIComponent(returnPath || `/t/${tournament.id}`)}`;
  const signinPath = `/sign-in?next=${encodeURIComponent(returnPath || `/t/${tournament.id}`)}`;

  useEffect(() => {
    if (!isEditingName) setTournamentName(tournament.name);
  }, [tournament.name, isEditingName]);

  useEffect(() => {
    if (!isEditingName || !nameInputRef.current) return;
    const input = nameInputRef.current;
    input.focus();
    const end = input.value.length;
    input.setSelectionRange(end, end);
  }, [isEditingName]);

  useEffect(() => {
    if (isHost || !user) return;

    const currentFirst = joinForm.getValues("firstName");
    const currentLast = joinForm.getValues("lastName");
    const currentNickname = joinForm.getValues("teamName");

    if (!currentFirst && user.firstName) joinForm.setValue("firstName", user.firstName);
    if (!currentLast && user.lastName) joinForm.setValue("lastName", user.lastName);

    const nickname = ((profile as any)?.nickname ?? "").trim();
    if (!currentNickname && nickname) joinForm.setValue("teamName", nickname);
  }, [isHost, user, profile, joinForm]);

  const handleNameBlur = () => {
    setIsEditingName(false);
    if (tournamentName !== tournament.name && isHost) {
      updateTournament.mutate(
        { tournamentId: tournament.id, data: { name: tournamentName, hostToken: hostToken! } },
        {
          onSettled: refetch,
          onError: () => {
            setTournamentName(tournament.name);
            toast({ title: "Failed to update name", variant: "destructive" });
          },
        }
      );
    }
  };

  const onJoin = (values: z.infer<typeof joinSchema>) => {
    joinTournament.mutate(
      {
        tournamentId: tournament.id,
        data: {
          firstName: values.firstName,
          lastName: values.lastName,
          teamName: values.teamName || undefined,
          skillLevel: values.skillLevel,
          clerkUserId: isHost ? null : (user?.id ?? undefined),
        },
      },
      {
        onSettled: refetch,
        onSuccess: (data: any) => {
          if (data?.playerToken) {
            localStorage.setItem(`playerToken_${tournament.id}_${data.id}`, data.playerToken);
          }
          joinForm.reset();
          toast({ title: "Joined! See you on the court." });
        },
        onError: (err: unknown) => {
          const status = (err as { status?: number })?.status;
          const code = (err as { error?: string; body?: { error?: string } })?.error
            ?? (err as { body?: { error?: string } })?.body?.error;
          if (status === 409 && code === "already_added") {
            setJoinAlreadyAdded(true);
          } else if (status === 409 && code === "nickname_taken") {
            toast({ title: "That nickname is already taken. Try another one.", variant: "destructive" });
          } else {
            toast({
              title: "Could not join",
              description: (err as { message?: string })?.message || "Registration might be locked.",
              variant: "destructive",
            });
          }
        },
      }
    );
  };

  const handleGenerateTeams = (mode: "balanced" | "random") => {
    setTeamGenerateMode(mode);
    generateTeams.mutate(
      { tournamentId: tournament.id, data: { hostToken: hostToken!, mode } },
      {
        onSettled: () => {
          setTeamGenerateMode(null);
          refetch();
        },
        onSuccess: () => toast({ title: `Teams generated (${mode})!` }),
        onError: () => toast({ title: "Failed to generate teams", variant: "destructive" }),
      }
    );
  };

  const handleResetTeams = () => {
    resetTeams.mutate(
      { tournamentId: tournament.id, data: { hostToken: hostToken! } },
      {
        onSettled: refetch,
        onError: () => toast({ title: "Failed to reset teams", variant: "destructive" }),
      }
    );
  };

  const handleSelectKnownPlayer = (player: KnownPlayer) => {
    joinTournament.mutate(
      {
        tournamentId: tournament.id,
        data: {
          firstName: player.firstName,
          lastName: player.lastName,
          clerkUserId: player.clerkUserId ?? null,
        },
      },
      {
        onSettled: refetch,
        onSuccess: () => toast({ title: `${player.firstName} ${player.lastName} added!` }),
        onError: (err: unknown) => {
          const status = (err as { status?: number })?.status;
          const code = (err as { error?: string; body?: { error?: string } })?.error
            ?? (err as { body?: { error?: string } })?.body?.error;
          if (status === 409 && code === "already_added") {
            toast({ title: `${player.firstName} is already in the tournament.` });
          } else if (status === 409 && code === "nickname_taken") {
            toast({ title: "That nickname is already taken. Try another one.", variant: "destructive" });
          } else {
            toast({ title: "Failed to add player", variant: "destructive" });
          }
        },
      }
    );
  };

  const hasTeams = (tournament.teams?.length ?? 0) > 0;
  const canStart = hasTeams && (tournament.teams?.length ?? 0) >= 2;

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

      <div className="rounded-[32px] border border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background p-6 shadow-[0_20px_60px_-24px_rgba(0,0,0,0.28)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2 min-w-0">
            {isHost && !isCancelled ? (
              isEditingName ? (
                <input
                  ref={nameInputRef}
                  className="w-full border-none bg-transparent text-2xl font-extrabold tracking-tight text-primary outline-none focus:ring-0"
                  value={tournamentName}
                  onChange={(e) => setTournamentName(e.target.value)}
                  onBlur={handleNameBlur}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") nameInputRef.current?.blur();
                    if (e.key === "Escape") {
                      setTournamentName(tournament.name);
                      setIsEditingName(false);
                    }
                  }}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setIsEditingName(true)}
                  className="group flex items-center gap-2 text-left min-w-0"
                >
                  <h1 className="text-2xl font-extrabold tracking-tight text-primary truncate">{tournament.name}</h1>
                  <Pencil className="w-4 h-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0" />
                </button>
              )
            ) : (
              <h1 className={`text-2xl font-extrabold tracking-tight ${isCancelled ? "text-muted-foreground" : "text-primary"}`}>{tournament.name}</h1>
            )}
          </div>
          <div className="rounded-2xl border border-border/50 bg-background/80 px-4 py-3 text-right shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">Players</p>
            <p className="text-2xl font-bold text-foreground">{tournament.players.length}</p>
          </div>
        </div>
      </div>

      {!isCancelled && !isHost && !user && (
        <div className="bg-card border border-primary/30 rounded-3xl p-5 space-y-4 shadow-xl">
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-primary">Account recommended</p>
            <h3 className="text-lg font-bold text-foreground">Play with your PB&amp;J account</h3>
            <p className="text-sm text-muted-foreground">Track your rank, badges, and match history.</p>
          </div>
          <Button className="w-full h-11 font-bold" onClick={() => setLocation(signupPath)}>
            Create account
          </Button>
          <Button variant="outline" className="w-full h-11 font-bold" onClick={() => setLocation(signinPath)}>
            Already have an account? Sign in
          </Button>
          <button
            type="button"
            onClick={() => setShowGuestJoin((prev) => !prev)}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Continue as guest
          </button>
        </div>
      )}

      {/* Cancelled banner for non-hosts */}
      {isCancelled && !isHost && (
        <div className="bg-muted/60 border border-border/60 rounded-3xl p-6 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
            <X className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <p className="font-bold">This tournament has been cancelled</p>
            <p className="text-sm text-muted-foreground">The host cancelled it. The player list is preserved below.</p>
          </div>
        </div>
      )}

      <div className="rounded-[32px] border border-border/50 bg-card/90 p-6 shadow-[0_20px_60px_-24px_rgba(0,0,0,0.28)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">Invite players</p>
            <h2 className="mt-2 text-xl font-semibold text-foreground">Share the court and get the field moving</h2>
            <p className="mt-1 text-sm text-muted-foreground">Use the player link for guests or the host link for co-hosts.</p>
          </div>
          <div className="rounded-2xl bg-primary/10 p-3 text-primary">
            <Link className="h-5 w-5" />
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-6 lg:flex-row">
          <div className="flex-1 space-y-3">
            <div className="rounded-2xl border border-border/50 bg-background/70 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">QR code</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full px-3 py-1 text-xs font-semibold"
                  onClick={() => setShowInviteQr((prev) => !prev)}
                >
                  {showInviteQr ? "Hide QR code" : "Show QR code"}
                </Button>
              </div>
              {showInviteQr && (
                <div className="mt-3 mx-auto flex w-fit items-center justify-center rounded-2xl bg-white p-3 shadow-sm">
                  <QRCodeSVG value={playerUrl} size={148} level="H" includeMargin={false} />
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-border/50 bg-background/70 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Player link</p>
                <Button
                  size="sm"
                  variant="secondary"
                  className="rounded-full px-3 py-1 text-xs font-semibold"
                  onClick={() => { playerCopy.copy(playerUrl); toast({ title: "Player link copied!" }); }}
                >
                  {playerCopy.copied ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
                  {playerCopy.copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <Input readOnly value={playerUrl} className="mt-3 h-11 font-mono text-xs bg-muted border-none" />
            </div>
            {isHost && hostUrl && (
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">Host link</p>
                  <Button
                    size="sm"
                    className="rounded-full px-3 py-1 text-xs font-semibold"
                    onClick={() => { hostCopy.copy(hostUrl); toast({ title: "Host link copied!" }); }}
                  >
                    {hostCopy.copied ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
                    {hostCopy.copied ? "Copied" : "Copy"}
                  </Button>
                </div>
                <Input readOnly value={hostUrl} className="mt-3 h-11 font-mono text-xs bg-background border-primary/20" />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

        {/* Players List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Users className="w-6 h-6 text-primary" />
              Players
              <span className="text-muted-foreground ml-1">({tournament.players.length})</span>
            </h2>
          </div>

          <div className="bg-card border border-border/50 rounded-3xl p-4 shadow-xl min-h-[200px]">
            {tournament.players.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-2 py-8">
                <Users className="w-12 h-12 opacity-20" />
                <p className="font-medium">No one has joined yet.</p>
              </div>
            ) : (
              <ul className="space-y-2">
                {tournament.players.map((p, i) => {
                  const myToken = getMyPlayerToken(tournament.id, p.id);
                  return (
                    <PlayerRow
                      key={p.id}
                      player={p}
                      index={i}
                      tournamentId={tournament.id}
                      myToken={myToken}
                      isHost={isHost && !isCancelled}
                      hostToken={hostToken}
                      onRemove={() =>
                        removePlayer.mutate(
                          { tournamentId: tournament.id, playerId: p.id, data: { hostToken: hostToken! } },
                          { onSettled: refetch }
                        )
                      }
                    />
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Right column: Join form OR host team/start controls */}
        <div className="space-y-4">
          {isCancelled ? null : !tournament.registrationLocked ? (
            <>
              <div className="rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 to-background p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-primary">Ready to play?</p>
                <h2 className="mt-1 text-xl font-semibold text-foreground">Join the field</h2>
                <p className="mt-2 text-sm text-muted-foreground">Register in seconds and get seeded into the bracket with your skill level.</p>
              </div>

              {isHost && (
                <KnownPlayerPicker
                  onSelect={handleSelectKnownPlayer}
                  isPending={joinTournament.isPending}
                />
              )}

              <Show when="signed-in">
                <QuickJoinCard tournament={tournament} onJoined={refetch} />
              </Show>

              {joinAlreadyAdded ? (
                <div className="bg-muted/50 border border-border/50 rounded-3xl p-8 text-sm text-muted-foreground text-center">
                  You've already been added by the host — look for your name in the list.
                </div>
              ) : (
              (isHost || (!user && showGuestJoin)) && (
              <div className="bg-card border border-border/50 rounded-3xl p-6 shadow-xl">
                <Form {...joinForm}>
                  <form onSubmit={joinForm.handleSubmit(onJoin)} className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <FormField control={joinForm.control} name="firstName" render={({ field }) => (
                        <FormItem>
                          <Label className="uppercase text-xs font-bold tracking-widest text-muted-foreground">First</Label>
                          <FormControl>
                            <Input placeholder="John" className="h-11 bg-muted/50 border-none" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={joinForm.control} name="lastName" render={({ field }) => (
                        <FormItem>
                          <Label className="uppercase text-xs font-bold tracking-widest text-muted-foreground">Last</Label>
                          <FormControl>
                            <Input placeholder="Doe" className="h-11 bg-muted/50 border-none" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>

                    <FormField control={joinForm.control} name="teamName" render={({ field }) => (
                      <FormItem>
                        <Label className="uppercase text-xs font-bold tracking-widest text-muted-foreground">
                          Nickname <span className="normal-case tracking-normal font-normal text-muted-foreground/60">(optional)</span>
                        </Label>
                        <FormControl>
                          <Input placeholder="The Dink Masters" className="h-11 bg-muted/50 border-none" maxLength={NICKNAME_MAX_LENGTH} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={joinForm.control} name="skillLevel" render={({ field }) => (
                      <FormItem>
                        <Label className="uppercase text-xs font-bold tracking-widest text-muted-foreground">Skill Level</Label>
                        <div className="grid grid-cols-3 gap-2">
                          {SKILL_LEVELS.map((s) => (
                            <button
                              key={s.value}
                              type="button"
                              onClick={() => field.onChange(s.value)}
                              className={`flex flex-col items-center gap-1 rounded-xl p-3 border-2 transition-all ${
                                field.value === s.value
                                  ? "border-primary bg-primary/10"
                                  : "border-border/50 bg-muted/30 hover:border-border"
                              }`}
                            >
                              <span className="text-xl">{s.emoji}</span>
                              <span className="text-xs font-bold">{s.label}</span>
                              <span className="text-[10px] text-muted-foreground text-center leading-tight">{s.desc}</span>
                            </button>
                          ))}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <Button
                      type="submit"
                      className="w-full h-14 text-lg font-bold rounded-xl mt-2"
                      disabled={joinTournament.isPending}
                    >
                      {joinTournament.isPending ? <Loader2 className="w-6 h-6 animate-spin" /> : "JOIN TOURNAMENT"}
                    </Button>
                  </form>
                </Form>
              </div>
              )
              )}
            </>
          ) : (
            <div className="bg-muted/50 border border-border/50 rounded-3xl p-8 shadow-xl text-center flex flex-col items-center justify-center space-y-4">
              <Lock className="w-12 h-12 text-muted-foreground" />
              <div>
                <h3 className="text-xl font-bold">Registration Locked</h3>
                <p className="text-muted-foreground">Waiting for host to start...</p>
              </div>
            </div>
          )}

          {isHost && !isCancelled && (
            <div className="pt-4 border-t border-border/50 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="uppercase text-xs font-bold tracking-widest text-muted-foreground">Host Controls</h3>
                <CancelTournamentButton
                  tournamentId={tournament.id}
                  hostToken={hostToken!}
                  isCancelled={isCancelled}
                  onChanged={refetch}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="outline" className="h-12 rounded-xl font-bold"
                  onClick={() =>
                    updateTournament.mutate(
                      { tournamentId: tournament.id, data: { registrationLocked: !tournament.registrationLocked, hostToken: hostToken! } },
                      { onSettled: refetch }
                    )
                  }
                >
                  {tournament.registrationLocked
                    ? <><Unlock className="w-4 h-4 mr-2" /> Unlock Join</>
                    : <><Lock className="w-4 h-4 mr-2" /> Lock Join</>
                  }
                </Button>
                <Button
                  className="h-12 rounded-xl font-bold bg-green-600 hover:bg-green-700 text-white"
                  disabled={!canStart || startTournament.isPending}
                  onClick={() => startTournament.mutate(
                    { tournamentId: tournament.id, data: { hostToken: hostToken! } },
                    { onSettled: refetch }
                  )}
                >
                  {startTournament.isPending
                    ? <Loader2 className="w-5 h-5 animate-spin" />
                    : <><Play className="w-4 h-4 mr-2 fill-current" /> Start</>
                  }
                </Button>
              </div>
              {!canStart && (
                <p className="text-xs text-muted-foreground text-center">
                  {hasTeams
                    ? "Need at least 2 teams to start"
                    : "Generate teams below before starting"}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Teams Section — host only, active only */}
      {isHost && !isCancelled && (
        <div className="space-y-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <ArrowLeftRight className="w-6 h-6 text-primary" />
                Teams
                {hasTeams && (
                  <span className="text-muted-foreground ml-1">({tournament.teams?.length})</span>
                )}
              </h2>
              {hasTeams && (
                <Button
                  variant="outline" size="sm"
                  onClick={handleResetTeams}
                  disabled={resetTeams.isPending}
                  className="font-bold uppercase tracking-wider text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                >
                  <X className="w-3 h-3 mr-1.5" /> Reset
                </Button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <Button
                variant="outline" size="sm"
                onClick={() => handleGenerateTeams("balanced")}
                disabled={generateTeams.isPending || tournament.players.length < 2}
                className="font-bold uppercase tracking-wider text-xs"
              >
                {generateTeams.isPending && teamGenerateMode === "balanced"
                  ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                  : <Shuffle className="w-3 h-3 mr-1.5" />
                }
                {hasTeams ? "Regenerate" : "Generate"} Balanced
              </Button>
              <Button
                variant="ghost" size="sm"
                onClick={() => handleGenerateTeams("random")}
                disabled={generateTeams.isPending || tournament.players.length < 2}
                className="font-bold uppercase tracking-wider text-xs"
              >
                <RefreshCw className={`w-3 h-3 mr-1.5 ${generateTeams.isPending && teamGenerateMode === "random" ? "animate-spin" : ""}`} /> Random
              </Button>
            </div>
          </div>

          {!hasTeams ? (
            <div className="bg-card border border-dashed border-border/60 rounded-3xl p-10 text-center text-muted-foreground space-y-3">
              <ArrowLeftRight className="w-10 h-10 opacity-20 mx-auto" />
              <p className="font-medium">No teams yet.</p>
              <p className="text-sm">
                {tournament.players.length < 2
                  ? "Add at least 2 players first, then generate teams."
                  : "Click \"Generate Balanced\" to auto-pair players by skill level."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {tournament.teams?.map((team, idx) => (
                <TeamCard
                  key={team.id}
                  team={team}
                  index={idx}
                  tournament={tournament}
                  hostToken={hostToken!}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Teams view for non-hosts when teams exist */}
      {!isHost && hasTeams && (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <ArrowLeftRight className="w-6 h-6 text-primary" />
            Teams
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {tournament.teams?.map((team, idx) => (
              <TeamCard
                key={team.id}
                team={team}
                index={idx}
                tournament={tournament}
                hostToken={null}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── TeamCard ───────────────────────────────────────────────────────────────────

interface TeamCardProps {
  team: Team;
  index: number;
  tournament: TournamentFull;
  hostToken: string | null;
}

function TeamCard({ team, index, tournament, hostToken }: TeamCardProps) {
  const isHost = !!hostToken;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const refetch = () => queryClient.invalidateQueries({ queryKey: getGetTournamentQueryKey(tournament.id) });
  const updateTeam = useUpdateTeam();

  const getPlayer = (id: string | null | undefined) =>
    id ? tournament.players.find((p) => p.id === id) ?? null : null;

  const p1 = getPlayer(team.player1Id);
  const p2 = getPlayer(team.player2Id);

  const teamLabel = team.teamName
    || (p1 && p2 ? `${getPlayerDisplayName(p1)} & ${getPlayerDisplayName(p2)}` : `Team ${index + 1}`);

  const handleSwapSlot = (slot: "player1Id" | "player2Id", newPlayerId: string) => {
    if (!isHost) return;

    // Who is being displaced from this slot
    const displacedPlayerId = slot === "player1Id" ? team.player1Id : team.player2Id;

    // Find the source team + slot of the incoming player
    const sourceTeam = (tournament.teams as Team[] | undefined)?.find(
      (t) => t.player1Id === newPlayerId || t.player2Id === newPlayerId
    );
    const sourceSlot: "player1Id" | "player2Id" | null = sourceTeam
      ? sourceTeam.player1Id === newPlayerId ? "player1Id" : "player2Id"
      : null;

    // Step 1: put incoming player into this team's slot
    updateTeam.mutate(
      { tournamentId: tournament.id, teamId: team.id, data: { hostToken: hostToken!, [slot]: newPlayerId } },
      {
        onSuccess: () => {
          // Step 2: put the displaced player into the source slot
          if (displacedPlayerId && sourceTeam && sourceSlot) {
            updateTeam.mutate(
              { tournamentId: tournament.id, teamId: sourceTeam.id, data: { hostToken: hostToken!, [sourceSlot]: displacedPlayerId } },
              { onSettled: refetch, onError: () => toast({ title: "Swap failed (step 2)", variant: "destructive" }) }
            );
          } else {
            refetch();
          }
        },
        onError: () => {
          refetch();
          toast({ title: "Swap failed", variant: "destructive" });
        },
      }
    );
  };

  const otherPlayerOptions = tournament.players.filter(
    (p) => p.id !== team.player1Id && p.id !== team.player2Id
  );

  return (
    <div className="bg-card border border-border/50 rounded-2xl p-4 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Team {index + 1}
        </span>
        {team.teamName && (
          <span className="text-xs font-bold text-primary truncate ml-2">{team.teamName}</span>
        )}
      </div>

      <div className="font-semibold text-base truncate">{teamLabel}</div>

      <div className="space-y-2">
        {[
          { player: p1, slot: "player1Id" as const, label: "Player 1" },
          { player: p2, slot: "player2Id" as const, label: "Player 2" },
        ].map(({ player, slot, label }) => (
          <div key={slot} className="flex items-center gap-2">
            {player ? (
              <>
                <PlayerAvatar player={player} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{getPlayerDisplayName(player)}</p>
                  {getPlayerDisplaySubtext(player) && (
                    <p className="text-[10px] text-muted-foreground truncate">{getPlayerDisplaySubtext(player)}</p>
                  )}
                  {(player as any).skillLevel && (
                    <p className="text-[10px] text-muted-foreground">
                      {(player as any).skillLevel === "advanced" ? "🔴" : (player as any).skillLevel === "intermediate" ? "🔵" : "🟢"}{" "}
                      {(player as any).skillLevel}
                    </p>
                  )}
                </div>
              </>
            ) : (
              <span className="text-sm text-muted-foreground italic">{label} (open)</span>
            )}
            {isHost && otherPlayerOptions.length > 0 && (
              <select
                className="ml-auto text-xs bg-muted border border-border/50 rounded-lg px-1.5 py-1 cursor-pointer hover:bg-muted/80 text-foreground"
                value=""
                onChange={(e) => { if (e.target.value) handleSwapSlot(slot, e.target.value); }}
              >
                <option value="">↕ swap</option>
                {otherPlayerOptions.map((op) => {
                  const inTeam = tournament.teams?.find((t) => t.player1Id === op.id || t.player2Id === op.id);
                  const teamIdx = inTeam ? tournament.teams?.indexOf(inTeam) : -1;
                  const subtext = getPlayerDisplaySubtext(op);
                  return (
                    <option key={op.id} value={op.id}>
                      {getPlayerDisplayName(op)}{subtext ? ` - ${subtext}` : ""}{inTeam && teamIdx !== undefined && teamIdx >= 0 ? ` (T${teamIdx + 1})` : ""}
                    </option>
                  );
                })}
              </select>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── PlayerRow ─────────────────────────────────────────────────────────────────

interface PlayerRowProps {
  player: TournamentFull["players"][0];
  index: number;
  tournamentId: string;
  myToken: string | null;
  isHost: boolean;
  hostToken: string | null;
  onRemove: () => void;
}

function PlayerRow({ player, index, tournamentId, myToken, isHost, hostToken, onRemove }: PlayerRowProps) {
  const [, setLocation] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(player.teamName ?? "");
  const [uploading, setUploading] = useState(false);
  const updatePlayer = useUpdatePlayer();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const refetch = () => queryClient.invalidateQueries({ queryKey: getGetTournamentQueryKey(tournamentId) });

  const canEdit = !!myToken || isHost;

  const saveTeamName = () => {
    if (!canEdit) return;
    setEditing(false);
    if (draft === (player.teamName ?? "")) return;
    const auth = myToken
      ? { playerToken: myToken }
      : { hostToken: hostToken ?? "" };
    updatePlayer.mutate(
      { tournamentId, playerId: player.id, data: { ...auth, teamName: draft } },
      {
        onSettled: refetch,
        onError: (err: unknown) => {
          const status = (err as { status?: number })?.status;
          const code = (err as { error?: string; body?: { error?: string } })?.error
            ?? (err as { body?: { error?: string } })?.body?.error;
          if (status === 409 && code === "nickname_taken") {
            toast({ title: "That nickname is already taken. Try another one.", variant: "destructive" });
          } else {
            toast({ title: "Couldn't save nickname", variant: "destructive" });
          }
          setDraft(player.teamName ?? "");
        },
      }
    );
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !myToken) return;
    setUploading(true);
    try {
      const contentType = file.type || "application/octet-stream";
      let objectPath: string | null = null;

      try {
        const urlRes = await fetch("/api/storage/uploads/request-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: file.name, size: file.size, contentType }),
        });
        if (!urlRes.ok) throw new Error("Failed to get upload URL");
        const signed = await urlRes.json() as { uploadURL: string; objectPath: string };
        const uploadRes = await fetch(signed.uploadURL, {
          method: "PUT",
          body: file,
        });
        if (!uploadRes.ok) throw new Error("Upload failed");
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
        if (!fallbackRes.ok) throw new Error("Fallback upload failed");
        const fallback = await fallbackRes.json() as { objectPath: string };
        objectPath = fallback.objectPath;
      }

      if (!objectPath) throw new Error("Missing uploaded object path");
      updatePlayer.mutate(
        { tournamentId, playerId: player.id, data: { playerToken: myToken, avatarUrl: objectPath } },
        { onSettled: refetch, onError: () => toast({ title: "Couldn't save avatar", variant: "destructive" }) }
      );
    } catch {
      toast({ title: "Avatar upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <li className="flex items-center justify-between bg-muted/50 rounded-xl p-3 gap-2">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <span className="text-muted-foreground font-mono text-sm w-4 shrink-0">{index + 1}</span>

        <div className="relative shrink-0">
          {canEdit ? (
            <>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="rounded-full"
                title="Change profile image"
              >
                <PlayerAvatar player={player} size="md" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={handleAvatarUpload}
                disabled={uploading}
              />
              {uploading && (
                <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
                  <Loader2 className="w-3 h-3 text-primary-foreground animate-spin" />
                </div>
              )}
            </>
          ) : (
            <PlayerAvatar player={player} size="md" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="flex items-center gap-2">
              <Input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={saveTeamName}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveTeamName();
                  if (e.key === "Escape") { setEditing(false); setDraft(player.teamName ?? ""); }
                }}
                placeholder="Nickname..."
                className="h-8 text-sm bg-background border-primary/40"
                maxLength={NICKNAME_MAX_LENGTH}
              />
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-1.5 min-w-0">
                <button
                  type="button"
                  onClick={() => setLocation(`/player/${player.id}`)}
                  className="font-semibold text-sm truncate text-left bg-transparent border-0 p-0 m-0 appearance-none"
                  title="View player profile"
                >
                  {getPlayerDisplayName(player)}
                </button>
                {canEdit && (
                  <button onClick={() => setEditing(true)} className="shrink-0 opacity-40 hover:opacity-100 transition-opacity">
                    <Pencil className="w-3 h-3" />
                  </button>
                )}
              </div>
              {getPlayerDisplaySubtext(player) && (
                <p className="text-[10px] text-muted-foreground truncate">{getPlayerDisplaySubtext(player)}</p>
              )}
              {(player as any).skillLevel && (
                <p className="text-[10px] text-muted-foreground">
                  {(player as any).skillLevel === "advanced" ? "🔴" : (player as any).skillLevel === "intermediate" ? "🔵" : "🟢"}{" "}
                  {(player as any).skillLevel}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <span className="text-xs text-muted-foreground tabular-nums">
          {player.rankEmoji} {Math.round(player.eloRating)}
        </span>
      </div>

      {isHost && (
        <button
          onClick={onRemove}
          className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
        >
          <UserMinus className="w-4 h-4" />
        </button>
      )}
    </li>
  );
}

// ── CancelTournamentButton ─────────────────────────────────────────────────────

function CancelTournamentButton({
  tournamentId,
  hostToken,
  isCancelled,
  onChanged,
}: {
  tournamentId: string;
  hostToken: string;
  isCancelled: boolean;
  onChanged: () => void;
}) {
  const updateTournament = useUpdateTournament();
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(false);

  const handle = (status: "cancelled" | "lobby") => {
    updateTournament.mutate(
      { tournamentId, data: { hostToken, status } },
      {
        onSuccess: () => {
          onChanged();
          setConfirming(false);
          toast({ title: status === "cancelled" ? "Tournament cancelled" : "Tournament reopened" });
        },
        onError: () => toast({ title: "Failed to update tournament", variant: "destructive" }),
      }
    );
  };

  if (isCancelled) {
    return (
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs gap-1.5 font-bold uppercase tracking-wider"
        onClick={() => handle("lobby")}
        disabled={updateTournament.isPending}
      >
        {updateTournament.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
        Reopen
      </Button>
    );
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground">Cancel tournament?</span>
        <Button
          size="sm"
          variant="destructive"
          className="h-7 text-xs font-bold uppercase tracking-wider"
          onClick={() => handle("cancelled")}
          disabled={updateTournament.isPending}
        >
          {updateTournament.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Yes, cancel"}
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setConfirming(false)}>
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-destructive font-bold uppercase tracking-wider"
      onClick={() => setConfirming(true)}
    >
      <X className="w-3 h-3" /> Cancel Tournament
    </Button>
  );
}
