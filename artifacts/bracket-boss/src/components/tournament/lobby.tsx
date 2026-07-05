import { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  TournamentFull,
  useUpdateTournament,
  useStartTournament,
  useJoinTournament,
  useShufflePlayers,
  useRemovePlayer,
  useUpdatePlayer,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Copy,
  Users,
  Play,
  Shuffle,
  UserMinus,
  Lock,
  Unlock,
  Loader2,
  Check,
  Shield,
  Link,
  Pencil,
  X,
  Camera,
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

const joinSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  partnerName: z.string().optional(),
  teamName: z.string().optional(),
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

export function TournamentLobby({ tournament, hostToken }: LobbyProps) {
  const { toast } = useToast();
  const isHost = !!hostToken;

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
  const shufflePlayers = useShufflePlayers();
  const removePlayer = useRemovePlayer();

  const joinForm = useForm<z.infer<typeof joinSchema>>({
    resolver: zodResolver(joinSchema),
    defaultValues: { firstName: "", lastName: "", partnerName: "", teamName: "" },
  });

  useEffect(() => {
    if (!isEditingName) setTournamentName(tournament.name);
  }, [tournament.name, isEditingName]);

  const handleNameBlur = () => {
    setIsEditingName(false);
    if (tournamentName !== tournament.name && isHost) {
      updateTournament.mutate(
        { tournamentId: tournament.id, data: { name: tournamentName, hostToken: hostToken! } },
        {
          onError: () => {
            setTournamentName(tournament.name);
            toast({ title: "Failed to update name", variant: "destructive" });
          },
        }
      );
    }
  };

  // Preview the auto-generated team name as user types
  const watchedFirst = joinForm.watch("firstName");
  const watchedLast = joinForm.watch("lastName");
  const watchedPartner = joinForm.watch("partnerName");
  const watchedTeam = joinForm.watch("teamName");

  const autoTeamName = (() => {
    if (watchedTeam?.trim()) return null; // user typed their own
    if (!watchedFirst.trim() || !watchedLast.trim()) return null;
    const p1Last = watchedLast.charAt(0).toUpperCase() + ".";
    const p1Name = `${watchedFirst.trim()} ${p1Last}`;
    if (watchedPartner?.trim()) {
      const parts = watchedPartner.trim().split(/\s+/);
      const partnerFirst = parts[0];
      const partnerLast = parts.length > 1 ? parts[parts.length - 1].charAt(0).toUpperCase() + "." : "";
      return partnerLast ? `${p1Name} + ${partnerFirst} ${partnerLast}` : `${p1Name} + ${partnerFirst}`;
    }
    return `${watchedFirst.trim()} ${watchedLast.trim()}`;
  })();

  const onJoin = (values: z.infer<typeof joinSchema>) => {
    joinTournament.mutate(
      {
        tournamentId: tournament.id,
        data: {
          firstName: values.firstName,
          lastName: values.lastName,
          partnerName: values.partnerName || undefined,
          teamName: values.teamName || undefined,
        },
      },
      {
        onSuccess: (data: any) => {
          if (data?.playerToken) {
            localStorage.setItem(`playerToken_${tournament.id}_${data.id}`, data.playerToken);
          }
          joinForm.reset();
          toast({ title: "Joined! You can edit your team name anytime." });
        },
        onError: (err: any) => {
          toast({
            title: "Could not join",
            description: err.message || "Registration might be locked.",
            variant: "destructive",
          });
        },
      }
    );
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* Header */}
      <div className="text-center space-y-2">
        {isHost ? (
          <input
            className="text-4xl font-extrabold tracking-tight bg-transparent text-center border-none outline-none w-full focus:ring-0 text-primary"
            value={tournamentName}
            onChange={(e) => setTournamentName(e.target.value)}
            onFocus={() => setIsEditingName(true)}
            onBlur={handleNameBlur}
          />
        ) : (
          <h1 className="text-4xl font-extrabold tracking-tight text-primary">{tournament.name}</h1>
        )}
        <p className="text-muted-foreground uppercase tracking-widest text-sm font-bold">
          Double Elimination · Lobby
        </p>
      </div>

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
            {isHost && tournament.players.length > 1 && (
              <Button
                variant="outline" size="sm"
                onClick={() => shufflePlayers.mutate({ tournamentId: tournament.id, data: { hostToken: hostToken! } })}
                disabled={shufflePlayers.isPending}
                className="font-bold uppercase tracking-wider text-xs"
              >
                <Shuffle className="w-4 h-4 mr-2" /> Shuffle
              </Button>
            )}
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
                      isHost={isHost}
                      hostToken={hostToken}
                      onRemove={() =>
                        removePlayer.mutate({
                          tournamentId: tournament.id,
                          playerId: p.id,
                          data: { hostToken: hostToken! },
                        })
                      }
                    />
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Join / Host Controls */}
        <div className="space-y-4">
          {!tournament.registrationLocked ? (
            <>
              <h2 className="text-2xl font-bold">Join Match</h2>
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

                    <FormField control={joinForm.control} name="partnerName" render={({ field }) => (
                      <FormItem>
                        <Label className="uppercase text-xs font-bold tracking-widest text-muted-foreground">
                          Partner Name <span className="normal-case tracking-normal font-normal text-muted-foreground/60">(optional)</span>
                        </Label>
                        <FormControl>
                          <Input placeholder="Jane Doe" className="h-11 bg-muted/50 border-none" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={joinForm.control} name="teamName" render={({ field }) => (
                      <FormItem>
                        <Label className="uppercase text-xs font-bold tracking-widest text-muted-foreground">
                          Team Name <span className="normal-case tracking-normal font-normal text-muted-foreground/60">(optional)</span>
                        </Label>
                        <FormControl>
                          <Input placeholder={autoTeamName ?? "The Dream Team"} className="h-11 bg-muted/50 border-none" {...field} />
                        </FormControl>
                        {autoTeamName && !watchedTeam?.trim() && (
                          <p className="text-xs text-muted-foreground">
                            Will use: <span className="font-bold text-foreground">{autoTeamName}</span>
                          </p>
                        )}
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

          {isHost && (
            <div className="pt-4 border-t border-border/50 space-y-3">
              <h3 className="uppercase text-xs font-bold tracking-widest text-muted-foreground">Host Controls</h3>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="outline" className="h-12 rounded-xl font-bold"
                  onClick={() =>
                    updateTournament.mutate({
                      tournamentId: tournament.id,
                      data: { registrationLocked: !tournament.registrationLocked, hostToken: hostToken! },
                    })
                  }
                >
                  {tournament.registrationLocked
                    ? <><Unlock className="w-4 h-4 mr-2" /> Unlock Join</>
                    : <><Lock className="w-4 h-4 mr-2" /> Lock Join</>
                  }
                </Button>
                <Button
                  className="h-12 rounded-xl font-bold bg-green-600 hover:bg-green-700 text-white"
                  disabled={tournament.players.length < 4 || startTournament.isPending}
                  onClick={() => startTournament.mutate({ tournamentId: tournament.id, data: { hostToken: hostToken! } })}
                >
                  {startTournament.isPending
                    ? <Loader2 className="w-5 h-5 animate-spin" />
                    : <><Play className="w-4 h-4 mr-2 fill-current" /> Start</>
                  }
                </Button>
              </div>
              {tournament.players.length < 4 && (
                <p className="text-xs text-muted-foreground text-center">
                  Double elimination requires at least 4 players ({4 - tournament.players.length} more needed)
                </p>
              )}
            </div>
          )}
        </div>
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

function PlayerRow({ player, index, tournamentId, myToken, isHost, onRemove }: PlayerRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(player.teamName ?? "");
  const [uploading, setUploading] = useState(false);
  const updatePlayer = useUpdatePlayer();
  const { toast } = useToast();

  const canEdit = !!myToken;

  const saveTeamName = () => {
    if (!myToken) return;
    setEditing(false);
    if (draft === (player.teamName ?? "")) return;
    updatePlayer.mutate(
      { tournamentId, playerId: player.id, data: { playerToken: myToken, teamName: draft } },
      {
        onError: () => {
          toast({ title: "Couldn't save team name", variant: "destructive" });
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
      // Step 1: Request presigned upload URL
      const urlRes = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!urlRes.ok) throw new Error("Failed to get upload URL");
      const { uploadURL, objectPath } = await urlRes.json();

      // Step 2: Upload directly to GCS
      const uploadRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!uploadRes.ok) throw new Error("Upload failed");

      // Step 3: Save objectPath as avatarUrl on the player
      updatePlayer.mutate(
        { tournamentId, playerId: player.id, data: { playerToken: myToken, avatarUrl: objectPath } },
        { onError: () => toast({ title: "Couldn't save avatar", variant: "destructive" }) }
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

        {/* Avatar */}
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
                placeholder="Team name..."
                className="h-8 text-sm bg-background border-primary/40"
              />
              <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={saveTeamName}>
                <Check className="w-4 h-4 text-primary" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => { setEditing(false); setDraft(player.teamName ?? ""); }}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="min-w-0">
                {player.teamName && (
                  <p className="font-extrabold text-sm text-primary truncate">{player.teamName}</p>
                )}
                <p className={`font-bold truncate ${player.teamName ? "text-xs text-muted-foreground" : "text-base"}`}>
                  {player.firstName} {player.lastName}
                  {(player as any).partnerName && (
                    <span className="text-muted-foreground"> &amp; {(player as any).partnerName}</span>
                  )}
                </p>
                {(player as any).rankTitle && (
                  <p className="text-[10px] text-muted-foreground font-medium">
                    {(player as any).rankEmoji} {(player as any).rankTitle}
                  </p>
                )}
              </div>
              {canEdit && (
                <Button
                  size="icon" variant="ghost"
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-primary"
                  onClick={() => { setDraft(player.teamName ?? ""); setEditing(true); }}
                >
                  <Pencil className="w-3 h-3" />
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
      {isHost && (
        <Button
          variant="ghost" size="icon"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive shrink-0 h-8 w-8"
          onClick={onRemove}
        >
          <UserMinus className="w-4 h-4" />
        </Button>
      )}
    </li>
  );
}
