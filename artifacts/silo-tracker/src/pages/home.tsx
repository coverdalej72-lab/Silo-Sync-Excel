import { useState, useEffect, useCallback, useRef } from "react";
import {
  useGetTodayProgress,
  getGetTodayProgressQueryKey,
  useBatchCreateReadings,
  useDeleteReading
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, WifiOff, RefreshCw, Undo2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useFarmConfig } from "@/hooks/use-farm-config";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────
type SiloFormState = { amountRemaining: string; unit: string; feedType: string };

interface QueuedSave {
  id: string;
  shedId: number;
  readings: Array<{ siloId: number; feedType: string; amountRemaining: number; unit: string }>;
  timestamp: number;
}

// ─── Storage keys ─────────────────────────────────────────────────────────────
const PROGRESS_CACHE_KEY = "silo-progress-cache";
const SAVE_QUEUE_KEY     = "silo-save-queue";
const SYNC_KEY           = "silo-fp-last-sync";

function loadProgressCache(): unknown | null {
  try { return JSON.parse(localStorage.getItem(PROGRESS_CACHE_KEY) || "null"); } catch { return null; }
}
function saveProgressCache(data: unknown) {
  try { localStorage.setItem(PROGRESS_CACHE_KEY, JSON.stringify(data)); } catch {}
}
function loadQueue(): QueuedSave[] {
  try { return JSON.parse(localStorage.getItem(SAVE_QUEUE_KEY) || "[]"); } catch { return []; }
}
function saveQueue(q: QueuedSave[]) {
  try { localStorage.setItem(SAVE_QUEUE_KEY, JSON.stringify(q)); } catch {}
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const SILO_BADGE_COLORS = [
  { bg: "bg-primary",    text: "text-primary-foreground" },
  { bg: "bg-blue-500",   text: "text-white"              },
  { bg: "bg-amber-500",  text: "text-white"              },
  { bg: "bg-purple-500", text: "text-white"              },
];
function badgeColors(i: number) { return SILO_BADGE_COLORS[i] ?? SILO_BADGE_COLORS[0]; }

function formatRelative(ts: number): string {
  const d = Math.floor((Date.now() - ts) / 1000);
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)} min ago`;
  if (d < 86400) return `${Math.floor(d / 3600)} hr ago`;
  return new Date(ts).toLocaleDateString();
}

function useLastFpSync() {
  const [ts, setTs] = useState<number | null>(() => {
    const v = localStorage.getItem(SYNC_KEY);
    return v ? parseInt(v, 10) : null;
  });
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === SYNC_KEY) setTs(e.newValue ? parseInt(e.newValue, 10) : null);
    };
    window.addEventListener("storage", onStorage);
    const id = setInterval(() => {
      const v = localStorage.getItem(SYNC_KEY);
      setTs(v ? parseInt(v, 10) : null);
    }, 30_000);
    return () => { window.removeEventListener("storage", onStorage); clearInterval(id); };
  }, []);
  return ts;
}

function SavedValue({ value, unit, saved, queued }: { value: string; unit: string; saved: boolean; queued?: boolean }) {
  if (queued) return (
    <div className="text-center mt-1.5">
      <p className="text-[10px] text-amber-600 font-bold uppercase tracking-wide">Queued ✓</p>
    </div>
  );
  if (!saved) return (
    <div className="text-center mt-1.5">
      <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Saved</p>
      <div className="w-6 h-0.5 bg-amber-500 mx-auto mt-1 rounded-full" />
    </div>
  );
  const num = parseFloat(value);
  const display = !isNaN(num) ? num.toLocaleString() : value || "0";
  return (
    <div className="text-center mt-1.5">
      <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Saved</p>
      <p className="text-xs font-bold text-primary">{display} <span className="font-normal text-muted-foreground">{unit}</span></p>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Home() {
  const { toast }                               = useToast();
  const queryClient                             = useQueryClient();
  const batchCreate                             = useBatchCreateReadings();
  const deleteReading                           = useDeleteReading();
  const { getShedName, isShedActive, getActiveSiloLetters } = useFarmConfig();

  // Two-tap undo: shedId → timeout handle (armed = waiting for second tap)
  const [undoArmed, setUndoArmed] = useState<Record<number, boolean>>({});
  const undoTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const lastSync                                = useLastFpSync();

  const { data: liveProgress, isLoading, isError } = useGetTodayProgress({
    query: { queryKey: getGetTodayProgressQueryKey() }
  });

  // Use live data when available, fall back to cache
  const [cachedProgress, setCachedProgress] = useState<typeof liveProgress | null>(
    () => loadProgressCache() as typeof liveProgress | null
  );
  const [isOffline, setIsOffline]     = useState(false);
  const [pendingQueue, setPendingQueue] = useState<QueuedSave[]>(() => loadQueue());
  const [syncing, setSyncing]          = useState(false);
  // Track locally-queued silo saves for UI: shedId → { siloId → {val, unit} }
  const [queuedVals, setQueuedVals]   = useState<Record<number, Record<number, { val: string; unit: string }>>>({});
  const [formState, setFormState]     = useState<Record<number, Record<number, SiloFormState>>>({});

  const progress = liveProgress ?? cachedProgress ?? null;

  // Persist live data to cache
  useEffect(() => {
    if (liveProgress) {
      saveProgressCache(liveProgress);
      setCachedProgress(liveProgress);
      setIsOffline(false);
    }
  }, [liveProgress]);

  // Switch to offline mode when API errors and no live data
  useEffect(() => {
    if (isError && !liveProgress) setIsOffline(true);
  }, [isError, liveProgress]);

  // Pre-fill form from progress
  useEffect(() => {
    if (!progress) return;
    const newState: Record<number, Record<number, SiloFormState>> = {};
    (progress as any).sheds?.forEach((shed: any) => {
      newState[shed.shedGroupId] = {};
      shed.silos?.forEach((silo: any) => {
        newState[shed.shedGroupId][silo.siloId] = {
          amountRemaining: silo.amountRemaining !== null ? silo.amountRemaining.toString() : "",
          unit: silo.unit || localStorage.getItem("silo-default-unit") || "t",
          feedType: silo.feedType || silo.defaultFeedType || "",
        };
      });
    });
    setFormState(newState);
  }, [progress]);

  const handleChange = (shedId: number, siloId: number, field: keyof SiloFormState, value: string) => {
    setFormState(prev => ({
      ...prev,
      [shedId]: { ...prev[shedId], [siloId]: { ...prev[shedId]?.[siloId], [field]: value } }
    }));
  };

  // ── Offline queue flush ───────────────────────────────────────────────────
  const flushQueueRef = useRef<() => void>(() => {});

  const flushQueue = useCallback(async () => {
    const queue = loadQueue();
    if (queue.length === 0) return;
    const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
    setSyncing(true);
    const remaining: QueuedSave[] = [];
    for (const item of queue) {
      try {
        // Use the timestamp when the item was queued to derive the correct local date.
        const queuedAt = new Date(item.timestamp);
        const localNoon = new Date(queuedAt.getFullYear(), queuedAt.getMonth(), queuedAt.getDate(), 12, 0, 0);
        const res = await fetch(`${BASE}/api/readings/batch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ readings: item.readings, readingDate: localNoon.toISOString() }),
        });
        if (!res.ok) throw new Error("not ok");
      } catch {
        remaining.push(item);
      }
    }
    saveQueue(remaining);
    setPendingQueue(remaining);
    if (remaining.length < queue.length) {
      // Some flushed — clear queued UI vals for flushed items
      const flushedIds = new Set(
        queue.filter(q => !remaining.find(r => r.id === q.id)).map(q => q.shedId)
      );
      setQueuedVals(prev => {
        const next = { ...prev };
        flushedIds.forEach(id => delete next[id]);
        return next;
      });
      queryClient.invalidateQueries({ queryKey: getGetTodayProgressQueryKey() });
      toast({ title: `${queue.length - remaining.length} shed${queue.length - remaining.length > 1 ? "s" : ""} synced` });
    }
    setSyncing(false);
  }, [queryClient, toast]);

  flushQueueRef.current = flushQueue;

  // Auto-flush on reconnect and on focus
  useEffect(() => {
    const onOnline = () => {
      setIsOffline(false);
      flushQueueRef.current();
      queryClient.invalidateQueries({ queryKey: getGetTodayProgressQueryKey() });
    };
    const onFocus = () => { if (navigator.onLine) flushQueueRef.current(); };
    window.addEventListener("online", onOnline);
    window.addEventListener("focus", onFocus);
    return () => { window.removeEventListener("online", onOnline); window.removeEventListener("focus", onFocus); };
  }, [queryClient]);

  // ── Save shed ─────────────────────────────────────────────────────────────
  const handleSaveShed = (shedId: number) => {
    if (!progress) return;
    const sheds = (progress as any).sheds as any[];
    const shed = sheds?.find((s: any) => s.shedGroupId === shedId);
    if (!shed) return;
    const activeSiloLetters = getActiveSiloLetters(shedId);
    const readings = shed.silos
      .filter((silo: any) => activeSiloLetters.includes(silo.letter))
      .map((silo: any) => {
        const state = formState[shedId]?.[silo.siloId];
        return {
          siloId: silo.siloId,
          feedType: state?.feedType || "",
          amountRemaining: parseFloat(state?.amountRemaining || "0") || 0,
          unit: state?.unit || "t",
        };
      });

    // Send local noon as the reading date so the server stores the correct local day
    // regardless of UTC offset (e.g. 6am AEST = 8pm UTC the night before).
    const now = new Date();
    const localNoon = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);

    batchCreate.mutate({ data: { readings, readingDate: localNoon.toISOString() } }, {
      onSuccess: () => {
        toast({ title: `${getShedName(shedId, shed.shedGroupName)} saved` });
        queryClient.invalidateQueries({ queryKey: getGetTodayProgressQueryKey() });
      },
      onError: () => {
        // Queue locally
        const item: QueuedSave = {
          id: `${shedId}-${Date.now()}`,
          shedId,
          readings,
          timestamp: Date.now(),
        };
        const next = [...loadQueue().filter(q => q.shedId !== shedId), item];
        saveQueue(next);
        setPendingQueue(next);
        // Track queued values for UI
        const vals: Record<number, { val: string; unit: string }> = {};
        readings.forEach((r: { siloId: number; amountRemaining: number; unit: string }) => {
          vals[r.siloId] = { val: r.amountRemaining.toString(), unit: r.unit };
        });
        setQueuedVals(prev => ({ ...prev, [shedId]: vals }));
        toast({
          title: `${getShedName(shedId, shed.shedGroupName)} queued`,
          description: "Will sync automatically when connection is restored.",
        });
      }
    });
  };

  // ── Undo saved shed (delete today's readings, re-arm the form) ───────────
  const handleUndoShed = (shedId: number, silos: any[]) => {
    const isArmed = undoArmed[shedId];
    if (!isArmed) {
      // First tap — arm it, auto-disarm after 3 s
      setUndoArmed(prev => ({ ...prev, [shedId]: true }));
      undoTimers.current[shedId] = setTimeout(() => {
        setUndoArmed(prev => { const n = { ...prev }; delete n[shedId]; return n; });
      }, 3000);
      return;
    }
    // Second tap — cancel disarm timer and delete the readings
    clearTimeout(undoTimers.current[shedId]);
    setUndoArmed(prev => { const n = { ...prev }; delete n[shedId]; return n; });
    const readingIds = silos
      .map((s: any) => s.readingId)
      .filter((id: any) => typeof id === "number");
    if (readingIds.length === 0) {
      toast({ variant: "destructive", title: "No reading ID found — try refreshing" });
      return;
    }
    Promise.all(readingIds.map((id: number) => deleteReading.mutateAsync({ id })))
      .then(() => {
        queryClient.invalidateQueries({ queryKey: getGetTodayProgressQueryKey() });
        toast({ title: "Reading removed — re-enter your correct values" });
      })
      .catch(() => toast({ variant: "destructive", title: "Couldn't undo — check your connection" }));
  };

  // ── Loading / empty states ────────────────────────────────────────────────
  if (isLoading && !cachedProgress) {
    return (
      <div className="p-4 space-y-3 pt-4">
        {[1, 2, 3].map(i => <div key={i} className="h-48 rounded-2xl bg-card animate-pulse" />)}
      </div>
    );
  }

  if (!progress) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
        <WifiOff className="h-12 w-12 text-muted-foreground/30" />
        <div>
          <div className="font-bold text-base mb-1">No connection</div>
          <div className="text-sm text-muted-foreground">Connect to load your shed data for the first time.</div>
        </div>
        <button
          onClick={() => queryClient.invalidateQueries({ queryKey: getGetTodayProgressQueryKey() })}
          className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm"
        >
          Retry
        </button>
      </div>
    );
  }

  const sheds = (progress as any).sheds as any[];
  const hasPendingQueue = pendingQueue.length > 0;

  return (
    <div className="px-3 py-3 pb-8">

      {/* Offline banner */}
      {isOffline && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold">
          <WifiOff className="h-3.5 w-3.5 shrink-0" />
          <span>Working offline — readings will sync when reconnected</span>
        </div>
      )}

      {/* Pending sync banner */}
      {hasPendingQueue && !isOffline && (
        <button
          onClick={flushQueue}
          disabled={syncing}
          className="w-full flex items-center justify-center gap-2 mb-3 px-3 py-2 rounded-xl bg-primary/10 border border-primary/20 text-primary text-xs font-semibold active:opacity-70"
        >
          <RefreshCw className={cn("h-3.5 w-3.5 shrink-0", syncing && "animate-spin")} />
          {syncing ? "Syncing…" : `${pendingQueue.length} shed${pendingQueue.length > 1 ? "s" : ""} pending sync — tap to sync now`}
        </button>
      )}

      {/* Feed-program last sync */}
      {lastSync && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-xl bg-primary/10 border border-primary/20 text-primary text-xs font-semibold">
          <span className="text-base">✅</span>
          <span>Synced to Broiler Base Mate <span className="opacity-70 font-medium">{formatRelative(lastSync)}</span></span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {sheds.filter((shed: any) => isShedActive(shed.shedGroupId)).map((shed: any) => {
          const activeLetters = getActiveSiloLetters(shed.shedGroupId);
          const visibleSilos  = shed.silos.filter((s: any) => activeLetters.includes(s.letter));
          const shedQueued    = pendingQueue.find(q => q.shedId === shed.shedGroupId);
          const isSaved       = !shedQueued && visibleSilos.length > 0 && visibleSilos.every((s: any) => s.saved);

          return (
            <div key={shed.shedGroupId} className="bg-card rounded-2xl overflow-hidden border border-border/50 shadow-lg">
              {/* Shed header */}
              <div className="flex items-center justify-between px-4 pt-4 pb-3">
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Sheds</p>
                  <p className="text-2xl font-extrabold text-foreground leading-tight">
                    {getShedName(shed.shedGroupId, shed.shedGroupName).replace(/^Sheds?\s*/i, "")}
                  </p>
                </div>
                <button
                  onClick={() => {
                    if (shedQueued) return;
                    if (isSaved) {
                      handleUndoShed(shed.shedGroupId, visibleSilos);
                    } else {
                      handleSaveShed(shed.shedGroupId);
                    }
                  }}
                  disabled={batchCreate.isPending || deleteReading.isPending || !!shedQueued}
                  className={cn(
                    "flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold transition-all active:scale-95",
                    shedQueued
                      ? "bg-primary/15 text-primary cursor-default"
                      : undoArmed[shed.shedGroupId]
                        ? "bg-amber-500 text-white animate-pulse"
                        : isSaved
                          ? "bg-primary/15 text-primary"
                          : "bg-primary text-primary-foreground"
                  )}
                >
                  {shedQueued ? (
                    <><Check className="w-3.5 h-3.5" />Queued</>
                  ) : undoArmed[shed.shedGroupId] ? (
                    <><Undo2 className="w-3.5 h-3.5" />Undo?</>
                  ) : isSaved ? (
                    <><Check className="w-3.5 h-3.5" />Saved</>
                  ) : (
                    "Save"
                  )}
                </button>
              </div>

              <div className="h-px bg-border mx-4" />

              {/* Silos row */}
              <div className="flex gap-2 px-3 py-3">
                {visibleSilos.map((silo: any, idx: number) => {
                  const colors       = badgeColors(idx);
                  const state        = formState[shed.shedGroupId]?.[silo.siloId];
                  const savedVal     = silo.amountRemaining?.toString() ?? "";
                  const isSiloSaved  = silo.saved;
                  const queuedEntry  = queuedVals[shed.shedGroupId]?.[silo.siloId];

                  return (
                    <div key={silo.siloId} className="flex-1 flex flex-col min-w-0">
                      <div className="flex items-center gap-1.5 mb-2">
                        <span className={cn("w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-extrabold shrink-0", colors.bg, colors.text)}>
                          {silo.letter}
                        </span>
                        <span className="text-xs font-semibold text-muted-foreground truncate">{silo.name}</span>
                      </div>

                      <div className="flex gap-1">
                        <input
                          type="number"
                          inputMode="numeric"
                          placeholder="0"
                          value={state?.amountRemaining ?? ""}
                          onChange={e => handleChange(shed.shedGroupId, silo.siloId, "amountRemaining", e.target.value)}
                          className={cn(
                            "min-w-0 flex-1 bg-secondary border border-border/50 rounded-xl px-2 py-3",
                            "text-lg font-bold text-foreground placeholder:text-muted-foreground/50",
                            "focus:outline-none focus:ring-2 focus:ring-primary/50 text-center transition-all"
                          )}
                        />
                        <button
                          type="button"
                          onClick={() => handleChange(shed.shedGroupId, silo.siloId, "unit", (state?.unit ?? "t") === "kg" ? "t" : "kg")}
                          className={cn(
                            "shrink-0 w-10 rounded-xl border text-xs font-extrabold transition-all",
                            (state?.unit ?? "t") === "t"
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-secondary border-border/50 text-muted-foreground"
                          )}
                        >
                          {(state?.unit ?? "t") === "t" ? "t" : "kg"}
                        </button>
                      </div>

                      <SavedValue
                        value={queuedEntry ? queuedEntry.val : savedVal}
                        unit={queuedEntry ? queuedEntry.unit : (state?.unit ?? "t")}
                        saved={isSiloSaved}
                        queued={!!queuedEntry}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Save All button */}
      {sheds
        .filter((shed: any) => isShedActive(shed.shedGroupId))
        .some((shed: any) => {
          const letters = getActiveSiloLetters(shed.shedGroupId);
          const queued  = pendingQueue.find(q => q.shedId === shed.shedGroupId);
          return !queued && shed.silos.filter((s: any) => letters.includes(s.letter)).some((s: any) => !s.saved);
        }) && (
        <button
          onClick={() => {
            sheds
              .filter((s: any) => isShedActive(s.shedGroupId))
              .forEach((s: any) => handleSaveShed(s.shedGroupId));
          }}
          disabled={batchCreate.isPending}
          className="w-full mt-3 py-4 bg-primary rounded-2xl text-primary-foreground font-bold text-base active:scale-95 transition-all shadow-lg"
        >
          Save All Readings
        </button>
      )}
    </div>
  );
}
