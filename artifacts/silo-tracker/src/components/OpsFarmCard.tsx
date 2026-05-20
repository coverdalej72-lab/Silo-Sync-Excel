import { RefreshCw, ExternalLink, Wifi, WifiOff, Clock, Package, Truck, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FarmData, ShedStatus, SiloStatus, Delivery } from "@/hooks/useFarmData";

const TIER_BADGE: Record<string, string> = {
  bronze: "🥉 Bronze",
  silver: "🥈 Silver",
  gold: "🥇 Gold",
  platinum: "💎 Platinum",
};

interface FarmCardProps {
  name: string;
  planTier?: string;
  apiUrl: string;
  data: FarmData;
  onRefresh: () => void;
}

function getTotalTonnes(shed: ShedStatus): number {
  return shed.silos.reduce((sum: number, s: SiloStatus) => sum + (s.amountRemaining ?? 0), 0);
}

function getSiloStatusColor(amount: number | null): string {
  if (amount === null) return "bg-muted-foreground/30";
  if (amount >= 15) return "bg-green-500";
  if (amount >= 5) return "bg-amber-500";
  return "bg-red-500";
}

function getReadingStaleness(dateStr: string | undefined): "fresh" | "stale" | "unknown" {
  if (!dateStr) return "unknown";
  const readingDate = new Date(dateStr);
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const readingStr = readingDate.toISOString().slice(0, 10);
  if (readingStr === todayStr) return "fresh";
  return "stale";
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

function formatRelative(ts: number): string {
  const secs = Math.floor((Date.now() - ts) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

function getNextDelivery(deliveries: Delivery[]): Delivery | null {
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = deliveries
    .filter(d => d.deliveryDate >= today)
    .sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate));
  return upcoming[0] ?? null;
}

function getTotalFeedOnHand(sheds: ShedStatus[]): number {
  return sheds.reduce((sum, shed) => sum + getTotalTonnes(shed), 0);
}

function SkeletonCard({ name }: { name: string }) {
  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm flex flex-col h-full">
      <div className="bg-primary px-5 py-4 flex items-center justify-between">
        <div>
          <p className="text-primary-foreground/60 text-[10px] font-semibold uppercase tracking-widest">Farm</p>
          <p className="text-primary-foreground text-xl font-bold">{name}</p>
        </div>
        <div className="w-8 h-8 rounded-full bg-primary-foreground/10 animate-pulse" />
      </div>
      <div className="flex-1 p-5 space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-10 rounded-lg bg-muted animate-pulse" />
        ))}
      </div>
    </div>
  );
}

export default function OpsFarmCard({ name, planTier, apiUrl, data, onRefresh }: FarmCardProps) {
  const { progress, deliveries, loading, error, lastFetched } = data;

  const farmUrl = apiUrl || window.location.origin;
  const appUrl = farmUrl.replace(/\/$/, "") + "/";

  if (loading && !progress) {
    return <SkeletonCard name={name} />;
  }

  const staleness = getReadingStaleness(progress?.date);
  const nextDelivery = getNextDelivery(deliveries);
  const totalFeed = progress ? getTotalFeedOnHand(progress.sheds) : 0;
  const isOnline = !error;
  const savedRatio = progress ? `${progress.savedCount}/${progress.totalCount}` : "—";

  return (
    <div
      data-testid={`farm-card-${name.toLowerCase().replace(/\s+/g, "-")}`}
      className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm flex flex-col h-full transition-shadow hover:shadow-md"
    >
      {/* Header */}
      <div className="bg-primary px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-primary-foreground/60 text-[10px] font-bold uppercase tracking-widest">Farm</p>
            <p className="text-primary-foreground text-xl font-extrabold leading-tight truncate">{name}</p>
            {planTier && (
              <p className="text-primary-foreground/50 text-[10px] font-semibold mt-0.5">{TIER_BADGE[planTier] ?? planTier}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0 mt-0.5">
            <span className={cn(
              "flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full",
              isOnline
                ? "bg-green-500/20 text-green-300"
                : "bg-red-500/20 text-red-300"
            )}>
              {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              {isOnline ? "Online" : "Offline"}
            </span>
            <button
              data-testid={`btn-refresh-${name.toLowerCase().replace(/\s+/g, "-")}`}
              onClick={onRefresh}
              className="w-7 h-7 rounded-full bg-primary-foreground/10 hover:bg-primary-foreground/20 flex items-center justify-center transition-colors"
            >
              <RefreshCw className={cn("w-3.5 h-3.5 text-primary-foreground/70", loading && "animate-spin")} />
            </button>
          </div>
        </div>

        {/* Reading staleness */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-primary-foreground/10">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-primary-foreground/50" />
            <span className="text-primary-foreground/70 text-xs">
              {progress?.date
                ? `Readings for ${formatDate(progress.date)}`
                : "No readings today"}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {staleness === "stale" && (
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            )}
            <span className={cn(
              "text-xs font-bold px-2 py-0.5 rounded-full",
              staleness === "fresh"
                ? "bg-green-500/20 text-green-300"
                : staleness === "stale"
                  ? "bg-amber-500/20 text-amber-300"
                  : "bg-primary-foreground/10 text-primary-foreground/50"
            )}>
              {staleness === "fresh" ? "Today ✓" : staleness === "stale" ? "Overdue" : "No data"}
            </span>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 p-4 space-y-3">
        {error && !progress && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
            <WifiOff className="w-4 h-4 shrink-0" />
            <span>Unreachable — check network or API URL</span>
          </div>
        )}

        {/* Summary strip */}
        {progress && (
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-secondary/60 rounded-xl p-2.5 text-center">
              <p className="text-muted-foreground text-[10px] font-semibold uppercase tracking-wide">Feed on Hand</p>
              <p className="text-foreground text-lg font-extrabold leading-tight">
                {totalFeed.toFixed(1)}<span className="text-xs font-medium text-muted-foreground ml-0.5">t</span>
              </p>
            </div>
            <div className="bg-secondary/60 rounded-xl p-2.5 text-center">
              <p className="text-muted-foreground text-[10px] font-semibold uppercase tracking-wide">Sheds Done</p>
              <p className={cn(
                "text-lg font-extrabold leading-tight",
                progress.savedCount === progress.totalCount ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"
              )}>
                {savedRatio}
              </p>
            </div>
            <div className="bg-secondary/60 rounded-xl p-2.5 text-center">
              <p className="text-muted-foreground text-[10px] font-semibold uppercase tracking-wide">Sheds</p>
              <p className="text-foreground text-lg font-extrabold leading-tight">{progress.sheds.length}</p>
            </div>
          </div>
        )}

        {/* Shed breakdown */}
        {progress && progress.sheds.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-widest px-0.5">Feed Per Shed</p>
            {progress.sheds.map((shed: ShedStatus) => {
              const total = getTotalTonnes(shed);
              return (
                <div
                  key={shed.shedGroupId}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-secondary/40 hover:bg-secondary/70 transition-colors"
                >
                  <div className={cn("w-2 h-2 rounded-full shrink-0", getSiloStatusColor(total / Math.max(shed.silos.length, 1)))} />
                  <span className="text-sm font-semibold text-foreground flex-1 truncate">{shed.shedGroupName}</span>
                  <div className="flex items-center gap-1.5">
                    {shed.silos.map((silo: SiloStatus) => (
                      <span key={silo.siloId} className="flex items-center gap-0.5">
                        <span className={cn("w-1.5 h-1.5 rounded-full", getSiloStatusColor(silo.amountRemaining))} />
                        <span className="text-xs text-muted-foreground font-mono">
                          {silo.amountRemaining !== null ? silo.amountRemaining.toFixed(1) : "—"}
                          <span className="text-[10px]">{silo.unit ?? "t"}</span>
                        </span>
                      </span>
                    ))}
                  </div>
                  {!shed.allSaved && (
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Next delivery */}
        {nextDelivery ? (
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-[hsl(43,72%,47%)]/10 border border-[hsl(43,72%,47%)]/20">
            <Truck className="w-4 h-4 text-[hsl(43,72%,47%)] shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wide text-[hsl(43,72%,47%)]/70">Next Delivery</p>
              <p className="text-sm font-semibold text-foreground truncate">
                {nextDelivery.feedType} — {nextDelivery.amount}{nextDelivery.unit}
                {nextDelivery.shedGroupName && ` · ${nextDelivery.shedGroupName}`}
              </p>
            </div>
            <span className="text-xs font-bold text-[hsl(43,72%,47%)] shrink-0">{formatDate(nextDelivery.deliveryDate)}</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-secondary/40">
            <Package className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-sm text-muted-foreground">No upcoming deliveries</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 pb-4 pt-0 flex items-center justify-between">
        <span className="text-muted-foreground text-[10px]">
          {lastFetched ? `Synced ${formatRelative(lastFetched)}` : "Never synced"}
        </span>
        <a
          href={appUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
        >
          Open App
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
}
