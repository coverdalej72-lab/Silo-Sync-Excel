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
                <DemoFarmCard farm={farm} />
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

// ── Demo farms — realistic multi-batch poultry operation ─────────────────────
const DEMO_FARMS: Farm[] = [
  { id: "1", name: "Dunmore Poultry",    planTier: "platinum" },
  { id: "2", name: "Riverina Broilers",  planTier: "gold"     },
  { id: "3", name: "Hillcrest Farm",     planTier: "silver"   },
  { id: "4", name: "Blackwood Ag",       planTier: "bronze"   },
];

type FD = import("@/hooks/useFarmData").FarmData;
const TODAY  = new Date().toISOString().slice(0, 10);
const YESTERDAY = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const IN1    = new Date(Date.now() + 1 * 86400000).toISOString().slice(0, 10);
const IN3    = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
const IN5    = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
const IN7    = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

// Helpers so silos look complete
const silo = (id: number, letter: string, name: string, feedType: string, amount: number | null): import("@/hooks/useFarmData").SiloStatus =>
  ({ siloId: id, letter, name, saved: amount !== null, amountRemaining: amount, feedType, unit: "t" });

const DEMO_DATA: Record<string, FD> = {

  // ── Farm 1: Dunmore Poultry — Platinum, 4 shed groups, 8 silos, all recorded today
  // Sheds 1&2 + 3&4 → Grower Mash (day 19 of batch)
  // Sheds 5&6       → Finisher Pellets (day 29 — near end, Silo A getting low)
  // Sheds 7&8       → Starter Crumbles (day 4 — fresh placement, silos full)
  "1": {
    progress: {
      date: TODAY, savedCount: 4, totalCount: 4,
      sheds: [
        { shedGroupId: 1, shedGroupName: "Sheds 1 & 2", allSaved: true, silos: [
          silo(1, "A", "Silo A — Sheds 1&2", "Grower Mash", 24.6),
          silo(2, "B", "Silo B — Sheds 1&2", "Grower Mash", 21.3),
        ]},
        { shedGroupId: 2, shedGroupName: "Sheds 3 & 4", allSaved: true, silos: [
          silo(3, "A", "Silo A — Sheds 3&4", "Grower Mash", 18.8),
          silo(4, "B", "Silo B — Sheds 3&4", "Grower Mash", 22.1),
        ]},
        { shedGroupId: 3, shedGroupName: "Sheds 5 & 6", allSaved: true, silos: [
          silo(5, "A", "Silo A — Sheds 5&6", "Finisher Pellets", 8.2),   // amber — nearly done
          silo(6, "B", "Silo B — Sheds 5&6", "Finisher Pellets", 15.4),
        ]},
        { shedGroupId: 4, shedGroupName: "Sheds 7 & 8", allSaved: true, silos: [
          silo(7, "A", "Silo A — Sheds 7&8", "Starter Crumbles", 29.5),
          silo(8, "B", "Silo B — Sheds 7&8", "Starter Crumbles", 28.0),
        ]},
      ],
    },
    deliveries: [
      { id: 1, shedGroupId: 3, shedGroupName: "Sheds 5 & 6", feedType: "Finisher Pellets", amount: 22, unit: "t", notes: "Top up Silo A first",  deliveryDate: IN1 },
      { id: 2, shedGroupId: 1, shedGroupName: "Sheds 1 & 2", feedType: "Grower Mash",      amount: 30, unit: "t", notes: null,                  deliveryDate: IN5 },
    ],
    loading: false, error: false, lastFetched: Date.now() - 4 * 60000, refresh: () => {},
  },

  // ── Farm 2: Riverina Broilers — Gold, 3 shed groups, Sheds 5&6 NOT yet recorded
  // Sheds 1&2 → Grower Mash (day 14), good levels
  // Sheds 3&4 → Finisher Pellets (day 31 — Silo B critically low at 3.6t!)
  // Sheds 5&6 → Grower Mash (day 21), NOT recorded yet today
  "2": {
    progress: {
      date: TODAY, savedCount: 2, totalCount: 3,
      sheds: [
        { shedGroupId: 5, shedGroupName: "Sheds 1 & 2", allSaved: true, silos: [
          silo(9,  "A", "Silo A — Sheds 1&2", "Grower Mash", 22.4),
          silo(10, "B", "Silo B — Sheds 1&2", "Grower Mash", 19.8),
        ]},
        { shedGroupId: 6, shedGroupName: "Sheds 3 & 4", allSaved: true, silos: [
          silo(11, "A", "Silo A — Sheds 3&4", "Finisher Pellets", 6.7),   // amber
          silo(12, "B", "Silo B — Sheds 3&4", "Finisher Pellets", 3.6),   // RED — critical
        ]},
        { shedGroupId: 7, shedGroupName: "Sheds 5 & 6", allSaved: false, silos: [
          silo(13, "A", "Silo A — Sheds 5&6", "Grower Mash", null),       // not recorded yet
          silo(14, "B", "Silo B — Sheds 5&6", "Grower Mash", null),
        ]},
      ],
    },
    deliveries: [
      { id: 3, shedGroupId: 6, shedGroupName: "Sheds 3 & 4", feedType: "Finisher Pellets", amount: 28, unit: "t", notes: "Urgent — Silo B critical", deliveryDate: IN1 },
      { id: 4, shedGroupId: 5, shedGroupName: "Sheds 1 & 2", feedType: "Grower Mash",      amount: 30, unit: "t", notes: null,                        deliveryDate: IN3 },
    ],
    loading: false, error: false, lastFetched: Date.now() - 23 * 60000, refresh: () => {},
  },

  // ── Farm 3: Hillcrest Farm — Silver, readings from YESTERDAY (overdue badge)
  // Sheds 1&2 → Grower Mash (day 17), decent levels
  // Sheds 3&4 → Finisher Pellets (day 26), Silo A low
  // No upcoming deliveries booked — attention needed
  "3": {
    progress: {
      date: YESTERDAY, savedCount: 2, totalCount: 2,
      sheds: [
        { shedGroupId: 8, shedGroupName: "Sheds 1 & 2", allSaved: true, silos: [
          silo(15, "A", "Silo A — Sheds 1&2", "Grower Mash", 16.4),
          silo(16, "B", "Silo B — Sheds 1&2", "Grower Mash", 14.2),
        ]},
        { shedGroupId: 9, shedGroupName: "Sheds 3 & 4", allSaved: true, silos: [
          silo(17, "A", "Silo A — Sheds 3&4", "Finisher Pellets",  9.8),  // amber
          silo(18, "B", "Silo B — Sheds 3&4", "Finisher Pellets", 11.3),
        ]},
      ],
    },
    deliveries: [],   // no deliveries booked — manager needs to act
    loading: false, error: false, lastFetched: Date.now() - 18 * 3600000, refresh: () => {},
  },

  // ── Farm 4: Blackwood Ag — Bronze, small 2-shed op, day 5 fresh batch
  // Starter Crumbles, silos loaded up, delivery booked in 7 days for Grower changeover
  "4": {
    progress: {
      date: TODAY, savedCount: 1, totalCount: 1,
      sheds: [
        { shedGroupId: 10, shedGroupName: "Shed 1 & 2", allSaved: true, silos: [
          silo(19, "A", "Silo A — Shed 1&2", "Starter Crumbles", 27.5),
          silo(20, "B", "Silo B — Shed 1&2", "Starter Crumbles", 26.0),
        ]},
      ],
    },
    deliveries: [
      { id: 5, shedGroupId: 10, shedGroupName: "Shed 1 & 2", feedType: "Grower Mash", amount: 30, unit: "t", notes: "Swap feed — batch day 12", deliveryDate: IN7 },
    ],
    loading: false, error: false, lastFetched: Date.now() - 2 * 60000, refresh: () => {},
  },
};
function DemoFarmCard({ farm }: { farm: Farm }) {
  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
  const d = DEMO_DATA[farm.id] ?? { progress:null, deliveries:[], loading:false, error:null, lastFetched:null, refresh:()=>{} };
  return <OpsFarmCard name={farm.name} planTier={farm.planTier} apiUrl={`${BASE}/api`} data={d} onRefresh={()=>{}} />;
}

export default function OpsDashboard() {
  useEffect(() => { document.title = "Farm Buddy™ — Operations"; }, []);
  const [, navigate] = useLocation();
  const farms = DEMO_FARMS;
  const count = farms.length;
  const loading = false; const error = null; const refresh = () => {};
  const isOperator = true;

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
        {!isOperator ? (
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
