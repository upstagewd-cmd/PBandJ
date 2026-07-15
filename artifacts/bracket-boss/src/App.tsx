import { useEffect, useRef, useState } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk, useUser } from "@clerk/react";
import { Switch, Route, useLocation, Router as WouterRouter } from "wouter";
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
import { authTrace, clearAuthTraceDump, getAuthTraceDump, isAuthTraceEnabled } from "@/lib/auth-trace";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const authUrlToken = "authv=1";
const signInUrlWithToken = `/sign-in?${authUrlToken}`;
const signUpUrlWithToken = `/sign-up?${authUrlToken}`;
const isProd = import.meta.env.PROD;
const clerkProxyUrl = `${basePath}/api/__clerk`;

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
}

function useAuthQueryNormalization(route: "sign-in" | "sign-up", setLocation: (to: string, options?: { replace?: boolean }) => void) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("authv") === "1") {
      setReady(true);
      return;
    }

    params.set("authv", "1");
    const next = `/${route}?${params.toString()}`;
    authTrace("auth.url.normalize", { route, to: next });
    setLocation(next, { replace: true });
  }, [route, setLocation]);

  return ready;
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
  const ready = useAuthQueryNormalization("sign-in", setLocation);

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
        {!ready ? (
          <div className="text-sm text-muted-foreground">Preparing secure sign in...</div>
        ) : (
        <SignIn
          routing="path"
          path="/sign-in"
          signUpUrl={signUpUrlWithToken}
          fallbackRedirectUrl="/"
          appearance={clerkAppearance}
        />
        )}
      </div>
    </div>
  );
}

function SignUpPage() {
  const [, setLocation] = useLocation();
  const ready = useAuthQueryNormalization("sign-up", setLocation);

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
        {!ready ? (
          <div className="text-sm text-muted-foreground">Preparing secure sign up...</div>
        ) : (
        <SignUp
          routing="path"
          path="/sign-up"
          signInUrl={signInUrlWithToken}
          forceRedirectUrl="/onboarding/skill"
          fallbackRedirectUrl="/"
          appearance={clerkAppearance}
        />
        )}
      </div>
    </div>
  );
}


function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  const isAuthOrOnboardingRoute = () => {
    const path = window.location.pathname;
    return path.includes("/sign-in") || path.includes("/sign-up") || path.includes("/onboarding/skill");
  };

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      authTrace("clerk.listener", {
        prevUserId: prevUserIdRef.current ?? null,
        nextUserId: userId,
      });
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        if (isAuthOrOnboardingRoute()) {
          authTrace("queryClient.clear.skipped", { reason: "auth-route", path: window.location.pathname });
        } else {
          authTrace("queryClient.clear", { reason: "user changed" });
          qc.clear();
        }
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function Router() {
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
      proxyUrl={isProd ? clerkProxyUrl : undefined}
      appearance={clerkAppearance}
        signInUrl={`${basePath}${signInUrlWithToken}`}
        signUpUrl={`${basePath}${signUpUrlWithToken}`}
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

function AuthTraceTools() {
  const [enabled, setEnabled] = useState(() => isAuthTraceEnabled());

  useEffect(() => {
    setEnabled(isAuthTraceEnabled());
  }, []);

  if (!enabled) return null;

  const copyTrace = async () => {
    const trace = getAuthTraceDump();
    const payload = JSON.stringify(trace, null, 2);

    try {
      await navigator.clipboard.writeText(payload);
      alert("Auth trace copied. Paste it in chat.");
    } catch {
      // Fallback for browsers with restricted clipboard APIs.
      window.prompt("Copy auth trace", payload);
    }
  };

  const clearTrace = () => {
    clearAuthTraceDump();
    alert("Auth trace cleared.");
  };

  return (
    <div className="fixed bottom-3 right-3 z-[9999] flex gap-2">
      <Button size="sm" variant="secondary" onClick={copyTrace}>
        Copy Trace
      </Button>
      <Button size="sm" variant="ghost" onClick={clearTrace}>
        Clear
      </Button>
    </div>
  );
}

function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <WouterRouter base={basePath}>
        <ClerkProviderWithRoutes />
        <AuthTraceTools />
      </WouterRouter>
    </ThemeProvider>
  );
}

export default App;
