import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { useTheme } from "@/hooks/use-theme";
import { useRegisterSW } from "virtual:pwa-register/react";

import { Layout } from "@/components/layout";
import Home from "@/pages/home";
import History from "@/pages/history";
import Deliveries from "@/pages/deliveries";
import SettingsPage from "@/pages/settings";
import Photos from "@/pages/photos";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 3 * 60 * 1000,       // 3 minutes before refetch
      gcTime: 24 * 60 * 60 * 1000,    // Keep cache 24 hours
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

function Router() {
  return (
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
  );
}

function App() {
  useTheme();
  useBatchVersionSync();
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
        <PwaUpdateBanner />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
