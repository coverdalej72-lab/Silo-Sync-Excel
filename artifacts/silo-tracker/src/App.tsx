import { useEffect, useRef } from "react";
import { Switch, Route, Router as WouterRouter, useLocation, Redirect } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { useTheme } from "@/hooks/use-theme";
import { useRegisterSW } from "virtual:pwa-register/react";
import { ClerkProvider, Show, useClerk, useUser, useAuth } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { setAuthTokenGetter } from "@workspace/api-client-react";

import { Layout } from "@/components/layout";
import Home from "@/pages/home";
import History from "@/pages/history";
import Deliveries from "@/pages/deliveries";
import SettingsPage from "@/pages/settings";
import Photos from "@/pages/photos";
import OpsDashboard from "@/pages/ops-dashboard";
import OpsSettings from "@/pages/ops-settings";
import SignInPage from "@/pages/sign-in";
import SignUpPage from "@/pages/sign-up";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 3 * 60 * 1000,
      gcTime: 24 * 60 * 60 * 1000,
      retry: 1,
      retryDelay: 2000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
  },
});

const BATCH_LOCAL_KEYS = [
  "silo-batch-catches",
  "silo-batch-farm-name",
  "silo-morts-log",
  "silo-culls-log",
];

function useBatchVersionSync() {
  useEffect(() => {
    const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
    fetch(`${BASE}/api/batch/version`)
      .then(r => r.ok ? r.json() : null)
      .then((data: { version: string | null } | null) => {
        if (!data || !data.version) return;
        const stored = localStorage.getItem("silo-batch-version");
        if (stored !== data.version) {
          BATCH_LOCAL_KEYS.forEach(k => localStorage.removeItem(k));
          localStorage.setItem("silo-batch-version", data.version);
        }
      })
      .catch(() => {});
  }, []);
}

function PwaUpdateBanner() {
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    <div style={{
      position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
      zIndex: 9999, display: "flex", alignItems: "center", gap: 12,
      background: "#1a5c36", color: "#fff", borderRadius: 12,
      padding: "12px 20px", boxShadow: "0 4px 24px rgba(0,0,0,0.28)",
      fontSize: 14, fontWeight: 600, whiteSpace: "nowrap",
    }}>
      <span>🔄 Update available</span>
      <button
        onClick={() => updateServiceWorker(true)}
        style={{
          background: "#C9A227", color: "#000", border: "none", borderRadius: 7,
          padding: "6px 16px", fontWeight: 800, fontSize: 13, cursor: "pointer",
        }}
      >
        Refresh now
      </button>
    </div>
  );
}

function RedirectHome() {
  const [, setLocation] = useLocation();
  useEffect(() => { setLocation("/"); }, [setLocation]);
  return null;
}

function ClerkTokenSync() {
  const { getToken } = useAuth();

  useEffect(() => {
    setAuthTokenGetter(() => getToken());
    return () => {
      setAuthTokenGetter(null);
    };
  }, [getToken]);

  return null;
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

function SignInGate({ children }: { children: React.ReactNode }) {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  return (
    <>
      <Show when="signed-in">
        {children}
      </Show>
      <Show when="signed-out">
        <Redirect to={`${basePath}/sign-in`} />
      </Show>
    </>
  );
}

function OpsGate({ children }: { children: React.ReactNode }) {
  // TEMP: auth bypassed for preview — re-enable before going live
  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      {/* Auth pages */}
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />

      {/* Ops dashboard — operator only, no farm-manager chrome */}
      <Route path="/ops/settings">
        <OpsGate>
          <WouterRouter base="/ops">
            <OpsSettings />
          </WouterRouter>
        </OpsGate>
      </Route>
      <Route path="/ops">
        <OpsGate>
          <WouterRouter base="/ops">
            <OpsDashboard />
          </WouterRouter>
        </OpsGate>
      </Route>

      {/* Farm manager app — requires sign-in */}
      <Route>
        <SignInGate>
          <Layout>
            <Switch>
              <Route path="/" component={Home} />
              <Route path="/history" component={History} />
              <Route path="/deliveries" component={Deliveries} />
              <Route path="/photos" component={Photos} />
              <Route path="/settings" component={SettingsPage} />
              <Route path="/record" component={RedirectHome} />
              <Route path="/silos" component={RedirectHome} />
              <Route component={NotFound} />
            </Switch>
          </Layout>
        </SignInGate>
      </Route>
    </Switch>
  );
}

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "#1a7a40",
    colorForeground: "#0d1f14",
    colorMutedForeground: "#4d7060",
    colorDanger: "#dc2626",
    colorBackground: "#ffffff",
    colorInput: "#f0f5f2",
    colorInputForeground: "#0d1f14",
    colorNeutral: "#6b9178",
    fontFamily: "'Inter', sans-serif",
    borderRadius: "0.75rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-white rounded-2xl w-[440px] max-w-full overflow-hidden shadow-xl",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-[#0d1f14] font-semibold",
    headerSubtitle: "text-[#4d7060]",
    socialButtonsBlockButtonText: "text-[#0d1f14] font-medium",
    formFieldLabel: "text-[#0d1f14] font-medium",
    footerActionLink: "text-[#1a7a40] hover:text-[#155f32] font-medium",
    footerActionText: "text-[#4d7060]",
    dividerText: "text-[#4d7060]",
    identityPreviewEditButton: "text-[#1a7a40]",
    formFieldSuccessText: "text-[#1a7a40]",
    alertText: "text-[#0d1f14]",
    logoBox: "flex justify-center mb-1",
    logoImage: "h-12 w-12",
    socialButtonsBlockButton: "border-[#d1e8da] hover:bg-[#f0f5f2]",
    formButtonPrimary: "bg-[#1a7a40] hover:bg-[#155f32] text-white",
    formFieldInput: "bg-[#f0f5f2] border-[#c5ddd0] text-[#0d1f14]",
    footerAction: "bg-[#f5faf7]",
    dividerLine: "bg-[#d1e8da]",
    alert: "bg-[#f0f5f2] border-[#c5ddd0]",
    otpCodeFieldInput: "bg-[#f0f5f2] border-[#c5ddd0] text-[#0d1f14]",
    formFieldRow: "",
    main: "",
  },
};

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
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
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
      localization={{
        signIn: { start: { title: "Sign in to Farm Buddy" } },
        signUp: { start: { title: "Create your Farm Buddy account" } },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkTokenSync />
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <Router />
          <Toaster />
          <PwaUpdateBanner />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  useTheme();
  useBatchVersionSync();
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
