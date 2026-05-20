import { useState, useEffect, useCallback, useRef } from "react";

export interface SiloStatus {
  siloId: number;
  letter: string;
  name: string;
  saved: boolean;
  amountRemaining: number | null;
  feedType: string | null;
  unit: string | null;
}

export interface ShedStatus {
  shedGroupId: number;
  shedGroupName: string;
  allSaved: boolean;
  silos: SiloStatus[];
}

export interface TodayProgress {
  date: string;
  savedCount: number;
  totalCount: number;
  sheds: ShedStatus[];
}

export interface Delivery {
  id: number;
  shedGroupId: number | null;
  shedGroupName: string | null;
  feedType: string;
  amount: number;
  unit: string;
  notes: string | null;
  deliveryDate: string;
}

export interface FarmData {
  progress: TodayProgress | null;
  deliveries: Delivery[];
  loading: boolean;
  error: boolean;
  lastFetched: number | null;
}

export function useFarmData(apiUrl: string) {
  const [data, setData] = useState<FarmData>({
    progress: null,
    deliveries: [],
    loading: true,
    error: false,
    lastFetched: null,
  });

  const abortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setData(prev => ({ ...prev, loading: true, error: false }));

    const base = (apiUrl || window.location.origin).replace(/\/$/, "");

    try {
      const [todayRes, deliveriesRes] = await Promise.all([
        fetch(`${base}/api/readings/today`, {
          signal: ctrl.signal,
          headers: { Accept: "application/json" },
        }),
        fetch(`${base}/api/deliveries`, {
          signal: ctrl.signal,
          headers: { Accept: "application/json" },
        }),
      ]);

      if (!todayRes.ok || !deliveriesRes.ok) throw new Error("bad-response");

      const [progress, deliveries] = await Promise.all([
        todayRes.json() as Promise<TodayProgress>,
        deliveriesRes.json() as Promise<Delivery[]>,
      ]);

      setData({ progress, deliveries, loading: false, error: false, lastFetched: Date.now() });
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      setData(prev => ({ ...prev, loading: false, error: true, lastFetched: Date.now() }));
    }
  }, [apiUrl]);

  useEffect(() => {
    fetchData();
    return () => abortRef.current?.abort();
  }, [fetchData]);

  return { ...data, refresh: fetchData };
}
