import { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk, useUser } from "@clerk/react";
import { Switch, Route, useLocation, useSearch, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Toaster } from "@/components/ui/toaster";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "next-themes";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import TournamentPage from "@/pages/tournament";
import SessionPage from "@/pages/session";
import PlayerStatsPage from "@/pages/player-stats";
import PlayersPage from "@/pages/players";
import ProfilePage from "@/pages/profile";
import AdminPage from "@/pages/admin/index";
import OnboardingSkillPage from "@/pages/onboarding-skill";
import { useBadgeUnlockToasts } from "@/hooks/use-badge-unlock-toasts";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const clerkDomain = import.meta.env.VITE_CLERK_DOMAIN || "clerk.pbandjesus.app";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
}

const clerkAppearance = {
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo-favicon.png`,
  },
  variables: {
    colorPrimary: "#B7E334",
    colorForeground: "#111111",
    colorMutedForeground: "#737373",
    colorDanger: "#ef4444",
    colorBackground: "#ffffff",
    colorInput: "#f5f4f0",
    colorInputForeground: "#111111",
    colorNeutral: "#E9E7E1",
    fontFamily: "Inter, sans-serif",
    borderRadius: "0.75rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-white border border-[#E9E7E1] rounded-2xl w-[440px] max-w-full overflow-hidden shadow-xl",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-[#111111] font-bold",
    headerSubtitle: "text-[#737373]",
    socialButtonsBlockButtonText: "text-[#111111]",
    formFieldLabel: "text-[#2A2A2A]",
    footerActionLink: "text-[#111111] hover:text-[#2A2A2A]",
    footerActionText: "text-[#737373]",
    dividerText: "text-[#9ca3af]",
    identityPreviewEditButton: "text-[#111111]",
    formFieldSuccessText: "text-green-600",
    alertText: "text-[#111111]",
    logoBox: "flex justify-center",
    logoImage: "h-14 w-14 rounded-xl",
    socialButtonsBlockButton: "border-[#E9E7E1] bg-white hover:bg-[#f5f4f0]",
    formButtonPrimary: "!bg-[#B7E334] hover:!bg-[#a5cc2a] !text-[#111111] font-bold",
    formFieldInput: "bg-white border-[#E9E7E1] text-[#111111] focus:border-[#B7E334]",
    footerAction: "bg-[#f5f4f0]",
    dividerLine: "bg-[#E9E7E1]",
    alert: "bg-[#f5f4f0] border-[#E9E7E1]",
    otpCodeFieldInput: "bg-white border-[#E9E7E1] text-[#111111]",
    formFieldRow: "",
    main: "",
  },
};

function SignInPage() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const next = new URLSearchParams(search).get("next")?.trim() ?? "";
  const nextPath = next.startsWith("/") ? next : "";
  const signUpUrl = `${basePath}/sign-up${next ? `?next=${encodeURIComponent(next)}` : ""}`;

  const handleBack = () => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }

    setLocation("/");
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background px-4 py-4">
      <div className="mx-auto w-full max-w-[440px]">
        <Button variant="ghost" size="sm" onClick={handleBack} className="mb-4 gap-2 px-0 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      </div>
      <div className="flex flex-1 items-center justify-center">
        <SignIn
          routing="path"
          path={`${basePath}/sign-in`}
          signUpUrl={signUpUrl}
          forceRedirectUrl={nextPath || undefined}
          fallbackRedirectUrl={basePath || "/"}
          appearance={clerkAppearance}
        />
      </div>
    </div>
  );
}

function SignUpPage() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const next = new URLSearchParams(search).get("next")?.trim() ?? "";
  const signInUrl = `${basePath}/sign-in${next ? `?next=${encodeURIComponent(next)}` : ""}`;
  const onboardingUrl = `${basePath}/onboarding/skill${next ? `?next=${encodeURIComponent(next)}` : ""}`;

  const handleBack = () => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }

    setLocation("/");
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background px-4 py-4">
      <div className="mx-auto w-full max-w-[440px]">
        <Button variant="ghost" size="sm" onClick={handleBack} className="mb-4 gap-2 px-0 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      </div>
      <div className="flex flex-1 items-center justify-center">
        <SignUp
          routing="path"
          path={`${basePath}/sign-up`}
          signInUrl={signInUrl}
          forceRedirectUrl={onboardingUrl}
          appearance={clerkAppearance}
        />
      </div>
    </div>
  );
}


function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function Router() {
  useBadgeUnlockToasts();

  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/sign-in/*?" component={SignInPage} />     
<Route path="/sign-up/*?" component={SignUpPage} />
  <Route path="/onboarding/skill" component={OnboardingSkillPage} />
      <Route path="/profile" component={ProfilePage} />
      <Route path="/admin" component={AdminPage} />
      <Route path="/t/:tournamentId" component={TournamentPage} />
      <Route path="/s/:sessionId" component={SessionPage} />
      <Route path="/players" component={PlayersPage} />
      <Route path="/player/:playerId" component={PlayerStatsPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function ClerkProviderWithRoutes() {
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      domain={clerkDomain}
      isSatellite={false}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      signInFallbackRedirectUrl={basePath || "/"}
      signUpFallbackRedirectUrl={basePath || "/"}
      signUpForceRedirectUrl={`${basePath}/onboarding/skill`}
      localization={{
        signIn: {
          start: {
            title: "Welcome back",
            subtitle: "Faith. Fellowship. Friendly Competition.",
          },
        },
        signUp: {
          start: {
            title: "Join PB&J",
            subtitle: "Create your player profile",
          },
        },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <Router />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <WouterRouter base={basePath}>
        <ClerkProviderWithRoutes />
      </WouterRouter>
    </ThemeProvider>
  );
}

export default App;
