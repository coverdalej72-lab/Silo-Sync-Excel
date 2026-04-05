import { useListReadings, useDeleteReading, getListReadingsQueryKey, useGetOnedriveStatus, getGetOnedriveStatusQueryKey, useListDeliveries, getListDeliveriesQueryKey } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Trash2, CloudOff, FileSpreadsheet } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { exportToExcel } from "@/lib/export-excel";
import { cn } from "@/lib/utils";

const SILO_COLORS: Record<string, string> = {
  A: "bg-primary/20 text-primary",
  B: "bg-blue-500/20 text-blue-400",
  C: "bg-amber-500/20 text-amber-400",
  D: "bg-purple-500/20 text-purple-400",
};

export default function History() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [exporting, setExporting] = useState(false);

  const { data: readings, isLoading, error } = useListReadings(undefined, {
    query: { queryKey: getListReadingsQueryKey() }
  });
  const { data: deliveries } = useListDeliveries({ query: { queryKey: getListDeliveriesQueryKey() } });
  const { data: onedriveStatus } = useGetOnedriveStatus({ query: { queryKey: getGetOnedriveStatusQueryKey() } });

  const deleteReading = useDeleteReading();

  const handleDelete = (id: number) => {
    if (!confirm("Delete this reading?")) return;
    deleteReading.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Reading deleted" });
        queryClient.invalidateQueries({ queryKey: getListReadingsQueryKey() });
      },
      onError: () => toast({ variant: "destructive", title: "Failed to delete" })
    });
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportToExcel(readings ?? [], deliveries ?? []);
      toast({ title: "Excel file downloaded" });
    } catch {
      toast({ variant: "destructive", title: "Export failed" });
    } finally {
      setExporting(false);
    }
  };

  const grouped = readings?.reduce((acc, r) => {
    const d = format(new Date(r.readingDate), "yyyy-MM-dd");
    if (!acc[d]) acc[d] = [];
    acc[d].push(r);
    return acc;
  }, {} as Record<string, typeof readings>) ?? {};

  return (
    <div className="px-3 py-3 pb-8 space-y-4">
      {/* Top actions */}
      <div className="flex items-center justify-between">
        {onedriveStatus && !onedriveStatus.onedriveConnected && !onedriveStatus.gdriveConnected && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-secondary px-2.5 py-1.5 rounded-lg">
            <CloudOff className="h-3 w-3" /> Local only
          </div>
        )}
        <div className="ml-auto">
          <button
            onClick={handleExport}
            disabled={exporting || !readings?.length}
            className="flex items-center gap-2 bg-card border border-border/50 text-primary font-bold text-sm px-4 py-2.5 rounded-xl active:scale-95 transition-all disabled:opacity-40"
          >
            <FileSpreadsheet className="h-4 w-4" />
            {exporting ? "Exporting…" : "Export Excel"}
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-2xl bg-card animate-pulse" />)}
        </div>
      ) : error ? (
        <div className="bg-destructive/10 border border-destructive/30 rounded-2xl p-4 text-sm text-destructive">
          Failed to load readings history.
        </div>
      ) : readings?.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No readings recorded yet.
        </div>
      ) : (
        <div className="space-y-5">
          {Object.entries(grouped).map(([date, dayReadings]) => (
            <div key={date}>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2 px-1 sticky top-0 bg-background py-1.5">
                {format(new Date(date), "EEEE, MMM d, yyyy")}
              </p>
              <div className="bg-card border border-border/50 rounded-2xl overflow-hidden">
                {dayReadings.map((reading, idx) => (
                  <div
                    key={reading.id}
                    className={cn("flex items-center gap-3 px-4 py-3", idx > 0 && "border-t border-border/20")}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{reading.shedGroupName}</span>
                        <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded uppercase", SILO_COLORS[reading.siloLetter] ?? "bg-primary/20 text-primary")}>
                          Silo {reading.siloLetter}
                        </span>
                        {reading.feedType && (
                          <span className="text-[10px] text-muted-foreground">{reading.feedType}</span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {format(new Date(reading.readingDate), "h:mm a")}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xl font-extrabold leading-none">{reading.amountRemaining}</p>
                      <p className="text-[10px] uppercase font-bold text-muted-foreground mt-1">{reading.unit}</p>
                    </div>
                    <button
                      onClick={() => handleDelete(reading.id)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
