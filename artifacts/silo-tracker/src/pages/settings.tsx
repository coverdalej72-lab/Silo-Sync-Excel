import { useState } from "react";
import { FileSpreadsheet, Download, ChevronDown, ChevronUp, RefreshCw, Plus, Minus } from "lucide-react";
import { useFarmConfig } from "@/hooks/use-farm-config";
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

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200",
        on ? "bg-primary" : "bg-secondary border border-border/50"
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

export default function Settings() {
  const { config, updateFarmName, updateShedName, updateSiloTonnage, toggleShedActive, addSilo, removeSilo } = useFarmConfig();
  const { toast } = useToast();
  const [expandedSheds, setExpandedSheds] = useState<Record<number, boolean>>({});
  const [resetting, setResetting] = useState(false);

  const handleNewBatch = async () => {
    if (!confirm(
      "Start New Batch?\n\nThis will delete ALL silo readings and delivery records.\n\nThis cannot be undone."
    )) return;
    setResetting(true);
    try {
      const res = await fetch("/api/batch/reset", { method: "DELETE" });
      if (res.ok) {
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

      {/* Farm */}
      <div>
        <SectionLabel title="Farm" />
        <div className="bg-card border border-border/50 rounded-2xl overflow-hidden">
          <SettingsRow label="Farm Name" last>
            <DarkInput
              value={config.farmName}
              onBlur={e => updateFarmName(e.target.value.trim() || config.farmName)}
            />
          </SettingsRow>
        </div>
      </div>

      {/* Sheds & Silos */}
      <div>
        <SectionLabel title="Sheds & Silo Capacity" />
        <div className="bg-card border border-border/50 rounded-2xl overflow-hidden">
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
                        onBlur={e => updateShedName(group.shedGroupId, e.target.value.trim() || group.customName)}
                        className="w-full bg-secondary border border-border/50 rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
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
                            onClick={() => removeSilo(group.shedGroupId)}
                            disabled={group.silos.length <= 1}
                            className="w-7 h-7 rounded-lg bg-secondary border border-border/50 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30 transition-opacity"
                            title="Remove silo"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => addSilo(group.shedGroupId)}
                            disabled={group.silos.length >= 3}
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
                                onBlur={e => {
                                  const val = parseFloat(e.target.value);
                                  updateSiloTonnage(group.shedGroupId, silo.letter, isNaN(val) ? 0 : val);
                                }}
                                className="w-full bg-secondary border border-border/50 rounded-xl px-2 py-2 text-sm text-center font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground/40"
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
                <p className="font-semibold text-sm text-foreground">Feed Program Spreadsheet</p>
                <p className="text-xs text-muted-foreground">Download the styled Excel workbook</p>
              </div>
            </div>
            <Download className="h-4 w-4 text-muted-foreground" />
          </a>
        </div>
      </div>

      {/* New Batch */}
      <div>
        <SectionLabel title="Batch" />
        <div className="bg-card border border-border/50 rounded-2xl overflow-hidden">
          <div className="px-4 py-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-destructive/15 flex items-center justify-center shrink-0 mt-0.5">
                <RefreshCw className="h-5 w-5 text-destructive" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-foreground">Start New Batch</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Clears all silo readings and delivery records so you can start fresh for the next batch. The Feed Program spreadsheet should also be reset separately.
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
