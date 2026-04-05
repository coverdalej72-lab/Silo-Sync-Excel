import { useState, useCallback } from "react";

export interface SiloConfig {
  letter: string;
  tonnesCapacity: number;
}

export interface ShedGroupConfig {
  shedGroupId: number;
  customName: string;
  silos: SiloConfig[];
}

export interface FarmConfig {
  farmName: string;
  shedGroups: ShedGroupConfig[];
}

const DEFAULT_CONFIG: FarmConfig = {
  farmName: "Double B Farm",
  shedGroups: [
    { shedGroupId: 1, customName: "Sheds 1 & 2",   silos: [{ letter: "A", tonnesCapacity: 0 }, { letter: "B", tonnesCapacity: 0 }, { letter: "C", tonnesCapacity: 0 }] },
    { shedGroupId: 2, customName: "Sheds 3 & 4",   silos: [{ letter: "A", tonnesCapacity: 0 }, { letter: "B", tonnesCapacity: 0 }, { letter: "C", tonnesCapacity: 0 }] },
    { shedGroupId: 3, customName: "Sheds 5 & 6",   silos: [{ letter: "A", tonnesCapacity: 0 }, { letter: "B", tonnesCapacity: 0 }, { letter: "C", tonnesCapacity: 0 }] },
    { shedGroupId: 4, customName: "Sheds 7 & 8",   silos: [{ letter: "A", tonnesCapacity: 0 }, { letter: "B", tonnesCapacity: 0 }, { letter: "C", tonnesCapacity: 0 }] },
    { shedGroupId: 5, customName: "Sheds 9 & 10",  silos: [{ letter: "A", tonnesCapacity: 0 }, { letter: "B", tonnesCapacity: 0 }, { letter: "C", tonnesCapacity: 0 }] },
    { shedGroupId: 6, customName: "Sheds 11 & 12", silos: [{ letter: "A", tonnesCapacity: 0 }, { letter: "B", tonnesCapacity: 0 }, { letter: "C", tonnesCapacity: 0 }] },
  ],
};

const STORAGE_KEY = "silo-farm-config";

function loadConfig(): FarmConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw) as Partial<FarmConfig>;
    return {
      farmName: parsed.farmName ?? DEFAULT_CONFIG.farmName,
      shedGroups: DEFAULT_CONFIG.shedGroups.map((def) => {
        const stored = parsed.shedGroups?.find((s) => s.shedGroupId === def.shedGroupId);
        if (!stored) return def;
        return {
          ...def,
          customName: stored.customName ?? def.customName,
          silos: def.silos.map((ds) => {
            const ss = stored.silos?.find((x) => x.letter === ds.letter);
            return ss ? { ...ds, tonnesCapacity: ss.tonnesCapacity ?? 0 } : ds;
          }),
        };
      }),
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

function saveConfig(config: FarmConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function useFarmConfig() {
  const [config, setConfig] = useState<FarmConfig>(loadConfig);

  const updateFarmName = useCallback((name: string) => {
    setConfig((prev) => {
      const next = { ...prev, farmName: name };
      saveConfig(next);
      return next;
    });
  }, []);

  const updateShedName = useCallback((shedGroupId: number, name: string) => {
    setConfig((prev) => {
      const next = {
        ...prev,
        shedGroups: prev.shedGroups.map((g) =>
          g.shedGroupId === shedGroupId ? { ...g, customName: name } : g
        ),
      };
      saveConfig(next);
      return next;
    });
  }, []);

  const updateSiloTonnage = useCallback((shedGroupId: number, letter: string, tonnes: number) => {
    setConfig((prev) => {
      const next = {
        ...prev,
        shedGroups: prev.shedGroups.map((g) =>
          g.shedGroupId === shedGroupId
            ? {
                ...g,
                silos: g.silos.map((s) =>
                  s.letter === letter ? { ...s, tonnesCapacity: tonnes } : s
                ),
              }
            : g
        ),
      };
      saveConfig(next);
      return next;
    });
  }, []);

  const getShedName = useCallback(
    (shedGroupId: number, fallback?: string) => {
      const group = config.shedGroups.find((g) => g.shedGroupId === shedGroupId);
      return group?.customName || fallback || `Shed Group ${shedGroupId}`;
    },
    [config]
  );

  const getSiloTonnage = useCallback(
    (shedGroupId: number, letter: string) => {
      const group = config.shedGroups.find((g) => g.shedGroupId === shedGroupId);
      return group?.silos.find((s) => s.letter === letter)?.tonnesCapacity ?? 0;
    },
    [config]
  );

  return { config, updateFarmName, updateShedName, updateSiloTonnage, getShedName, getSiloTonnage };
}
