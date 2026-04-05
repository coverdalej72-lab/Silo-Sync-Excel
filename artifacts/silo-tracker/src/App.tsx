import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { useTheme } from "@/hooks/use-theme";

import { Layout } from "@/components/layout";
import Home from "@/pages/home";
import History from "@/pages/history";
import Deliveries from "@/pages/deliveries";
import SettingsPage from "@/pages/settings";
import Photos from "@/pages/photos";

const queryClient = new QueryClient();

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

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/history" component={History} />
        <Route path="/deliveries" component={Deliveries} />
        <Route path="/photos" component={Photos} />
        <Route path="/settings" component={SettingsPage} />
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
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
