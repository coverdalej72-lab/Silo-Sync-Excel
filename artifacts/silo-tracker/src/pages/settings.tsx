import { useState, useEffect } from "react";
import { FileSpreadsheet, Download, ChevronDown, ChevronUp, RefreshCw, Plus, Minus, Lock, LockOpen, Link2, Check, LayoutGrid, Sun, Moon, Hash, Smartphone, Share2 } from "lucide-react";
import { useFarmConfig } from "@/hooks/use-farm-config";
import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

function SectionLabel({ title }: { title: string }) {
  return (
    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1 mb-2 mt-1">
      {title}
    </p>
  );
}

function SettingsRow({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between px-4 py-3 gap-3", !last && "border-b border-border/40")}>
      <span className="text-sm font-medium text-foreground shrink-0">{label}</span>
      {children}
    </div>
  );
}

function DarkInput({ value, onBlur, placeholder, type = "text" }: {
  value?: string | number;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      defaultValue={value}
      onBlur={onBlur}
      placeholder={placeholder}
      className="bg-secondary border border-border/50 rounded-lg px-3 py-2 text-sm text-right text-foreground w-36 focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground/50"
    />
  );
}

function Toggle({ on, onChange, disabled }: { on: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={disabled ? undefined : onChange}
      disabled={disabled}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200",
        on ? "bg-primary" : "bg-secondary border border-border/50",
        disabled && "opacity-40 cursor-not-allowed"
      )}
      aria-checked={on}
      role="switch"
    >
      <span
        className={cn(
          "inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200",
          on ? "translate-x-6" : "translate-x-1"
        )}
      />
    </button>
  );
}

function BatchNumberRow() {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(() => localStorage.getItem("silo-batch-num") ?? "");
  const [syncedVal, setSyncedVal] = useState(() => localStorage.getItem("silo-batch-num") ?? "");
  const { toast } = useToast();

  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === "silo-batch-num") {
        const newVal = e.newValue ?? "";
        setSyncedVal(newVal);
        if (!editing) setVal(newVal);
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [editing]);

  const save = () => {
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed) && parsed > 0) {
      localStorage.setItem("silo-batch-num", String(parsed));
      setSyncedVal(String(parsed));
      toast({ title: `Batch #${parsed} saved` });
    } else {
      const current = localStorage.getItem("silo-batch-num") ?? "";
      setVal(current);
      setSyncedVal(current);
    }
    setEditing(false);
  };

  const current = syncedVal || localStorage.getItem("silo-batch-num") || "";
  const displayNum = current ? parseInt(current, 10) : null;

  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
        <Hash className="h-5 w-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-foreground">Current Batch</p>
        <p className="text-xs text-muted-foreground mt-0.5">Batch number shown in Batch Results</p>
      </div>
      {editing ? (
        <input
          autoFocus
          type="number"
          value={val}
          onChange={e => setVal(e.target.value)}
          onBlur={save}
          onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") { setVal(current ?? ""); setEditing(false); } }}
          className="w-20 bg-secondary border border-border/50 rounded-lg px-3 py-2 text-sm text-right font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      ) : (
        <button
          onClick={() => { setVal(current ?? ""); setEditing(true); }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold border border-border/50 text-foreground hover:bg-secondary transition-colors"
        >
          {displayNum ? `#${displayNum}` : <span className="text-muted-foreground">Not set</span>}
          <span className="text-[10px] text-muted-foreground">✏</span>
        </button>
      )}
    </div>
  );
}

function AddToHomeScreenSection() {
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [installed, setInstalled] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;
    setIsInstalled(standalone);
    setIsIos(/iphone|ipad|ipod/i.test(navigator.userAgent));

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler as any);
    return () => window.removeEventListener("beforeinstallprompt", handler as any);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setInstalled(true);
      toast({ title: "App installed!", description: "Find Silo Mate on your home screen." });
    }
    setDeferredPrompt(null);
  };

  return (
    <div>
      <SectionLabel title="Add to Home Screen" />
      <div className="bg-card border border-border/50 rounded-2xl overflow-hidden">
        {isInstalled || installed ? (
          <div className="flex items-center gap-3 px-4 py-4">
            <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
              <Check className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-sm text-foreground">Already installed</p>
              <p className="text-xs text-muted-foreground mt-0.5">Silo Mate is on your home screen</p>
            </div>
          </div>
        ) : isIos ? (
          <div className="px-4 py-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                <Smartphone className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-sm text-foreground">iPhone / iPad</p>
                <p className="text-xs text-muted-foreground mt-0.5">Follow these steps in Safari</p>
              </div>
            </div>
            <div className="space-y-2">
              {[
                { step: "1", text: <>Tap the <Share2 className="inline w-3.5 h-3.5 mb-0.5" /> <strong>Share</strong> button at the bottom of Safari</> },
                { step: "2", text: <><strong>Scroll down</strong> and tap <strong>"Add to Home Screen"</strong></> },
                { step: "3", text: <>Tap <strong>"Add"</strong> — the app will appear on your home screen</> },
              ].map(({ step, text }) => (
                <div key={step} className="flex items-start gap-3 bg-secondary/50 rounded-xl px-3 py-2.5">
                  <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">{step}</span>
                  <p className="text-sm text-foreground">{text}</p>
                </div>
              ))}
            </div>
          </div>
        ) : deferredPrompt ? (
          <div className="flex items-center gap-3 px-4 py-4">
            <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
              <Smartphone className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-foreground">Add to Home Screen</p>
              <p className="text-xs text-muted-foreground mt-0.5">Install for quick access from your home screen</p>
            </div>
            <button
              onClick={handleInstall}
              className="shrink-0 bg-primary text-primary-foreground font-bold text-xs px-4 py-2 rounded-xl"
            >
              Install
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3 px-4 py-4">
            <div className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center shrink-0">
              <Smartphone className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="font-semibold text-sm text-foreground">Open on your phone</p>
              <p className="text-xs text-muted-foreground mt-0.5">Open this app in your phone's browser, then use the Settings page to add it to your home screen</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DefaultUnitToggle() {
  const [unit, setUnit] = useState(() => localStorage.getItem("silo-default-unit") || "kg");
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === "silo-default-unit" && e.newValue) setUnit(e.newValue);
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);
  return (
    <div className="flex rounded-xl overflow-hidden border border-border/50">
      {(["kg", "t"] as const).map(u => (
        <button
          key={u}
          onClick={() => { localStorage.setItem("silo-default-unit", u); setUnit(u); }}
          className={cn(
            "px-4 py-2 text-sm font-bold transition-colors",
            unit === u
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-muted-foreground hover:text-foreground"
          )}
        >
          {u}
        </button>
      ))}
    </div>
  );
}

export default function Settings() {
  const { config, updateFarmName, updateShedName, updateSiloTonnage, toggleShedActive, addSilo, removeSilo, toggleSetupLock } = useFarmConfig();
  const { theme, toggle: toggleTheme } = useTheme();
  const { toast } = useToast();
  const [expandedSheds, setExpandedSheds] = useState<Record<number, boolean>>({});
  const [resetting, setResetting] = useState(false);
  const [farmNameInput, setFarmNameInput] = useState(config.farmName);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  const locked = config.setupLocked;

  const copyLink = async (key: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const el = document.createElement("textarea");
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopiedLink(key);
    setTimeout(() => setCopiedLink(null), 2500);
  };

  const handleNewBatch = async () => {
    if (!confirm(
      "Start New Batch?\n\nThis will delete ALL silo readings and delivery records.\n\nThis cannot be undone."
    )) return;
    setResetting(true);
    try {
      const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${BASE}/api/batch/reset`, { method: "DELETE" });
      if (res.ok) {
        // Fetch and store the new batch version so Feed Mate syncs on next load
        try {
          const vRes = await fetch(`${BASE}/api/batch/version`);
          if (vRes.ok) {
            const vData = await vRes.json() as { version: string | null };
            if (vData.version) localStorage.setItem("silo-batch-version", vData.version);
          }
        } catch { /* best effort */ }
        // Clear local batch data on this device too
        ["silo-batch-catches", "silo-batch-farm-name", "silo-morts-log", "silo-culls-log"].forEach(k => localStorage.removeItem(k));
        toast({ title: "New batch started", description: "All readings and deliveries cleared." });
      } else {
        toast({ variant: "destructive", title: "Reset failed", description: "Please try again." });
      }
    } catch {
      toast({ variant: "destructive", title: "Reset failed", description: "Could not reach server." });
    } finally {
      setResetting(false);
    }
  };

  const toggleShed = (id: number) =>
    setExpandedSheds(prev => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="px-3 py-3 pb-8 space-y-5">

      {/* Farm Setup Lock */}
      <div>
        <SectionLabel title="Farm Setup" />
        <div className={cn(
          "rounded-2xl border overflow-hidden transition-colors",
          locked
            ? "bg-amber-500/10 border-amber-500/40"
            : "bg-card border-border/50"
        )}>
          <div className="flex items-center gap-4 px-4 py-4">
            <div className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
              locked ? "bg-amber-500/20" : "bg-secondary"
            )}>
              {locked
                ? <Lock className="h-5 w-5 text-amber-400" />
                : <LockOpen className="h-5 w-5 text-muted-foreground" />
              }
            </div>
            <div className="flex-1 min-w-0">
              <p className={cn("font-bold text-sm", locked ? "text-amber-400" : "text-foreground")}>
                {locked ? "Setup Locked" : "Setup Unlocked"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {locked
                  ? "Farm name and shed/silo configuration are protected."
                  : "Farm name, sheds, and silos are editable below."}
              </p>
            </div>
            <button
              onClick={toggleSetupLock}
              className={cn(
                "px-4 py-2 rounded-xl text-sm font-bold border-2 transition-all active:scale-95 shrink-0",
                locked
                  ? "border-amber-500/60 text-amber-400 hover:bg-amber-500/20"
                  : "border-primary/60 text-primary hover:bg-primary/10"
              )}
            >
              {locked ? "Unlock" : "Lock"}
            </button>
          </div>
        </div>
      </div>

      {/* Farm */}
      <div>
        <SectionLabel title="Farm" />
        <div className={cn("bg-card border border-border/50 rounded-2xl overflow-hidden", locked && "opacity-60")}>
          <SettingsRow label="Farm Name" last>
            <input
              type="text"
              value={farmNameInput}
              onChange={e => !locked && setFarmNameInput(e.target.value)}
              onBlur={() => {
                if (locked) return;
                const name = farmNameInput.trim();
                if (name) {
                  updateFarmName(name);
                } else {
                  setFarmNameInput(config.farmName);
                }
              }}
              disabled={locked}
              placeholder="Enter farm name"
              className={cn(
                "bg-secondary border border-border/50 rounded-lg px-3 py-2 text-sm text-right text-foreground w-40 focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground/50",
                locked && "cursor-not-allowed"
              )}
            />
          </SettingsRow>
        </div>
      </div>

      {/* Sheds & Silos */}
      <div>
        <SectionLabel title="Sheds & Silo Capacity" />
        <div className={cn("bg-card border border-border/50 rounded-2xl overflow-hidden", locked && "opacity-60")}>
          {config.shedGroups.map((group, gi) => {
            const isOpen = !!expandedSheds[group.shedGroupId];
            const isLast = gi === config.shedGroups.length - 1;
            return (
              <div key={group.shedGroupId} className={cn(!isLast && "border-b border-border/40")}>
                {/* Header row */}
                <div className="flex items-center px-4 py-3.5 gap-3">
                  {/* Active toggle */}
                  <Toggle
                    on={group.active}
                    onChange={() => toggleShedActive(group.shedGroupId)}
                    disabled={locked}
                  />

                  {/* Expand/collapse button */}
                  <button
                    onClick={() => toggleShed(group.shedGroupId)}
                    className="flex-1 flex items-center justify-between hover:opacity-80 transition-opacity min-w-0"
                  >
                    <span className={cn(
                      "font-semibold text-sm transition-colors",
                      group.active ? "text-foreground" : "text-muted-foreground line-through"
                    )}>
                      {group.customName}
                    </span>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground ml-3">
                      <span className="hidden sm:block">
                        {group.silos.map(s => s.letter).join(" / ")}
                        {group.silos.some(s => s.tonnesCapacity > 0)
                          ? " · " + group.silos.map(s => `${s.letter}:${s.tonnesCapacity}t`).join(" ")
                          : ""}
                      </span>
                      {isOpen ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
                    </div>
                  </button>
                </div>

                {isOpen && (
                  <div className="bg-secondary/30 px-4 pt-2 pb-4 space-y-4 border-t border-border/30">
                    {/* Shed custom name */}
                    <div>
                      <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest block mb-1.5">
                        Shed Name
                      </label>
                      <input
                        type="text"
                        defaultValue={group.customName}
                        disabled={locked}
                        onBlur={e => {
                          if (!locked) updateShedName(group.shedGroupId, e.target.value.trim() || group.customName);
                        }}
                        className={cn(
                          "w-full bg-secondary border border-border/50 rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50",
                          locked && "cursor-not-allowed"
                        )}
                      />
                    </div>

                    {/* Silo capacities + add/remove */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">
                          Silos ({group.silos.length})
                        </label>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => !locked && removeSilo(group.shedGroupId)}
                            disabled={locked || group.silos.length <= 1}
                            className="w-7 h-7 rounded-lg bg-secondary border border-border/50 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30 transition-opacity"
                            title="Remove silo"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => !locked && addSilo(group.shedGroupId)}
                            disabled={locked || group.silos.length >= 3}
                            className="w-7 h-7 rounded-lg bg-secondary border border-border/50 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30 transition-opacity"
                            title="Add silo"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${group.silos.length}, 1fr)` }}>
                        {group.silos.map((silo, si) => {
                          const badgeCls = si === 0
                            ? "bg-primary/20 text-primary"
                            : si === 1
                            ? "bg-blue-500/20 text-blue-400"
                            : "bg-amber-500/20 text-amber-400";
                          return (
                            <div key={silo.letter} className="flex flex-col items-center gap-1.5">
                              <span className={cn("text-xs font-extrabold w-7 h-7 rounded-md flex items-center justify-center", badgeCls)}>
                                {silo.letter}
                              </span>
                              <input
                                type="number"
                                min="0"
                                step="0.5"
                                defaultValue={silo.tonnesCapacity || ""}
                                placeholder="0t"
                                disabled={locked}
                                onBlur={e => {
                                  if (!locked) {
                                    const val = parseFloat(e.target.value);
                                    updateSiloTonnage(group.shedGroupId, silo.letter, isNaN(val) ? 0 : val);
                                  }
                                }}
                                className={cn(
                                  "w-full bg-secondary border border-border/50 rounded-xl px-2 py-2 text-sm text-center font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground/40",
                                  locked && "cursor-not-allowed"
                                )}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Recording */}
      <div>
        <SectionLabel title="Recording" />
        <div className="bg-card border border-border/50 rounded-2xl overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-4">
            <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center shrink-0 text-base font-extrabold text-primary">
              t
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold leading-tight">Default Unit</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Unit pre-selected when entering silo readings
              </p>
            </div>
            <DefaultUnitToggle />
          </div>
        </div>
      </div>

      {/* Appearance */}
      <div>
        <SectionLabel title="Appearance" />
        <div className="bg-card border border-border/50 rounded-2xl overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-4">
            <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
              {theme === "dark" ? (
                <Moon className="w-4 h-4 text-primary" />
              ) : (
                <Sun className="w-4 h-4 text-primary" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold leading-tight">Theme</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {theme === "dark" ? "Dark mode" : "Light mode"}
              </p>
            </div>
            <button
              onClick={toggleTheme}
              className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none"
              style={{
                backgroundColor: theme === "dark" ? "hsl(142 71% 45%)" : "hsl(220 15% 80%)",
              }}
              aria-label="Toggle theme"
            >
              <span
                className="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
                style={{ transform: theme === "dark" ? "translateX(1.5rem)" : "translateX(0.25rem)" }}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Share */}
      <div>
        <SectionLabel title="Share App Links" />
        <div className="bg-card border border-border/50 rounded-2xl overflow-hidden">
          {/* Feed Mate link */}
          {(() => {
            const feedUrl = `${window.location.origin}/feed-program/`;
            const feedCopied = copiedLink === "feed";
            return (
              <div className="flex items-center gap-3 px-4 py-4 border-b border-border/40">
                <div className="w-9 h-9 rounded-xl bg-[#217346]/20 flex items-center justify-center shrink-0">
                  <FileSpreadsheet className="h-5 w-5 text-[#4caf50]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-foreground">Feed Mate</p>
                  <p className="text-xs text-muted-foreground truncate">{feedUrl}</p>
                </div>
                <button
                  onClick={() => copyLink("feed", feedUrl)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all shrink-0",
                    feedCopied
                      ? "border-primary/60 text-primary bg-primary/10"
                      : "border-border/50 text-muted-foreground hover:text-foreground hover:border-border"
                  )}
                >
                  {feedCopied
                    ? <><Check className="w-3.5 h-3.5" /> Copied!</>
                    : <><Link2 className="w-3.5 h-3.5" /> Copy Link</>
                  }
                </button>
              </div>
            );
          })()}

          {/* Silo Mate link */}
          {(() => {
            const siloUrl = `${window.location.origin}/`;
            const siloCopied = copiedLink === "silo";
            return (
              <div className="flex items-center gap-3 px-4 py-4">
                <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                  <LayoutGrid className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-foreground">Silo Mate</p>
                  <p className="text-xs text-muted-foreground truncate">{siloUrl}</p>
                </div>
                <button
                  onClick={() => copyLink("silo", siloUrl)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all shrink-0",
                    siloCopied
                      ? "border-primary/60 text-primary bg-primary/10"
                      : "border-border/50 text-muted-foreground hover:text-foreground hover:border-border"
                  )}
                >
                  {siloCopied
                    ? <><Check className="w-3.5 h-3.5" /> Copied!</>
                    : <><Link2 className="w-3.5 h-3.5" /> Copy Link</>
                  }
                </button>
              </div>
            );
          })()}
        </div>
        <p className="text-[10px] text-muted-foreground px-1 mt-1.5">
          Paste either link in any browser on PC, Mac, tablet, or phone to open the app.
        </p>
      </div>

      {/* Add to Home Screen */}
      <AddToHomeScreenSection />

      {/* Downloads */}
      <div>
        <SectionLabel title="Downloads" />
        <div className="bg-card border border-border/50 rounded-2xl overflow-hidden">
          <a
            href="/silo-mate-feed-program.xlsx"
            download="Silo-Mate-Feed-Program.xlsx"
            className="flex items-center justify-between px-4 py-4 hover:bg-secondary/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center">
                <FileSpreadsheet className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-sm text-foreground">Feed Mate Spreadsheet</p>
                <p className="text-xs text-muted-foreground">Download the styled Excel workbook</p>
              </div>
            </div>
            <Download className="h-4 w-4 text-muted-foreground" />
          </a>
        </div>
      </div>

      {/* Batch */}
      <div>
        <SectionLabel title="Batch" />
        <div className="bg-card border border-border/50 rounded-2xl overflow-hidden">

          {/* Batch number */}
          <BatchNumberRow />

          <div className="border-t border-border/40 px-4 py-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-destructive/15 flex items-center justify-center shrink-0 mt-0.5">
                <RefreshCw className="h-5 w-5 text-destructive" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-foreground">Start New Batch</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  The <span className="font-semibold text-foreground">Feed Mate</span> is the primary place to start a new batch. Use this button only if you need to reset from the field — it will clear all readings, deliveries, and both apps' local data automatically.
                </p>
              </div>
            </div>
            <button
              onClick={handleNewBatch}
              disabled={resetting}
              className="w-full py-3 rounded-xl text-sm font-bold border-2 border-destructive text-destructive hover:bg-destructive hover:text-white active:scale-95 transition-all disabled:opacity-50"
            >
              {resetting ? "Clearing…" : "Start New Batch"}
            </button>
          </div>
        </div>
      </div>

      {/* About */}
      <div>
        <SectionLabel title="About" />
        <div className="bg-card border border-border/50 rounded-2xl px-4 py-4 space-y-1">
          <p className="font-bold text-foreground">Silo Mate</p>
          <p className="text-sm text-muted-foreground">Daily silo reading tracker — {config.farmName}</p>
          <p className="text-xs text-muted-foreground pt-1">
            {config.shedGroups.filter(g => g.active).length} active shed groups ·{" "}
            {config.shedGroups.filter(g => g.active).reduce((acc, g) => acc + g.silos.length, 0)} silos
          </p>
        </div>
      </div>

    </div>
  );
}
