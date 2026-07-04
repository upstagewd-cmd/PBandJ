import { useState, useRef, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import { 
  TournamentFull, 
  useUpdateTournament, 
  useStartTournament, 
  useJoinTournament, 
  useShufflePlayers, 
  useRemovePlayer 
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Copy, Users, Play, Shuffle, UserMinus, Lock, Unlock, Loader2, Check } from "lucide-react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";

interface LobbyProps {
  tournament: TournamentFull;
  hostToken: string | null;
}

const joinSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
});

export function TournamentLobby({ tournament, hostToken }: LobbyProps) {
  const { toast } = useToast();
  const isHost = !!hostToken;
  const shareUrl = `${window.location.origin}/t/${tournament.id}`;
  
  const [copied, setCopied] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [tournamentName, setTournamentName] = useState(tournament.name);
  
  const updateTournament = useUpdateTournament();
  const startTournament = useStartTournament();
  const joinTournament = useJoinTournament();
  const shufflePlayers = useShufflePlayers();
  const removePlayer = useRemovePlayer();

  const joinForm = useForm<z.infer<typeof joinSchema>>({
    resolver: zodResolver(joinSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
    },
  });

  // Sync name from server
  useEffect(() => {
    if (!isEditingName) {
      setTournamentName(tournament.name);
    }
  }, [tournament.name, isEditingName]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast({ title: "Link copied to clipboard!" });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleNameBlur = () => {
    setIsEditingName(false);
    if (tournamentName !== tournament.name && isHost) {
      updateTournament.mutate({
        tournamentId: tournament.id,
        data: { name: tournamentName, hostToken: hostToken! },
      }, {
        onError: () => {
          setTournamentName(tournament.name);
          toast({ title: "Failed to update name", variant: "destructive" });
        }
      });
    }
  };

  const onJoin = (values: z.infer<typeof joinSchema>) => {
    joinTournament.mutate({
      tournamentId: tournament.id,
      data: values,
    }, {
      onSuccess: () => {
        joinForm.reset();
        toast({ title: "Joined successfully!" });
      },
      onError: (err: any) => {
        toast({ 
          title: "Could not join", 
          description: err.message || "Registration might be locked.",
          variant: "destructive" 
        });
      }
    });
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Header / Name */}
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
        <p className="text-muted-foreground uppercase tracking-widest text-sm font-bold">Lobby Phase</p>
      </div>

      {/* Share Card */}
      <div className="bg-card border border-border/50 rounded-3xl p-6 shadow-xl flex flex-col items-center space-y-6">
        <div className="bg-white p-4 rounded-2xl shadow-sm">
          <QRCodeSVG value={shareUrl} size={160} level="H" includeMargin={false} />
        </div>
        
        <div className="w-full flex items-center space-x-2">
          <Input readOnly value={shareUrl} className="font-mono text-xs bg-muted border-none h-12" />
          <Button size="icon" className="h-12 w-12 shrink-0 rounded-xl" onClick={handleCopyLink}>
            {copied ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        
        {/* Players List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Users className="w-6 h-6 text-primary" />
              Players <span className="text-muted-foreground ml-2">({tournament.players.length})</span>
            </h2>
            
            {isHost && tournament.players.length > 1 && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => shufflePlayers.mutate({ tournamentId: tournament.id, data: { hostToken: hostToken! } })}
                disabled={shufflePlayers.isPending}
                className="font-bold uppercase tracking-wider text-xs"
              >
                <Shuffle className="w-4 h-4 mr-2" />
                Shuffle
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
                {tournament.players.map((p, i) => (
                  <li key={p.id} className="flex items-center justify-between bg-muted/50 rounded-xl p-3">
                    <div className="flex items-center gap-3">
                      <span className="text-muted-foreground font-mono text-sm w-4">{i + 1}</span>
                      <span className="font-bold text-lg">{p.firstName} {p.lastName}</span>
                    </div>
                    {isHost && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive shrink-0 h-8 w-8"
                        onClick={() => removePlayer.mutate({ tournamentId: tournament.id, playerId: p.id, data: { hostToken: hostToken! } })}
                      >
                        <UserMinus className="w-4 h-4" />
                      </Button>
                    )}
                  </li>
                ))}
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
                    <FormField
                      control={joinForm.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem>
                          <Label className="uppercase text-xs font-bold tracking-widest text-muted-foreground">First Name</Label>
                          <FormControl>
                            <Input placeholder="John" className="h-12 text-lg bg-muted/50 border-none focus-visible:ring-primary" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={joinForm.control}
                      name="lastName"
                      render={({ field }) => (
                        <FormItem>
                          <Label className="uppercase text-xs font-bold tracking-widest text-muted-foreground">Last Name</Label>
                          <FormControl>
                            <Input placeholder="Doe" className="h-12 text-lg bg-muted/50 border-none focus-visible:ring-primary" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button 
                      type="submit" 
                      className="w-full h-14 text-lg font-bold rounded-xl mt-4" 
                      disabled={joinTournament.isPending}
                    >
                      {joinTournament.isPending ? <Loader2 className="w-6 h-6 animate-spin" /> : "JOIN TOURNAMENT"}
                    </Button>
                  </form>
                </Form>
              </div>
            </>
          ) : (
            <div className="bg-muted/50 border border-border/50 rounded-3xl p-8 shadow-xl text-center space-y-4 flex flex-col items-center justify-center">
              <Lock className="w-12 h-12 text-muted-foreground" />
              <div>
                <h3 className="text-xl font-bold">Registration Locked</h3>
                <p className="text-muted-foreground">Waiting for host to start...</p>
              </div>
            </div>
          )}

          {isHost && (
            <div className="pt-4 border-t border-border/50 space-y-4">
              <h3 className="uppercase text-xs font-bold tracking-widest text-muted-foreground">Host Controls</h3>
              <div className="grid grid-cols-2 gap-3">
                <Button 
                  variant="outline" 
                  className="h-12 rounded-xl font-bold"
                  onClick={() => updateTournament.mutate({ 
                    tournamentId: tournament.id, 
                    data: { registrationLocked: !tournament.registrationLocked, hostToken: hostToken! } 
                  })}
                >
                  {tournament.registrationLocked ? (
                    <><Unlock className="w-4 h-4 mr-2" /> Unlock Join</>
                  ) : (
                    <><Lock className="w-4 h-4 mr-2" /> Lock Join</>
                  )}
                </Button>
                
                <Button 
                  className="h-12 rounded-xl font-bold bg-green-600 hover:bg-green-700 text-white"
                  disabled={tournament.players.length < 2 || startTournament.isPending}
                  onClick={() => startTournament.mutate({
                    tournamentId: tournament.id,
                    data: { hostToken: hostToken! }
                  })}
                >
                  {startTournament.isPending ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <><Play className="w-4 h-4 mr-2 fill-current" /> Start</>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
