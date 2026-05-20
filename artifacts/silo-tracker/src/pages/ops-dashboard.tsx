import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { Settings, Plus, LayoutGrid, ChevronLeft, ChevronRight, RefreshCw, ShieldCheck, Loader2 } from "lucide-react";
import { useUser, useAuth } from "@clerk/react";
import OpsFarmCard from "@/components/OpsFarmCard";
import { useFarms, type Farm } from "@/hooks/useFarms";
import { useFarmData } from "@/hooks/useFarmData";
import { cn } from "@/lib/utils";

// ── Per-farm fetcher ─────────────────────────────────────────────────────────

function FarmDataWrapper({ farm }: { farm: Farm }) {
  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
  const apiUrl = `${BASE}/api`;
  const data = useFarmData(apiUrl, farm.id);
  return (
    <OpsFarmCard
      name={farm.name}
      planTier={farm.planTier}
      apiUrl={apiUrl}
      data={data}
      onRefresh={data.refresh}
    />
  );
}

// ── Carousel ─────────────────────────────────────────────────────────────────

function FarmCarousel({ farms }: { farms: Farm[] }) {
  const [current, setCurrent] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const count = farms.length;

  const prev = () => setCurrent(i => Math.max(0, i - 1));
  const next = () => setCurrent(i => Math.min(count - 1, i + 1));

  const onTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const delta = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(delta) > 40) { if (delta > 0) next(); else prev(); }
    touchStartX.current = null;
  };

  return (
    <div className="relative w-full">
      <div className="overflow-hidden" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div
          className="flex transition-transform duration-300 ease-in-out"
          style={{ transform: `translateX(-${current * 100}%)` }}
        >
          {farms.map(farm => (
            <div key={farm.id} className="min-w-full px-0 sm:px-4" style={{ maxWidth: "100%" }}>
              <div className="max-w-2xl mx-auto">
                <FarmDataWrapper farm={farm} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {count > 1 && (
        <>
          <button
            onClick={prev}
            disabled={current === 0}
            aria-label="Previous farm"
            className={cn(
              "absolute left-0 sm:-left-5 top-1/2 -translate-y-1/2 z-10",
              "w-9 h-9 rounded-full flex items-center justify-center shadow-md",
              "bg-card border border-border text-foreground transition-all hover:bg-secondary",
              current === 0 && "opacity-30 cursor-not-allowed"
            )}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={next}
            disabled={current === count - 1}
            aria-label="Next farm"
            className={cn(
              "absolute right-0 sm:-right-5 top-1/2 -translate-y-1/2 z-10",
              "w-9 h-9 rounded-full flex items-center justify-center shadow-md",
              "bg-card border border-border text-foreground transition-all hover:bg-secondary",
              current === count - 1 && "opacity-30 cursor-not-allowed"
            )}
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </>
      )}

      {count > 1 && (
        <div className="flex items-center justify-center mt-5 overflow-x-auto gap-1.5 pb-1 scrollbar-none">
          {farms.map((farm, i) => (
            <button
              key={farm.id}
              onClick={() => setCurrent(i)}
              aria-label={`Go to ${farm.name}`}
              className={cn(
                "shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 whitespace-nowrap border",
                i === current
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-card text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
              )}
            >
              {farm.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Bootstrap card — shown when signed-in user is not yet an operator ─────────

function BootstrapOperatorCard() {
  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
  const { user } = useUser();
  const { getToken } = useAuth();
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "conflict" | "error">("idle");
  const [message, setMessage] = useState("");

  const claim = async () => {
    setStatus("loading");
    try {
      const token = await getToken();
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`${BASE}/api/bootstrap/first-operator`, { method: "POST", headers });
      const data = await res.json() as { ok?: boolean; message?: string; error?: string };
      if (res.status === 201) {
        setStatus("success");
        setMessage(data.message ?? "Operator role granted. Reload to continue.");
      } else if (res.status === 409) {
        setStatus("conflict");
        setMessage(data.error ?? "An operator already exists.");
      } else {
        setStatus("error");
        setMessage(data.error ?? "Something went wrong.");
      }
    } catch {
      setStatus("error");
      setMessage("Network error — please try again.");
    }
  };

  if (status === "success") {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-6 text-center">
        <div className="w-20 h-20 rounded-2xl bg-green-500/10 flex items-center justify-center">
          <ShieldCheck className="w-10 h-10 text-green-500" />
        </div>
        <div>
          <p className="text-xl font-bold text-foreground mb-2">Operator access granted</p>
          <p className="text-muted-foreground text-sm max-w-sm">{message}</p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="flex items-center gap-2 px-5 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 transition-colors shadow-sm"
        >
          <RefreshCw className="w-4 h-4" />
          Reload App
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-[60vh] gap-6 text-center">
      <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center">
        <ShieldCheck className="w-10 h-10 text-primary/40" />
      </div>
      <div>
        <p className="text-xl font-bold text-foreground mb-2">Set up your operator account</p>
        <p className="text-muted-foreground text-sm max-w-sm">
          {user?.primaryEmailAddress?.emailAddress
            ? <>Signed in as <strong className="text-foreground">{user.primaryEmailAddress.emailAddress}</strong>. </>
            : null}
          Claim the operator role to start provisioning farms and inviting managers.
        </p>
      </div>

      {status === "conflict" && (
        <div className="max-w-sm bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-800 text-sm">
          {message}
        </div>
      )}
      {status === "error" && (
        <div className="max-w-sm bg-red-50 border border-red-200 rounded-xl p-4 text-red-800 text-sm">
          {message}
        </div>
      )}

      {status !== "conflict" && (
        <button
          onClick={claim}
          disabled={status === "loading"}
          className="flex items-center gap-2 px-5 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 disabled:opacity-60 transition-colors shadow-sm"
        >
          {status === "loading"
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Claiming…</>
            : <><ShieldCheck className="w-4 h-4" /> Claim Operator Role</>}
        </button>
      )}

      <p className="text-xs text-muted-foreground max-w-xs">
        This one-time setup only works before any operator has been provisioned.
        After that, an existing operator must grant access via Manage Farms.
      </p>
    </div>
  );
}

// ── Dashboard page ───────────────────────────────────────────────────────────

export default function OpsDashboard() {
  useEffect(() => { document.title = "Farm Buddy™ — Operations"; }, []);
  const { farms, loading, error, refresh } = useFarms();
  const { user, isLoaded: userLoaded } = useUser();
  const [, navigate] = useLocation();
  const count = farms.length;

  const isOperator = userLoaded &&
    (user?.publicMetadata as Record<string, unknown> | undefined)?.role === "operator";

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Topbar */}
      <header className="sticky top-0 z-30 bg-primary border-b border-primary/20 shadow-sm">
        <div className="max-w-screen-xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary-foreground/15 flex items-center justify-center text-primary-foreground font-extrabold text-sm tracking-tight">
              FB
            </div>
            <div>
              <span className="text-primary-foreground font-bold text-base leading-none">Farm Buddy™</span>
              <span className="ml-2 text-primary-foreground/50 text-xs font-medium">Operations</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isOperator && (
              <>
                <button
                  onClick={refresh}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary-foreground/10 hover:bg-primary-foreground/20 text-primary-foreground text-xs font-semibold transition-colors"
                  title="Refresh farms"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
                <span className="hidden sm:inline-flex items-center gap-1.5 text-primary-foreground/60 text-xs font-medium px-3 py-1.5 rounded-full bg-primary-foreground/10">
                  <LayoutGrid className="w-3.5 h-3.5" />
                  {count} {count === 1 ? "Farm" : "Farms"}
                </span>
                <button
                  onClick={() => navigate("/settings")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary-foreground/10 hover:bg-primary-foreground/20 text-primary-foreground text-xs font-semibold transition-colors"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Manage Farms</span>
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 max-w-screen-xl mx-auto w-full px-6 py-6">
        {!userLoaded ? (
          <div className="flex items-center justify-center h-[60vh]">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : !isOperator ? (
          <BootstrapOperatorCard />
        ) : loading ? (
          <div className="flex items-center justify-center h-[60vh]">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-[60vh] gap-4 text-center">
            <p className="text-destructive font-semibold">{error}</p>
            <button onClick={refresh} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-bold">
              Retry
            </button>
          </div>
        ) : count === 0 ? (
          <div className="flex flex-col items-center justify-center h-[60vh] gap-6 text-center">
            <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center">
              <LayoutGrid className="w-10 h-10 text-primary/40" />
            </div>
            <div>
              <p className="text-xl font-bold text-foreground mb-2">No farms provisioned</p>
              <p className="text-muted-foreground text-sm max-w-sm">
                Add your first farm to start monitoring feed levels, readings, and deliveries across all your operations.
              </p>
            </div>
            <button
              onClick={() => navigate("/settings")}
              className="flex items-center gap-2 px-5 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Add Your First Farm
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-lg font-extrabold text-foreground">Operations Overview</h1>
                <p className="text-muted-foreground text-xs mt-0.5">
                  Swipe or use arrows to browse farms · tap Open App to drill in
                </p>
              </div>
              <div className="hidden md:flex items-center gap-3 text-[10px] text-muted-foreground font-medium px-3 py-1.5 rounded-lg bg-secondary/60">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />≥15t good</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />5–15t low</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />&lt;5t critical</span>
              </div>
            </div>
            <div className="relative px-5 sm:px-8">
              <FarmCarousel farms={farms} />
            </div>
          </>
        )}
      </main>

      <footer className="border-t border-border px-6 py-3 flex items-center justify-between">
        <span className="text-muted-foreground text-xs">Farm Buddy™ Operations · Appcovi</span>
        {isOperator && (
          <button
            onClick={() => navigate("/settings")}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            <Settings className="w-3 h-3" />
            Manage Farms
          </button>
        )}
      </footer>
    </div>
  );
}
