import { useState, useEffect } from "react";
import {
  useGetTodayProgress,
  getGetTodayProgressQueryKey,
  useBatchCreateReadings
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useFarmConfig } from "@/hooks/use-farm-config";
import { cn } from "@/lib/utils";

type SiloFormState = {
  amountRemaining: string;
  unit: string;
  feedType: string;
};

const SILO_BADGE_COLORS = [
  { bg: "bg-primary",          text: "text-primary-foreground"  }, // A — green
  { bg: "bg-blue-500",         text: "text-white"               }, // B — blue
  { bg: "bg-amber-500",        text: "text-white"               }, // C — amber
  { bg: "bg-purple-500",       text: "text-white"               }, // D — purple
];

function badgeColors(index: number) {
  return SILO_BADGE_COLORS[index] ?? SILO_BADGE_COLORS[0];
}

function SavedValue({ value, unit, saved }: { value: string; unit: string; saved: boolean }) {
  if (!saved) return (
    <div className="text-center mt-1.5">
      <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Saved</p>
      <div className="w-6 h-0.5 bg-amber-500 mx-auto mt-1 rounded-full" />
    </div>
  );
  const num = parseFloat(value);
  const display = !isNaN(num) ? num.toLocaleString() : value || "0";
  return (
    <div className="text-center mt-1.5">
      <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Saved</p>
      <p className="text-xs font-bold text-primary">{display}</p>
    </div>
  );
}

export default function Home() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const batchCreate = useBatchCreateReadings();
  const { getShedName, isShedActive, getActiveSiloLetters } = useFarmConfig();

  const { data: progress, isLoading } = useGetTodayProgress({
    query: { queryKey: getGetTodayProgressQueryKey() }
  });

  const [formState, setFormState] = useState<Record<number, Record<number, SiloFormState>>>({});

  useEffect(() => {
    if (progress) {
      const newState: Record<number, Record<number, SiloFormState>> = {};
      progress.sheds.forEach(shed => {
        newState[shed.shedGroupId] = {};
        shed.silos.forEach(silo => {
          newState[shed.shedGroupId][silo.siloId] = {
            amountRemaining: silo.amountRemaining !== null ? silo.amountRemaining.toString() : "",
            unit: silo.unit || "kg",
            feedType: silo.feedType || silo.defaultFeedType || "",
          };
        });
      });
      setFormState(newState);
    }
  }, [progress]);

  const handleChange = (shedId: number, siloId: number, field: keyof SiloFormState, value: string) => {
    setFormState(prev => ({
      ...prev,
      [shedId]: { ...prev[shedId], [siloId]: { ...prev[shedId]?.[siloId], [field]: value } }
    }));
  };

  const handleSaveShed = (shedId: number) => {
    if (!progress) return;
    const shed = progress.sheds.find(s => s.shedGroupId === shedId);
    if (!shed) return;
    const activeSiloLetters = getActiveSiloLetters(shedId);
    const readingsToSave = shed.silos
      .filter(silo => activeSiloLetters.includes(silo.letter))
      .map(silo => {
        const state = formState[shedId]?.[silo.siloId];
        return {
          siloId: silo.siloId,
          feedType: state?.feedType || "",
          amountRemaining: parseFloat(state?.amountRemaining || "0") || 0,
          unit: state?.unit || "kg",
        };
      });
    batchCreate.mutate({ data: { readings: readingsToSave } }, {
      onSuccess: () => {
        toast({ title: `${getShedName(shedId, shed.shedGroupName)} saved` });
        queryClient.invalidateQueries({ queryKey: getGetTodayProgressQueryKey() });
      },
      onError: () => toast({ variant: "destructive", title: "Failed to save" })
    });
  };

  if (isLoading) {
    return (
      <div className="p-4 space-y-3 pt-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-48 rounded-2xl bg-card animate-pulse" />
        ))}
      </div>
    );
  }

  if (!progress) return <div className="p-4 text-muted-foreground">Failed to load.</div>;

  return (
    <div className="px-3 py-3 pb-8">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {progress.sheds.filter(shed => isShedActive(shed.shedGroupId)).map(shed => {
        const activeLetters = getActiveSiloLetters(shed.shedGroupId);
        const visibleSilos = shed.silos.filter(s => activeLetters.includes(s.letter));
        const isSaved = visibleSilos.length > 0 && visibleSilos.every(s => s.saved);

        return (
          <div
            key={shed.shedGroupId}
            className="bg-card rounded-2xl overflow-hidden border border-border/50 shadow-lg"
          >
            {/* Shed header */}
            <div className="flex items-center justify-between px-4 pt-4 pb-3">
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Sheds</p>
                <p className="text-2xl font-extrabold text-foreground leading-tight">
                  {getShedName(shed.shedGroupId, shed.shedGroupName).replace(/^Sheds?\s*/i, "")}
                </p>
              </div>
              <button
                onClick={() => !isSaved && handleSaveShed(shed.shedGroupId)}
                disabled={batchCreate.isPending}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold transition-all",
                  isSaved
                    ? "bg-primary/15 text-primary cursor-default"
                    : "bg-primary text-primary-foreground active:scale-95"
                )}
              >
                {isSaved && <Check className="w-3.5 h-3.5" />}
                {isSaved ? "Saved" : "Save"}
              </button>
            </div>

            {/* Divider */}
            <div className="h-px bg-border mx-4" />

            {/* Silos row */}
            <div className="flex gap-2 px-3 py-3">
              {visibleSilos.map((silo, idx) => {
                const colors = badgeColors(idx);
                const state = formState[shed.shedGroupId]?.[silo.siloId];
                const savedVal = silo.amountRemaining?.toString() ?? "";
                const isSiloSaved = silo.saved;

                return (
                  <div key={silo.siloId} className="flex-1 flex flex-col min-w-0">
                    {/* Label */}
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className={cn("w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-extrabold shrink-0", colors.bg, colors.text)}>
                        {silo.letter}
                      </span>
                      <span className="text-xs font-semibold text-muted-foreground truncate">{silo.name}</span>
                    </div>

                    {/* Input */}
                    <div className="relative">
                      <input
                        type="number"
                        inputMode="numeric"
                        placeholder="kg"
                        value={state?.amountRemaining ?? ""}
                        onChange={e => handleChange(shed.shedGroupId, silo.siloId, "amountRemaining", e.target.value)}
                        className={cn(
                          "w-full bg-secondary border border-border/50 rounded-xl px-3 py-3",
                          "text-lg font-bold text-foreground placeholder:text-muted-foreground/50",
                          "focus:outline-none focus:ring-2 focus:ring-primary/50 text-center",
                          "transition-all"
                        )}
                      />
                    </div>

                    {/* Saved indicator */}
                    <SavedValue value={savedVal} unit={state?.unit ?? "kg"} saved={isSiloSaved} />
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      </div>

      {/* Save all floating button — only if any active shed has unsaved silos */}
      {progress.sheds
        .filter(shed => isShedActive(shed.shedGroupId))
        .some(shed => {
          const letters = getActiveSiloLetters(shed.shedGroupId);
          return shed.silos.filter(s => letters.includes(s.letter)).some(s => !s.saved);
        }) && (
        <button
          onClick={() => {
            progress.sheds
              .filter(s => isShedActive(s.shedGroupId))
              .forEach(s => handleSaveShed(s.shedGroupId));
          }}
          disabled={batchCreate.isPending}
          className="w-full py-4 bg-primary rounded-2xl text-primary-foreground font-bold text-base active:scale-95 transition-all shadow-lg"
        >
          Save All Readings
        </button>
      )}
    </div>
  );
}
