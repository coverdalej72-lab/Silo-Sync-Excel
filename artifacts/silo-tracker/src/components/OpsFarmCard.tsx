import { useState } from "react";
import {
  RefreshCw, ExternalLink, Wifi, WifiOff, Clock, Truck,
  AlertTriangle, Package, CheckCircle2, MessageCircle, Bird,
  TrendingUp, TrendingDown, Minus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { FarmData, ShedStatus, SiloStatus, Delivery } from "@/hooks/useFarmData";
import FarmChatModal, { type ChatMessage } from "./FarmChatModal";

// ── Types ────────────────────────────────────────────────────────────────────

export interface BatchInfo {
  placedDate: string;       // ISO date string
  birdCount: number;
  mortalityToDate: number;
  weighRecords: { day: number; weightG: number }[];
}

const TIER_BADGE: Record<string, { label: string; cls: string }> = {
  bronze:   { label: "🥉 Bronze",   cls: "bg-orange-500/15 text-orange-600 dark:text-orange-400" },
  silver:   { label: "🥈 Silver",   cls: "bg-slate-400/15  text-slate-600  dark:text-slate-300"  },
  gold:     { label: "🥇 Gold",     cls: "bg-yellow-400/15 text-yellow-700 dark:text-yellow-400" },
  platinum: { label: "💎 Platinum", cls: "bg-sky-400/15    text-sky-700    dark:text-sky-400"    },
};

// Cobb 500 target weights (grams) at key ages
const COBB500: Record<number, number> = { 0: 42, 7: 190, 14: 450, 21: 820, 28: 1350, 35: 1980, 42: 2650 };
const MILESTONES = [7, 14, 21, 28, 35, 42];
const SILO_MAX_T = 30;

// ── Helpers ──────────────────────────────────────────────────────────────────

function estimatedWeight(dayAge: number): number {
  const days    = [0, 7, 14, 21, 28, 35, 42];
  const weights = [42, 190, 450, 820, 1350, 1980, 2650];
  if (dayAge <= 0) return 42;
  if (dayAge >= 42) return 2650;
  for (let i = 1; i < days.length; i++) {
    if (dayAge <= days[i]) {
      const t = (dayAge - days[i - 1]) / (days[i] - days[i - 1]);
      return Math.round(weights[i - 1] + t * (weights[i] - weights[i - 1]));
    }
  }
  return 2650;
}

function formatWeight(g: number): string {
  return g >= 1000 ? `${(g / 1000).toFixed(2)}kg` : `${g}g`;
}

function pct(actual: number, target: number): number {
  return Math.round(((actual - target) / target) * 100);
}

function siloColor(amount: number | null) {
  if (amount === null) return { bar: "bg-muted-foreground/20", dot: "bg-muted-foreground/40", text: "text-muted-foreground" };
  if (amount >= 15) return { bar: "bg-green-500", dot: "bg-green-500", text: "text-green-700 dark:text-green-400" };
  if (amount >= 5)  return { bar: "bg-amber-500", dot: "bg-amber-500", text: "text-amber-700 dark:text-amber-400" };
  return               { bar: "bg-red-500",   dot: "bg-red-500",   text: "text-red-700   dark:text-red-400"   };
}

function groupMinColor(silos: SiloStatus[]) {
  const min = Math.min(...silos.map(s => s.amountRemaining ?? Infinity));
  if (min === Infinity) return "bg-muted-foreground/40";
  if (min >= 15) return "bg-green-500";
  if (min >= 5)  return "bg-amber-500";
  return "bg-red-500";
}

function staleness(dateStr?: string): "fresh" | "stale" | "unknown" {
  if (!dateStr) return "unknown";
  return new Date(dateStr).toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10) ? "fresh" : "stale";
}

function formatDate(s: string) {
  return new Date(s).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

function formatRelative(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60)    return "just now";
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function getNextDelivery(deliveries: Delivery[]): Delivery | null {
  const today = new Date().toISOString().slice(0, 10);
  return deliveries
    .filter(d => d.deliveryDate >= today)
    .sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate))[0] ?? null;
}

function hasCritical(sheds: ShedStatus[]) {
  return sheds.some(sh => sh.silos.some(si => si.amountRemaining !== null && si.amountRemaining < 5));
}

function getTotalFeed(sheds: ShedStatus[]) {
  return sheds.reduce((s, sh) => s + sh.silos.reduce((ss, si) => ss + (si.amountRemaining ?? 0), 0), 0);
}

// ── Sub-components ───────────────────────────────────────────────────────────

function SiloBar({ silo }: { silo: SiloStatus }) {
  const col  = siloColor(silo.amountRemaining);
  const fill = silo.amountRemaining !== null ? Math.min(100, (silo.amountRemaining / SILO_MAX_T) * 100) : 0;
  return (
    <div className="flex flex-col gap-0.5 min-w-[60px]">
      <div className="flex items-center justify-between gap-1">
        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wide">Silo {silo.letter ?? silo.siloId}</span>
        <span className={cn("text-[10px] font-bold tabular-nums", col.text)}>
          {silo.amountRemaining !== null ? `${silo.amountRemaining.toFixed(1)}t` : "—"}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", col.bar)} style={{ width: `${fill}%` }} />
      </div>
    </div>
  );
}

function ShedRow({ shed }: { shed: ShedStatus }) {
  const feedTypes = [...new Set(shed.silos.map(s => s.feedType).filter(Boolean))];
  return (
    <div className="rounded-xl border border-border/60 bg-secondary/30 p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <span className={cn("w-2 h-2 rounded-full shrink-0", groupMinColor(shed.silos))} />
        <span className="text-sm font-bold text-foreground flex-1 truncate">{shed.shedGroupName}</span>
        {!shed.allSaved
          ? <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-full"><AlertTriangle className="w-3 h-3" />Not recorded</span>
          : <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
        }
      </div>
      {feedTypes.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          {feedTypes.map(ft => (
            <span key={ft} className="text-[10px] font-semibold text-primary/80 bg-primary/8 border border-primary/15 px-2 py-0.5 rounded-full">{ft}</span>
          ))}
        </div>
      )}
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${shed.silos.length}, 1fr)` }}>
        {shed.silos.map(silo => <SiloBar key={silo.siloId} silo={silo} />)}
      </div>
    </div>
  );
}

function BatchSection({ batch }: { batch: BatchInfo }) {
  const today     = new Date().toISOString().slice(0, 10);
  const placed    = new Date(batch.placedDate);
  const batchAge  = Math.floor((new Date(today).getTime() - placed.getTime()) / 86400000);
  const estWeight = estimatedWeight(batchAge);
  const liveBirds = batch.birdCount - batch.mortalityToDate;
  const mortPct   = ((batch.mortalityToDate / batch.birdCount) * 100).toFixed(2);

  const recordMap = Object.fromEntries(batch.weighRecords.map(r => [r.day, r.weightG]));
  const nextMilestone = MILESTONES.find(d => d > batchAge);
  const daysToNext = nextMilestone !== undefined ? nextMilestone - batchAge : null;

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-3">
      {/* Header row */}
      <div className="flex items-start gap-2 justify-between flex-wrap gap-y-1">
        <div className="flex items-center gap-2">
          <Bird className="w-4 h-4 text-primary shrink-0" />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-extrabold text-primary">Day {batchAge}</span>
              <span className="text-[10px] font-bold bg-primary/15 text-primary px-2 py-0.5 rounded-full">
                Placed {formatDate(batch.placedDate)}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {liveBirds.toLocaleString()} live birds · {batch.mortalityToDate.toLocaleString()} deaths ({mortPct}%)
            </p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Est. Weight Today</p>
          <p className="text-sm font-extrabold text-foreground">{formatWeight(estWeight)}</p>
          {daysToNext !== null && (
            <p className="text-[10px] text-muted-foreground">Day {nextMilestone} weigh in {daysToNext}d</p>
          )}
        </div>
      </div>

      {/* Milestone strip */}
      <div className="flex gap-1.5 overflow-x-auto pb-0.5 -mx-0.5 px-0.5">
        {MILESTONES.map(day => {
          const actual  = recordMap[day];
          const target  = COBB500[day];
          const isPast  = batchAge >= day;
          const isNext  = day === nextMilestone;
          const diff    = actual !== undefined ? pct(actual, target) : null;

          return (
            <div
              key={day}
              className={cn(
                "flex flex-col items-center rounded-xl px-2.5 py-2 min-w-[52px] shrink-0 border",
                isPast && actual !== undefined
                  ? diff! >= 0
                    ? "bg-green-500/10 border-green-500/30"
                    : "bg-amber-500/10 border-amber-500/30"
                  : isNext
                    ? "bg-primary/10 border-primary/40"
                    : "bg-secondary/40 border-border/40"
              )}
            >
              <span className={cn(
                "text-[9px] font-bold uppercase tracking-wide",
                isPast && actual !== undefined ? (diff! >= 0 ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400")
                  : isNext ? "text-primary" : "text-muted-foreground"
              )}>
                Day {day}
              </span>

              {isPast && actual !== undefined ? (
                <>
                  <span className="text-xs font-extrabold text-foreground mt-0.5">{formatWeight(actual)}</span>
                  <span className={cn(
                    "flex items-center gap-0.5 text-[9px] font-bold mt-0.5",
                    diff! > 0 ? "text-green-600 dark:text-green-400" : diff! < 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"
                  )}>
                    {diff! > 0 ? <TrendingUp className="w-2.5 h-2.5" /> : diff! < 0 ? <TrendingDown className="w-2.5 h-2.5" /> : <Minus className="w-2.5 h-2.5" />}
                    {diff! > 0 ? "+" : ""}{diff}%
                  </span>
                </>
              ) : isPast ? (
                <span className="text-[10px] text-muted-foreground mt-1">—</span>
              ) : (
                <>
                  <span className={cn("text-xs font-bold mt-0.5", isNext ? "text-primary" : "text-muted-foreground/60")}>
                    {formatWeight(target)}
                  </span>
                  <span className={cn("text-[9px] mt-0.5", isNext ? "text-primary/70" : "text-muted-foreground/40")}>
                    {isNext ? "target" : "tgt"}
                  </span>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main card ────────────────────────────────────────────────────────────────

interface FarmCardProps {
  name: string;
  planTier?: string;
  apiUrl: string;
  data: FarmData;
  onRefresh: () => void;
  batchInfo?: BatchInfo;
  chatMessages?: ChatMessage[];
}

export default function OpsFarmCard({ name, planTier, apiUrl, data, onRefresh, batchInfo, chatMessages }: FarmCardProps) {
  const [chatOpen, setChatOpen] = useState(false);
  const { progress, deliveries, loading, error, lastFetched } = data;
  const appUrl = (apiUrl || window.location.origin).replace(/\/api\/?$/, "/").replace(/\/$/, "") + "/";

  if (loading && !progress) {
    return (
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm animate-pulse">
        <div className="h-28 bg-primary/20 rounded-t-2xl" />
        <div className="p-4 space-y-3">{[1,2,3].map(i => <div key={i} className="h-16 rounded-xl bg-muted" />)}</div>
      </div>
    );
  }

  const stale      = staleness(progress?.date);
  const nextDel    = getNextDelivery(deliveries);
  const totalFeed  = progress ? getTotalFeed(progress.sheds) : 0;
  const critical   = progress ? hasCritical(progress.sheds) : false;
  const isOnline   = !error;
  const tier       = planTier ? TIER_BADGE[planTier] : null;
  const unreadChat = chatMessages ? chatMessages.filter(m => m.from === "farm").length : 0;

  return (
    <>
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm flex flex-col hover:shadow-lg transition-shadow">

        {/* Critical banner */}
        {critical && (
          <div className="bg-red-600 px-4 py-1.5 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-white shrink-0" />
            <span className="text-white text-xs font-bold">Critical — silo below 5t, delivery needed urgently</span>
          </div>
        )}

        {/* Header */}
        <div className="bg-primary px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-primary-foreground/50 text-[10px] font-bold uppercase tracking-widest">Farm</p>
              <p className="text-primary-foreground text-xl font-extrabold leading-tight truncate">{name}</p>
              {tier && (
                <span className={cn("inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full", tier.cls)}>
                  {tier.label}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0 mt-0.5">
              {/* Chat button */}
              <button
                onClick={() => setChatOpen(true)}
                className="relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-primary-foreground/10 hover:bg-primary-foreground/20 transition-colors"
                title="Message farm manager"
              >
                <MessageCircle className="w-3.5 h-3.5 text-primary-foreground" />
                <span className="text-[10px] font-bold text-primary-foreground hidden sm:inline">Message</span>
                {unreadChat > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                    {unreadChat}
                  </span>
                )}
              </button>
              <span className={cn(
                "flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full",
                isOnline ? "bg-green-500/25 text-green-300" : "bg-red-500/25 text-red-300"
              )}>
                {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                {isOnline ? "Online" : "Offline"}
              </span>
              <button
                onClick={onRefresh}
                className="w-7 h-7 rounded-full bg-primary-foreground/10 hover:bg-primary-foreground/20 flex items-center justify-center transition-colors"
              >
                <RefreshCw className={cn("w-3.5 h-3.5 text-primary-foreground/70", loading && "animate-spin")} />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between mt-3 pt-3 border-t border-primary-foreground/10">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-primary-foreground/50" />
              <span className="text-primary-foreground/70 text-xs">
                {progress?.date ? `Readings for ${formatDate(progress.date)}` : "No readings yet"}
              </span>
            </div>
            <span className={cn(
              "text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1",
              stale === "fresh"   ? "bg-green-500/25 text-green-300" :
              stale === "stale"   ? "bg-amber-500/25 text-amber-300" :
                                    "bg-primary-foreground/10 text-primary-foreground/50"
            )}>
              {stale === "stale" && <AlertTriangle className="w-3 h-3" />}
              {stale === "fresh" ? "Today ✓" : stale === "stale" ? "Overdue" : "No data"}
            </span>
          </div>
        </div>

        {/* Stats strip */}
        {progress && (
          <div className="grid grid-cols-3 divide-x divide-border border-b border-border">
            {[
              { label: "Feed on Hand", value: `${totalFeed.toFixed(1)}`, unit: "t", green: false },
              { label: "Sheds Done",   value: `${progress.savedCount}/${progress.totalCount}`, unit: "", green: progress.savedCount === progress.totalCount },
              { label: "Shed Groups",  value: `${progress.sheds.length}`, unit: "", green: false },
            ].map(({ label, value, unit, green }) => (
              <div key={label} className="py-3 px-2 text-center bg-secondary/30">
                <p className="text-muted-foreground text-[10px] font-semibold uppercase tracking-wide leading-none mb-1">{label}</p>
                <p className={cn("text-lg font-extrabold leading-none", green ? "text-green-600 dark:text-green-400" : "text-foreground")}>
                  {value}<span className="text-xs font-medium text-muted-foreground ml-0.5">{unit}</span>
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 p-4 space-y-2.5">
          {error && !progress && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
              <WifiOff className="w-4 h-4 shrink-0" /><span>Unreachable — check network or API URL</span>
            </div>
          )}

          {/* Batch status */}
          {batchInfo && <BatchSection batch={batchInfo} />}

          {/* Sheds */}
          {progress?.sheds.map((shed: ShedStatus) => <ShedRow key={shed.shedGroupId} shed={shed} />)}

          {/* Delivery */}
          {nextDel ? (
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-[hsl(43,72%,47%)]/10 border border-[hsl(43,72%,47%)]/25">
              <Truck className="w-4 h-4 text-[hsl(43,72%,47%)] shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wide text-[hsl(43,72%,47%)]/70">Next Delivery</p>
                <p className="text-sm font-semibold text-foreground truncate">
                  {nextDel.feedType} — {nextDel.amount}{nextDel.unit}
                  {nextDel.shedGroupName && ` · ${nextDel.shedGroupName}`}
                </p>
                {nextDel.notes && <p className="text-[11px] text-muted-foreground truncate mt-0.5">{nextDel.notes}</p>}
              </div>
              <span className="text-xs font-bold text-[hsl(43,72%,47%)] shrink-0 whitespace-nowrap">{formatDate(nextDel.deliveryDate)}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-secondary/40">
              <Package className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-sm text-muted-foreground">No upcoming deliveries</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 pb-4 pt-2 flex items-center justify-between border-t border-border/40">
          <span className="text-muted-foreground text-[10px]">
            {lastFetched ? `Synced ${formatRelative(lastFetched)}` : "Never synced"}
          </span>
          <a
            href={appUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs font-bold text-primary hover:text-primary/80 transition-colors"
          >
            Open App <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {chatOpen && chatMessages && (
        <FarmChatModal farmName={name} messages={chatMessages} onClose={() => setChatOpen(false)} />
      )}
    </>
  );
}
