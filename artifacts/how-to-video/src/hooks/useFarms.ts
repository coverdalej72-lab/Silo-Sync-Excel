import { useState } from "react";

export interface Farm {
  id: string;
  name: string;
  apiUrl: string;
}

const FARMS_KEY = "ops-farms";

const DEFAULT_FARMS: Farm[] = [
  { id: "farm-default", name: "My Farm", apiUrl: "" },
];

function load(): Farm[] {
  try {
    const raw = localStorage.getItem(FARMS_KEY);
    if (raw) return JSON.parse(raw) as Farm[];
  } catch {}
  return DEFAULT_FARMS;
}

function persist(farms: Farm[]) {
  try { localStorage.setItem(FARMS_KEY, JSON.stringify(farms)); } catch {}
}

export function useFarms() {
  const [farms, setFarms] = useState<Farm[]>(load);

  const saveFarms = (next: Farm[]) => {
    setFarms(next);
    persist(next);
  };

  const addFarm = (data: Omit<Farm, "id">) => {
    saveFarms([...farms, { ...data, id: `farm-${Date.now()}` }]);
  };

  const updateFarm = (id: string, updates: Partial<Omit<Farm, "id">>) => {
    saveFarms(farms.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  const removeFarm = (id: string) => {
    saveFarms(farms.filter(f => f.id !== id));
  };

  return { farms, addFarm, updateFarm, removeFarm };
}
