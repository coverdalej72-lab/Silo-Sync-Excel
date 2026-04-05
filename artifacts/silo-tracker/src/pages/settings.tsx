import { useState } from "react";
import { FileSpreadsheet, Moon, Sun, Download, ChevronDown, ChevronUp } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { useFarmConfig } from "@/hooks/use-farm-config";
import { Input } from "@/components/ui/input";

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="px-4 py-3 border-b border-border">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</p>
    </div>
  );
}

function SettingsCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {children}
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-border last:border-0 gap-3">
      <span className="text-sm font-medium text-foreground shrink-0 min-w-[80px]">{label}</span>
      {children}
    </div>
  );
}

export default function Settings() {
  const { theme, toggle } = useTheme();
  const { config, updateFarmName, updateShedName, updateSiloTonnage } = useFarmConfig();
  const [expandedSheds, setExpandedSheds] = useState<Record<number, boolean>>({});

  const toggleShed = (id: number) =>
    setExpandedSheds((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="flex flex-col min-h-full bg-background">
      <div className="bg-primary px-4 pt-12 pb-6">
        <h1 className="text-2xl font-bold text-primary-foreground">Settings</h1>
        <p className="text-primary-foreground/70 text-sm mt-1">Customise Silo Mate for your farm</p>
      </div>

      <div className="flex-1 px-4 py-6 space-y-4">

        {/* Farm */}
        <SettingsCard>
          <SectionHeader title="Farm" />
          <FieldRow label="Farm Name">
            <Input
              className="text-right h-9 text-sm"
              defaultValue={config.farmName}
              onBlur={(e) => updateFarmName(e.target.value.trim() || config.farmName)}
            />
          </FieldRow>
        </SettingsCard>

        {/* Sheds & Silos */}
        <SettingsCard>
          <SectionHeader title="Sheds & Silo Tonnages" />
          {config.shedGroups.map((group) => {
            const isOpen = !!expandedSheds[group.shedGroupId];
            return (
              <div key={group.shedGroupId} className="border-b border-border last:border-0">
                {/* Shed header row */}
                <button
                  onClick={() => toggleShed(group.shedGroupId)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors"
                >
                  <span className="font-medium text-foreground text-sm">{group.customName}</span>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{group.silos.map((s) => `${s.letter}: ${s.tonnesCapacity || "—"}t`).join("  ")}</span>
                    {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </button>

                {isOpen && (
                  <div className="bg-muted/20 px-4 pb-4 pt-1 space-y-3">
                    {/* Shed name */}
                    <div>
                      <label className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">Shed Name</label>
                      <Input
                        className="h-9 text-sm"
                        defaultValue={group.customName}
                        onBlur={(e) => updateShedName(group.shedGroupId, e.target.value.trim() || group.customName)}
                      />
                    </div>
                    {/* Silo tonnages */}
                    <div>
                      <label className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">Silo Capacity (tonnes)</label>
                      <div className="grid grid-cols-3 gap-2">
                        {group.silos.map((silo) => (
                          <div key={silo.letter} className="flex flex-col items-center gap-1">
                            <span className="text-xs font-bold text-primary bg-primary/10 w-7 h-7 rounded-md flex items-center justify-center">
                              {silo.letter}
                            </span>
                            <Input
                              type="number"
                              min="0"
                              step="0.5"
                              className="h-9 text-sm text-center"
                              defaultValue={silo.tonnesCapacity || ""}
                              placeholder="0"
                              onBlur={(e) => {
                                const val = parseFloat(e.target.value);
                                updateSiloTonnage(group.shedGroupId, silo.letter, isNaN(val) ? 0 : val);
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </SettingsCard>

        {/* Appearance */}
        <SettingsCard>
          <SectionHeader title="Appearance" />
          <button
            onClick={toggle}
            className="w-full flex items-center justify-between px-4 py-4 hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              {theme === "dark"
                ? <Moon className="h-5 w-5 text-primary" />
                : <Sun className="h-5 w-5 text-primary" />}
              <div className="text-left">
                <p className="font-medium text-foreground">Dark Mode</p>
                <p className="text-sm text-muted-foreground">
                  {theme === "dark" ? "On — tap to switch to light" : "Off — tap to switch to dark"}
                </p>
              </div>
            </div>
            <div className={`w-11 h-6 rounded-full transition-colors ${theme === "dark" ? "bg-primary" : "bg-muted"} flex items-center px-1`}>
              <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${theme === "dark" ? "translate-x-5" : "translate-x-0"}`} />
            </div>
          </button>
        </SettingsCard>

        {/* Downloads */}
        <SettingsCard>
          <SectionHeader title="Downloads" />
          <a
            href="/silo-mate-feed-program.xlsx"
            download="Silo-Mate-Feed-Program.xlsx"
            className="flex items-center justify-between px-4 py-4 hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              <div>
                <p className="font-medium text-foreground">Feed Program Spreadsheet</p>
                <p className="text-sm text-muted-foreground">Download the styled Excel workbook</p>
              </div>
            </div>
            <Download className="h-4 w-4 text-muted-foreground" />
          </a>
        </SettingsCard>

        {/* About */}
        <SettingsCard>
          <SectionHeader title="About" />
          <div className="px-4 py-4 space-y-1">
            <p className="font-medium text-foreground">Silo Mate</p>
            <p className="text-sm text-muted-foreground">Daily silo reading tracker — {config.farmName}</p>
            <p className="text-xs text-muted-foreground pt-2">6 shed groups · 18 silos · A/B/C per shed</p>
          </div>
        </SettingsCard>

      </div>
    </div>
  );
}
