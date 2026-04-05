import { useEffect, useState } from "react";

type Theme = "light" | "dark";

function resolveTheme(): Theme {
  const stored = localStorage.getItem("silo-theme");
  if (stored === "dark" || stored === "light") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    const t = resolveTheme();
    applyTheme(t); // apply immediately to prevent flash
    return t;
  });

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem("silo-theme", theme);
    // Dispatch storage event so Feed Program can react
    window.dispatchEvent(new StorageEvent("storage", {
      key: "silo-theme",
      newValue: theme,
      storageArea: localStorage,
    }));
  }, [theme]);

  const toggle = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  return { theme, toggle };
}
