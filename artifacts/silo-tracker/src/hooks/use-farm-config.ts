import { useState, useCallback } from "react";

export interface SiloConfig {
  letter: string;
  tonnesCapacity: number;
}

export interface ShedGroupConfig {
  shedGroupId: number;
  customName: string;
  active: boolean;
  silos: SiloConfig[];
}

export interface FarmConfig {
  farmName: string;
  shedGroups: ShedGroupConfig[];
}

const SILO_LETTERS = ["A", "B", "C"] as const;

const DEFAULT_CONFIG: FarmConfig = {
  farmName: "Double B Farm",
  shedGroups: [
    { shedGroupId: 1,  customName: "Sheds 1 & 2",   active: true,  silos: [{ letter: "A", tonnesCapacity: 0 }, { letter: "B", tonnesCapacity: 0 }, { letter: "C", tonnesCapacity: 0 }] },
    { shedGroupId: 2,  customName: "Sheds 3 & 4",   active: true,  silos: [{ letter: "A", tonnesCapacity: 0 }, { letter: "B", tonnesCapacity: 0 }, { letter: "C", tonnesCapacity: 0 }] },
    { shedGroupId: 3,  customName: "Sheds 5 & 6",   active: true,  silos: [{ letter: "A", tonnesCapacity: 0 }, { letter: "B", tonnesCapacity: 0 }, { letter: "C", tonnesCapacity: 0 }] },
    { shedGroupId: 4,  customName: "Sheds 7 & 8",   active: true,  silos: [{ letter: "A", tonnesCapacity: 0 }, { letter: "B", tonnesCapacity: 0 }, { letter: "C", tonnesCapacity: 0 }] },
    { shedGroupId: 5,  customName: "Sheds 9 & 10",  active: true,  silos: [{ letter: "A", tonnesCapacity: 0 }, { letter: "B", tonnesCapacity: 0 }, { letter: "C", tonnesCapacity: 0 }] },
    { shedGroupId: 6,  customName: "Sheds 11 & 12", active: true,  silos: [{ letter: "A", tonnesCapacity: 0 }, { letter: "B", tonnesCapacity: 0 }, { letter: "C", tonnesCapacity: 0 }] },
    { shedGroupId: 7,  customName: "Sheds 13 & 14", active: false, silos: [{ letter: "A", tonnesCapacity: 0 }, { letter: "B", tonnesCapacity: 0 }, { letter: "C", tonnesCapacity: 0 }] },
    { shedGroupId: 8,  customName: "Sheds 15 & 16", active: false, silos: [{ letter: "A", tonnesCapacity: 0 }, { letter: "B", tonnesCapacity: 0 }, { letter: "C", tonnesCapacity: 0 }] },
    { shedGroupId: 9,  customName: "Sheds 17 & 18", active: false, silos: [{ letter: "A", tonnesCapacity: 0 }, { letter: "B", tonnesCapacity: 0 }, { letter: "C", tonnesCapacity: 0 }] },
    { shedGroupId: 10, customName: "Sheds 19 & 20", active: false, silos: [{ letter: "A", tonnesCapacity: 0 }, { letter: "B", tonnesCapacity: 0 }, { letter: "C", tonnesCapacity: 0 }] },
  ],
};

export const STORAGE_KEY = "silo-farm-config";

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
        const silos: SiloConfig[] =
          stored.silos && stored.silos.length > 0
            ? stored.silos.map((ss) => ({ letter: ss.letter, tonnesCapacity: ss.tonnesCapacity ?? 0 }))
            : def.silos;
        return {
          ...def,
          customName: stored.customName ?? def.customName,
          active: stored.active !== false,
          silos,
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

  const toggleShedActive = useCallback((shedGroupId: number) => {
    setConfig((prev) => {
      const next = {
        ...prev,
        shedGroups: prev.shedGroups.map((g) =>
          g.shedGroupId === shedGroupId ? { ...g, active: !g.active } : g
        ),
      };
      saveConfig(next);
      return next;
    });
  }, []);

  const addSilo = useCallback((shedGroupId: number) => {
    setConfig((prev) => {
      const next = {
        ...prev,
        shedGroups: prev.shedGroups.map((g) => {
          if (g.shedGroupId !== shedGroupId) return g;
          if (g.silos.length >= SILO_LETTERS.length) return g;
          const nextLetter = SILO_LETTERS[g.silos.length];
          return { ...g, silos: [...g.silos, { letter: nextLetter, tonnesCapacity: 0 }] };
        }),
      };
      saveConfig(next);
      return next;
    });
  }, []);

  const removeSilo = useCallback((shedGroupId: number) => {
    setConfig((prev) => {
      const next = {
        ...prev,
        shedGroups: prev.shedGroups.map((g) => {
          if (g.shedGroupId !== shedGroupId) return g;
          if (g.silos.length <= 1) return g;
          return { ...g, silos: g.silos.slice(0, -1) };
        }),
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
            ? { ...g, silos: g.silos.map((s) => s.letter === letter ? { ...s, tonnesCapacity: tonnes } : s) }
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

  const isShedActive = useCallback(
    (shedGroupId: number) => {
      const group = config.shedGroups.find((g) => g.shedGroupId === shedGroupId);
      return group?.active !== false;
    },
    [config]
  );

  const getActiveSiloLetters = useCallback(
    (shedGroupId: number) => {
      const group = config.shedGroups.find((g) => g.shedGroupId === shedGroupId);
      return group?.silos.map((s) => s.letter) ?? ["A", "B", "C"];
    },
    [config]
  );

  return {
    config,
    updateFarmName,
    updateShedName,
    toggleShedActive,
    addSilo,
    removeSilo,
    updateSiloTonnage,
    getShedName,
    getSiloTonnage,
    isShedActive,
    getActiveSiloLetters,
  };
}
