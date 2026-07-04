import { useState } from "react";
import { useLocation } from "wouter";
import { useCreateTournament } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trophy } from "lucide-react";

export default function Home() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createTournament = useCreateTournament();

  const handleCreate = () => {
    createTournament.mutate(
      { data: { name: "New Tournament" } },
      {
        onSuccess: (data) => {
          localStorage.setItem(`hostToken_${data.id}`, data.hostToken);
          setLocation(`/t/${data.id}`);
        },
        onError: () => {
          toast({
            title: "Error",
            description: "Failed to create tournament. Please try again.",
            variant: "destructive",
          });
        },
      }
    );
  };

  return (
    <div className="min-h-[100dvh] w-full flex flex-col items-center justify-center p-6 text-center space-y-8 relative overflow-hidden">
      {/* Dynamic Background Elements */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/20 blur-[120px] rounded-full pointer-events-none" />
      
      <div className="relative z-10 space-y-6 max-w-md w-full">
        <div className="mx-auto w-24 h-24 bg-primary/10 rounded-3xl flex items-center justify-center border border-primary/20 shadow-[0_0_40px_rgba(255,100,50,0.2)]">
          <Trophy className="w-12 h-12 text-primary" />
        </div>
        
        <div className="space-y-2">
          <h1 className="text-5xl font-extrabold tracking-tight italic">
            BRACKET <span className="text-primary">BOSS</span>
          </h1>
          <p className="text-muted-foreground text-lg font-medium">
            The fastest way to run IRL tournaments.
          </p>
        </div>

        <Button
          size="lg"
          className="w-full h-16 text-xl font-bold rounded-2xl transition-transform active:scale-95 shadow-[0_0_20px_rgba(255,100,50,0.3)] hover:shadow-[0_0_30px_rgba(255,100,50,0.4)]"
          onClick={handleCreate}
          disabled={createTournament.isPending}
        >
          {createTournament.isPending ? (
            <Loader2 className="mr-2 h-6 w-6 animate-spin" />
          ) : (
            "CREATE TOURNAMENT"
          )}
        </Button>
      </div>
    </div>
  );
}
