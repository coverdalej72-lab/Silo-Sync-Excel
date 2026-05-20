import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { Settings, Plus, LayoutGrid, ChevronLeft, ChevronRight } from "lucide-react";
import OpsFarmCard from "@/components/OpsFarmCard";
import { useFarms } from "@/hooks/useFarms";
import { useFarmData } from "@/hooks/useFarmData";
import { cn } from "@/lib/utils";
import type { Farm } from "@/hooks/useFarms";

// ── Per-farm fetcher ────────────────────────────────────────────────────────

function FarmDataWrapper({ farm }: { farm: Farm }) {
  const data = useFarmData(farm.apiUrl);
  return (
    <OpsFarmCard
      name={farm.name}
      apiUrl={farm.apiUrl}
      data={data}
      onRefresh={data.refresh}
    />
  );
}

// ── Carousel ────────────────────────────────────────────────────────────────

function FarmCarousel({ farms }: { farms: Farm[] }) {
  const [current, setCurrent] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const count = farms.length;

  const prev = () => setCurrent(i => Math.max(0, i - 1));
  const next = () => setCurrent(i => Math.min(count - 1, i + 1));

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const delta = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(delta) > 40) {
      if (delta > 0) next();
      else prev();
    }
    touchStartX.current = null;
  };

  return (
    <div className="relative w-full">
      {/* Track */}
      <div
        className="overflow-hidden"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div
          className="flex transition-transform duration-300 ease-in-out"
          style={{ transform: `translateX(-${current * 100}%)` }}
        >
          {farms.map(farm => (
            <div
              key={farm.id}
              className="min-w-full px-0 sm:px-4"
              style={{ maxWidth: "100%" }}
            >
              {/* Cap individual card width on large screens */}
              <div className="max-w-2xl mx-auto">
                <FarmDataWrapper farm={farm} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Arrow buttons — visible on desktop when there are multiple cards */}
      {count > 1 && (
        <>
          <button
            onClick={prev}
            disabled={current === 0}
            aria-label="Previous farm"
            className={cn(
              "absolute left-0 sm:-left-5 top-1/2 -translate-y-1/2 z-10",
              "w-9 h-9 rounded-full flex items-center justify-center shadow-md",
              "bg-card border border-border text-foreground",
              "transition-all hover:bg-secondary",
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
              "bg-card border border-border text-foreground",
              "transition-all hover:bg-secondary",
              current === count - 1 && "opacity-30 cursor-not-allowed"
            )}
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </>
      )}

      {/* Pagination dots */}
      {count > 1 && (
        <div className="flex items-center justify-center gap-2 mt-5">
          {farms.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              aria-label={`Go to farm ${i + 1}`}
              className={cn(
                "rounded-full transition-all duration-200",
                i === current
                  ? "w-5 h-2.5 bg-primary"
                  : "w-2.5 h-2.5 bg-border hover:bg-muted-foreground/40"
              )}
            />
          ))}
        </div>
      )}

      {/* Current indicator text */}
      {count > 1 && (
        <p className="text-center text-muted-foreground text-xs mt-2">
          {current + 1} of {count}
        </p>
      )}
    </div>
  );
}

// ── Dashboard page ──────────────────────────────────────────────────────────

export default function OpsDashboard() {
  useEffect(() => { document.title = "Farm Buddy™ — Operations"; }, []);
  const { farms } = useFarms();
  const [, navigate] = useLocation();
  const count = farms.length;

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
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 max-w-screen-xl mx-auto w-full px-6 py-6">
        {count === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center h-[60vh] gap-6 text-center">
            <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center">
              <LayoutGrid className="w-10 h-10 text-primary/40" />
            </div>
            <div>
              <p className="text-xl font-bold text-foreground mb-2">No farms configured</p>
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
            {/* Status bar */}
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

            {/* Carousel */}
            <div className="relative px-5 sm:px-8">
              <FarmCarousel farms={farms} />
            </div>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-3 flex items-center justify-between">
        <span className="text-muted-foreground text-xs">Farm Buddy™ Operations · Appcovi</span>
        <button
          onClick={() => navigate("/settings")}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          <Settings className="w-3 h-3" />
          Manage Farms
        </button>
      </footer>
    </div>
  );
}
