import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Show, useUser } from "@clerk/react";
import { useGetMyProfile } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const SKILL_OPTIONS = [
  {
    value: "beginner",
    label: "Beginner",
    emoji: "🟢",
    description: "New to pickleball",
  },
  {
    value: "intermediate",
    label: "Intermediate",
    emoji: "🔵",
    description: "Comfortable with doubles",
  },
  {
    value: "advanced",
    label: "Advanced",
    emoji: "🔴",
    description: "Experienced competitor",
  },
] as const;

export default function OnboardingSkillPage() {
  const [, setLocation] = useLocation();
  const { isSignedIn } = useUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState<string | null>(null);

  const { data: profile, isLoading } = useGetMyProfile({
    query: { retry: false, queryKey: ["myProfile"] },
  });
  const profileSkillLevel = (profile as any)?.skillLevel as string | null | undefined;

  useEffect(() => {
    if (isSignedIn === false) {
      setLocation("/sign-in");
    }
  }, [isSignedIn, setLocation]);

  useEffect(() => {
    if (!isLoading && profile && profileSkillLevel) {
      setLocation("/");
    }
  }, [isLoading, profile, profileSkillLevel, setLocation]);

  const handleSelect = async (skillLevel: "beginner" | "intermediate" | "advanced") => {
    setSaving(skillLevel);
    try {
      const res = await fetch("/api/profile/me/skill", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skillLevel }),
      });

      if (!res.ok) {
        throw new Error("Failed to save skill level");
      }

      await queryClient.invalidateQueries({ queryKey: ["myProfile"] });
      setLocation("/");
    } catch {
      toast({
        title: "Could not save skill level",
        description: "Try again, or contact an admin if this keeps happening.",
        variant: "destructive",
      });
    } finally {
      setSaving(null);
    }
  };

  return (
    <>
      <Show when="signed-in">
        <div className="min-h-[100dvh] w-full px-4 py-8 max-w-xl mx-auto flex items-center">
          <div className="w-full bg-card border border-border/50 rounded-3xl p-6 shadow-xl space-y-5">
            <div className="space-y-1 text-center">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Welcome to PB&J</p>
              <h1 className="text-2xl font-extrabold">Choose your starting skill level</h1>
              <p className="text-sm text-muted-foreground">
                This sets your starting ELO. You can ask an admin to change it later.
              </p>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-6 text-muted-foreground gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading...
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {SKILL_OPTIONS.map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    variant="outline"
                    className="h-auto py-4 px-4 flex flex-col items-center gap-1 rounded-2xl"
                    disabled={!!saving}
                    onClick={() => handleSelect(option.value)}
                  >
                    {saving === option.value ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <span className="text-xl">{option.emoji}</span>
                    )}
                    <span className="font-bold">{option.label}</span>
                    <span className="text-[11px] text-muted-foreground text-center leading-tight">
                      {option.description}
                    </span>
                  </Button>
                ))}
              </div>
            )}
          </div>
        </div>
      </Show>
    </>
  );
}