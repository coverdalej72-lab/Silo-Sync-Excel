import { useState, useEffect } from "react";
import { useAuth } from "@clerk/react";

export interface FarmMine {
  id: number;
  name: string;
  planTier: string;
}

export function useFarmMine() {
  const [farm, setFarm] = useState<FarmMine | null>(null);
  const { getToken, isSignedIn } = useAuth();
  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

  useEffect(() => {
    if (!isSignedIn) return;
    let cancelled = false;

    const load = async () => {
      try {
        const token = await getToken();
        const resp = await fetch(`${BASE}/api/farms/mine`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!resp.ok || cancelled) return;
        const data = await resp.json() as { id: number; name: string; plan_tier?: string; planTier?: string };
        if (!cancelled) {
          setFarm({
            id: data.id,
            name: data.name,
            planTier: data.planTier ?? data.plan_tier ?? "bronze",
          });
        }
      } catch {
        // silently ignore — fallback to localStorage farm name in layout
      }
    };

    load();
    return () => { cancelled = true; };
  }, [isSignedIn, getToken, BASE]);

  return farm;
}
