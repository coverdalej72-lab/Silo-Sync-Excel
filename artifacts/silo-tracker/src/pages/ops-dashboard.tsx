import { useLocation } from "wouter";
import { Settings, Plus, LayoutGrid } from "lucide-react";
import OpsFarmCard from "@/components/OpsFarmCard";
import { useFarms } from "@/hooks/useFarms";
import { useFarmData } from "@/hooks/useFarmData";
import { cn } from "@/lib/utils";
import type { Farm } from "@/hooks/useFarms";

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

export default function OpsDashboard() {
  const { farms } = useFarms();
  const [, navigate] = useLocation();

  const count = farms.length;

  const gridCols =
    count <= 1
      ? "grid-cols-1 max-w-lg mx-auto"
      : count === 2
        ? "grid-cols-2 max-w-4xl mx-auto"
        : count <= 4
          ? "grid-cols-2 xl:grid-cols-3"
          : "grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4";

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Topbar */}
      <header className="sticky top-0 z-30 bg-primary border-b border-primary/20 shadow-sm">
        <div className="max-w-screen-2xl mx-auto px-6 h-14 flex items-center justify-between">
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

      {/* Main content */}
      <main className="flex-1 max-w-screen-2xl mx-auto w-full px-6 py-6">
        {count === 0 ? (
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
            <div className="flex items-center justify-between mb-5">
              <div>
                <h1 className="text-lg font-extrabold text-foreground">Operations Overview</h1>
                <p className="text-muted-foreground text-xs mt-0.5">
                  Monitoring {count} {count === 1 ? "farm" : "farms"} · Click any card to open that farm's app
                </p>
              </div>
              <div className="hidden md:flex items-center gap-3 text-[10px] text-muted-foreground font-medium px-3 py-1.5 rounded-lg bg-secondary/60">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />≥15t good</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />5–15t low</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />&lt;5t critical</span>
              </div>
            </div>

            <div className={cn("grid gap-4 items-start", gridCols)}>
              {farms.map(farm => (
                <FarmDataWrapper key={farm.id} farm={farm} />
              ))}
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
