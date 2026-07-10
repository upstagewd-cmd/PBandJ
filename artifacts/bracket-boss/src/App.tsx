import { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk, useUser } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { Switch, Route, useLocation, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { InstallBanner } from "@/components/ui/install-banner";
import { ThemeProvider } from "next-themes";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import TournamentPage from "@/pages/tournament";
import SessionPage from "@/pages/session";
import PlayerStatsPage from "@/pages/player-stats";
import ProfilePage from "@/pages/profile";
import AdminPage from "@/pages/admin/index";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

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
    cardBox: "bg-white border border-[#E9E7E1] rounded-2xl w-[440px] max-w-full shadow-xl",
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
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
        fallbackRedirectUrl={basePath || "/"}
        appearance={clerkAppearance}
      />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
        fallbackRedirectUrl={basePath || "/"}
        appearance={clerkAppearance}
      />
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
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />
      <Route path="/profile" component={ProfilePage} />
      <Route path="/admin" component={AdminPage} />
      <Route path="/t/:tournamentId" component={TournamentPage} />
      <Route path="/s/:sessionId" component={SessionPage} />
      <Route path="/player/:playerId" component={PlayerStatsPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
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
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <Router />
          <Toaster />
          <InstallBanner />
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
