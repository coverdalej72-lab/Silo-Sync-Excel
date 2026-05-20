import { useState, useEffect } from "react";
import { useAuth } from "@clerk/react";

export interface Farm {
  id: number;
  name: string;
  planTier: string;
  clerkUserId: string | null;
  createdAt: string;
}

export function useFarms() {
  const [farms, setFarms] = useState<Farm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { getToken } = useAuth();

  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

  const authHeaders = async (): Promise<Record<string, string>> => {
    const token = await getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`${BASE}/api/farms`, { headers: await authHeaders() });
      if (!resp.ok) {
        setError(`Failed to load farms (${resp.status})`);
        setFarms([]);
        return;
      }
      const data = (await resp.json()) as Array<{
        id: number;
        name: string;
        plan_tier?: string;
        planTier?: string;
        clerk_user_id?: string | null;
        clerkUserId?: string | null;
        created_at?: string;
        createdAt?: string;
      }>;
      setFarms(data.map(f => ({
        id: f.id,
        name: f.name,
        planTier: f.planTier ?? f.plan_tier ?? "bronze",
        clerkUserId: f.clerkUserId ?? f.clerk_user_id ?? null,
        createdAt: f.createdAt ?? f.created_at ?? "",
      })));
    } catch {
      setError("Network error loading farms");
      setFarms([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const createFarm = async (name: string, planTier: string, managerEmail?: string) => {
    const resp = await fetch(`${BASE}/api/farms`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...await authHeaders() },
      body: JSON.stringify({ name, planTier, managerEmail }),
    });
    if (!resp.ok) throw new Error(`Failed to create farm (${resp.status})`);
    await load();
    return (await resp.json()) as Farm;
  };

  const updateFarm = async (id: number, updates: { name?: string; planTier?: string }) => {
    const resp = await fetch(`${BASE}/api/farms/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...await authHeaders() },
      body: JSON.stringify(updates),
    });
    if (!resp.ok) throw new Error(`Failed to update farm (${resp.status})`);
    await load();
  };

  const removeFarm = async (id: number) => {
    const resp = await fetch(`${BASE}/api/farms/${id}`, {
      method: "DELETE",
      headers: await authHeaders(),
    });
    if (!resp.ok) throw new Error(`Failed to delete farm (${resp.status})`);
    await load();
  };

  return { farms, loading, error, refresh: load, createFarm, updateFarm, removeFarm };
}
