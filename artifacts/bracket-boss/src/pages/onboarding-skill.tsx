import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Show, useUser } from "@clerk/react";
import { useGetMyProfile } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { getNicknameApiErrorMessage, normalizeNickname, validateNickname, NICKNAME_MAX_LENGTH } from "@/lib/nickname";

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
  const { isSignedIn, user } = useUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);
  const [savingNickname, setSavingNickname] = useState(false);
  const [nickname, setNickname] = useState("");
  const [nicknameError, setNicknameError] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1);
  const nicknameRef = useRef<HTMLDivElement>(null);
  const skillRef = useRef<HTMLDivElement>(null);

  const { data: profile, isLoading } = useGetMyProfile({
    query: { retry: false, queryKey: ["myProfile"] },
  });

  useEffect(() => {
    if (isSignedIn === false) {
      setLocation("/sign-in");
    }
  }, [isSignedIn, setLocation]);

  useEffect(() => {
    if (!profile) return;
    setNickname(((profile as any).nickname ?? "") as string);
  }, [profile]);

  useEffect(() => {
    if (!firstName && user?.firstName) setFirstName(user.firstName);
    if (!lastName && user?.lastName) setLastName(user.lastName);
  }, [user, firstName, lastName]);

  const scrollToSection = (ref: React.RefObject<HTMLDivElement | null>) => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const continueFromName = async () => {
    const currentFirst = (user?.firstName ?? "").trim();
    const currentLast = (user?.lastName ?? "").trim();
    const hasClerkName = currentFirst.length > 0 && currentLast.length > 0;

    const desiredFirst = (firstName.trim() || currentFirst).trim();
    const desiredLast = (lastName.trim() || currentLast).trim();

    if (!hasClerkName && (!desiredFirst || !desiredLast)) {
      setNameError("First and last name are required to continue.");
      return;
    }

    setNameError(null);

    const shouldSaveName = desiredFirst !== currentFirst || desiredLast !== currentLast;
    if (shouldSaveName) {
      setSavingName(true);
      try {
        const res = await fetch("/api/profile/me/name", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ firstName: desiredFirst, lastName: desiredLast }),
        });

        if (!res.ok && user) {
          await user.update({ firstName: desiredFirst, lastName: desiredLast });
          await user.reload();
        } else if (!res.ok) {
          throw new Error("Failed to save name");
        }
      } catch {
        toast({
          title: "Could not save your name",
          description: "Please try again.",
          variant: "destructive",
        });
        setSavingName(false);
        return;
      }
      setSavingName(false);
    }

    setFirstName(desiredFirst);
    setLastName(desiredLast);
    setActiveStep((prev) => (prev < 2 ? 2 : prev));
    scrollToSection(nicknameRef);
  };

  const continueFromNickname = async () => {
    const validationError = validateNickname(nickname);
    if (validationError) {
      setNicknameError(validationError);
      toast({ title: validationError, variant: "destructive" });
      return;
    }

    const nextNickname = normalizeNickname(nickname);
    const currentNickname = (((profile as any)?.nickname ?? "") as string).trim();

    if (nextNickname !== currentNickname) {
      setSavingNickname(true);
      try {
        const res = await fetch("/api/profile/me/nickname", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nickname: nextNickname }),
        });

        if (!res.ok) {
          const message = await getNicknameApiErrorMessage(res);
          setNicknameError(message);
          toast({ title: message, variant: "destructive" });
          setSavingNickname(false);
          return;
        }

        await queryClient.invalidateQueries({ queryKey: ["myProfile"] });
      } catch {
        const message = "Couldn't save nickname. Please try again.";
        setNicknameError(message);
        toast({ title: message, variant: "destructive" });
        setSavingNickname(false);
        return;
      }
      setSavingNickname(false);
    }

    setNicknameError(null);
    setActiveStep((prev) => (prev < 3 ? 3 : prev));
    scrollToSection(skillRef);
  };

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
              <h1 className="text-2xl font-extrabold">Set up your player profile</h1>
              <p className="text-sm text-muted-foreground">
                We will walk through your name, optional nickname, then starting skill level.
              </p>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-border/50 p-4 space-y-3">
                <div className="space-y-1">
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Step 1 of 3</p>
                  <h2 className="text-lg font-extrabold">First and last name</h2>
                  <p className="text-sm text-muted-foreground">
                    If you signed up with Google, these are usually pre-filled.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="First name"
                    className="h-11 bg-muted/50 border-none"
                    disabled={savingName || !!saving}
                  />
                  <Input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Last name"
                    className="h-11 bg-muted/50 border-none"
                    disabled={savingName || !!saving}
                  />
                </div>

                {nameError && <p className="text-sm text-red-400">{nameError}</p>}

                <div className="flex justify-end">
                  <Button type="button" onClick={continueFromName} disabled={savingName || !!saving}>
                    {savingName ? <Loader2 className="w-4 h-4 animate-spin" /> : "Continue"}
                  </Button>
                </div>
              </div>

              <div
                ref={nicknameRef}
                className={`rounded-2xl border border-border/50 p-4 space-y-3 transition-opacity ${activeStep >= 2 ? "opacity-100" : "opacity-40 pointer-events-none"}`}
              >
                <div className="space-y-1">
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Step 2 of 3</p>
                  <h2 className="text-lg font-extrabold">Nickname <span className="text-sm font-medium text-muted-foreground">(optional)</span></h2>
                  <p className="text-sm text-muted-foreground">Choose what people will usually see across PB&J.</p>
                </div>

                <Input
                  value={nickname}
                  onChange={(e) => {
                    setNickname(e.target.value);
                    if (nicknameError) setNicknameError(null);
                  }}
                  placeholder="What should people call you?"
                  className="h-11 bg-muted/50 border-none"
                  maxLength={NICKNAME_MAX_LENGTH}
                  disabled={activeStep < 2 || !!saving || savingName || savingNickname}
                />

                {nicknameError && <p className="text-xs text-red-400">{nicknameError}</p>}

                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setNicknameError(null);
                      setActiveStep((prev) => (prev < 3 ? 3 : prev));
                      scrollToSection(skillRef);
                    }}
                    disabled={activeStep < 2 || !!saving || savingName || savingNickname}
                  >
                    Skip for now
                  </Button>
                  <Button type="button" variant="outline" onClick={continueFromNickname} disabled={activeStep < 2 || !!saving || savingName || savingNickname}>
                    {savingNickname ? <Loader2 className="w-4 h-4 animate-spin" /> : "Continue"}
                  </Button>
                </div>
              </div>
            </div>

            <div
              ref={skillRef}
              className={`rounded-2xl border border-border/50 p-4 space-y-3 transition-opacity ${activeStep >= 3 ? "opacity-100" : "opacity-40 pointer-events-none"}`}
            >
              <div className="space-y-1">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Step 3 of 3</p>
                <h2 className="text-lg font-extrabold">Choose your starting skill level</h2>
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
                      disabled={!!saving || activeStep < 3 || savingName}
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
        </div>
      </Show>
    </>
  );
}