import { useState, useEffect } from "react";
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
  Shield,
  Link,
  Pencil,
  Camera,
  Shuffle,
  RefreshCw,
  X,
  ArrowLeftRight,
  User,
} from "lucide-react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { PlayerAvatar } from "@/components/ui/player-avatar";

interface LobbyProps {
  tournament: TournamentFull;
  hostToken: string | null;
}

const SKILL_LEVELS = [
  { value: "beginner", label: "Beginner", emoji: "🟢", desc: "New to pickleball" },
  { value: "intermediate", label: "Intermediate", emoji: "🔵", desc: "Comfortable with doubles" },
  { value: "advanced", label: "Advanced", emoji: "🔴", desc: "Experienced competitor" },
] as const;

const joinSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  teamName: z.string().optional(),
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

  if (!user) return null;

  const alreadyIn = tournament.players.some((p) => (p as any).clerkUserId === user.id);

  if (alreadyIn) {
    return (
      <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-green-500/20 flex items-center justify-center shrink-0">
          <Check className="w-5 h-5 text-green-400" />
        </div>
        <div>
          <p className="text-sm font-bold text-green-400">You're registered ✓</p>
          <p className="text-xs text-muted-foreground">Your real ELO will be used in bracket seeding</p>
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
          toast({ title: "You're in! See you on the court." });
        },
        onError: (err: unknown) => {
          const status = (err as { status?: number })?.status;
          if (status === 409) { setAlreadyAdded(true); }
          else { toast({ title: "Could not join", variant: "destructive" }); }
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
        <p className="text-sm font-bold truncate">Join as {user.firstName} {user.lastName}</p>
        <p className="text-xs text-muted-foreground">Signed in · your real ELO will be used</p>
      </div>
      <Button size="sm" className="shrink-0 font-bold" onClick={handleQuickJoin} disabled={joinTournament.isPending}>
        {joinTournament.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Join"}
      </Button>
    </div>
  );
}

export function TournamentLobby({ tournament, hostToken }: LobbyProps) {
  const { toast } = useToast();
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

  useEffect(() => {
    if (!isEditingName) setTournamentName(tournament.name);
  }, [tournament.name, isEditingName]);

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
          if (status === 409) {
            setJoinAlreadyAdded(true);
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
    generateTeams.mutate(
      { tournamentId: tournament.id, data: { hostToken: hostToken!, mode } },
      {
        onSettled: refetch,
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
          if (status === 409) {
            toast({ title: `${player.firstName} is already in the tournament.` });
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

      {/* Header */}
      <div className="text-center space-y-2">
        {isHost && !isCancelled ? (
          <input
            className="text-4xl font-extrabold tracking-tight bg-transparent text-center border-none outline-none w-full focus:ring-0 text-primary"
            value={tournamentName}
            onChange={(e) => setTournamentName(e.target.value)}
            onFocus={() => setIsEditingName(true)}
            onBlur={handleNameBlur}
          />
        ) : (
          <h1 className={`text-4xl font-extrabold tracking-tight ${isCancelled ? "text-muted-foreground" : "text-primary"}`}>{tournament.name}</h1>
        )}
        <div className="flex items-center justify-center gap-3">
          <p className="text-muted-foreground uppercase tracking-widest text-sm font-bold">
            {isCancelled ? "Cancelled" : "Lobby"}
          </p>
          {isHost && (
            <CancelTournamentButton
              tournamentId={tournament.id}
              hostToken={hostToken!}
              isCancelled={isCancelled}
              onChanged={refetch}
            />
          )}
        </div>
      </div>

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

      {/* QR + Links */}
      <div className="bg-card border border-border/50 rounded-3xl p-6 shadow-xl flex flex-col items-center space-y-5">
        <div className="bg-white p-4 rounded-2xl shadow-sm">
          <QRCodeSVG value={playerUrl} size={148} level="H" includeMargin={false} />
        </div>
        <div className="w-full space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
            <Link className="w-3 h-3" /> Player Link
          </p>
          <div className="flex items-center gap-2">
            <Input readOnly value={playerUrl} className="font-mono text-xs bg-muted border-none h-11" />
            <Button
              size="icon" variant="secondary"
              className="h-11 w-11 shrink-0 rounded-xl"
              onClick={() => { playerCopy.copy(playerUrl); toast({ title: "Player link copied!" }); }}
            >
              {playerCopy.copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        {isHost && hostUrl && (
          <div className="w-full space-y-2">
            <p className="text-xs font-bold uppercase tracking-widest text-primary flex items-center gap-1.5">
              <Shield className="w-3 h-3" /> Host Link
              <span className="text-muted-foreground font-normal normal-case tracking-normal ml-1">
                — share with co-hosts
              </span>
            </p>
            <div className="flex items-center gap-2">
              <Input readOnly value={hostUrl} className="font-mono text-xs bg-primary/5 border border-primary/20 h-11" />
              <Button
                size="icon" className="h-11 w-11 shrink-0 rounded-xl"
                onClick={() => { hostCopy.copy(hostUrl); toast({ title: "Host link copied!" }); }}
              >
                {hostCopy.copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        )}
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
              <h2 className="text-2xl font-bold">Join Match</h2>

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
                          <Input placeholder="The Dink Masters" className="h-11 bg-muted/50 border-none" {...field} />
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
              <h3 className="uppercase text-xs font-bold tracking-widest text-muted-foreground">Host Controls</h3>
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
                {generateTeams.isPending
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
                <RefreshCw className="w-3 h-3 mr-1.5" /> Random
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
    || (p1 && p2 ? `${p1.firstName} & ${p2.firstName}` : `Team ${index + 1}`);

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
                  <p className="text-sm font-semibold truncate">
                    {player.firstName} {player.lastName}
                  </p>
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
                  return (
                    <option key={op.id} value={op.id}>
                      {op.firstName} {op.lastName}{inTeam && teamIdx !== undefined && teamIdx >= 0 ? ` (T${teamIdx + 1})` : ""}
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
        onError: () => {
          toast({ title: "Couldn't save nickname", variant: "destructive" });
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
      const urlRes = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!urlRes.ok) throw new Error("Failed to get upload URL");
      const { uploadURL, objectPath } = await urlRes.json();
      const uploadRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!uploadRes.ok) throw new Error("Upload failed");
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
          <PlayerAvatar player={player} size="md" />
          {canEdit && (
            <label className="absolute -bottom-1 -right-1 w-5 h-5 bg-primary rounded-full flex items-center justify-center cursor-pointer hover:bg-primary/80 transition-colors">
              {uploading ? (
                <Loader2 className="w-3 h-3 text-white animate-spin" />
              ) : (
                <Camera className="w-3 h-3 text-white" />
              )}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={handleAvatarUpload}
                disabled={uploading}
              />
            </label>
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
              />
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="font-semibold text-sm truncate">
                  {player.firstName} {player.lastName}
                </span>
                {player.teamName && (
                  <span className="text-xs text-muted-foreground truncate">· {player.teamName}</span>
                )}
                {canEdit && (
                  <button onClick={() => setEditing(true)} className="shrink-0 opacity-40 hover:opacity-100 transition-opacity">
                    <Pencil className="w-3 h-3" />
                  </button>
                )}
              </div>
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

      <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
        {player.rankEmoji} {Math.round(player.eloRating)}
      </span>

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
