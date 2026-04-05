import { useListReadings, useDeleteReading, getListReadingsQueryKey, useGetOnedriveStatus, getGetOnedriveStatusQueryKey, useListDeliveries, getListDeliveriesQueryKey } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Trash2, AlertCircle, CloudOff, FileSpreadsheet } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { exportToExcel } from "@/lib/export-excel";

export default function History() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [exporting, setExporting] = useState(false);

  const { data: readings, isLoading, error } = useListReadings(undefined, {
    query: { queryKey: getListReadingsQueryKey() }
  });

  const { data: deliveries } = useListDeliveries({
    query: { queryKey: getListDeliveriesQueryKey() }
  });

  const { data: onedriveStatus } = useGetOnedriveStatus({
    query: { queryKey: getGetOnedriveStatusQueryKey() }
  });

  const deleteReading = useDeleteReading();

  const handleDelete = (id: number) => {
    if (!confirm("Delete this reading?")) return;
    deleteReading.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Reading deleted" });
        queryClient.invalidateQueries({ queryKey: getListReadingsQueryKey() });
      },
      onError: () => {
        toast({ variant: "destructive", title: "Failed to delete" });
      }
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

  const groupedReadings = readings?.reduce((acc, reading) => {
    const dateStr = format(new Date(reading.readingDate), "yyyy-MM-dd");
    if (!acc[dateStr]) acc[dateStr] = [];
    acc[dateStr].push(reading);
    return acc;
  }, {} as Record<string, typeof readings>) || {};

  return (
    <div className="p-4 space-y-6 pt-6 pb-24">
      <header className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">History</h1>
          <p className="text-sm text-muted-foreground mt-1">Past readings log.</p>
        </div>
        <div className="flex items-center gap-2">
          {onedriveStatus && !onedriveStatus.onedriveConnected && !onedriveStatus.gdriveConnected && (
            <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground bg-muted/30 px-2 py-1 rounded-md">
              <CloudOff className="h-3 w-3" /> Local only
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            className="flex items-center gap-1.5 font-bold border-primary text-primary hover:bg-primary hover:text-primary-foreground"
            onClick={handleExport}
            disabled={exporting || !readings?.length}
          >
            <FileSpreadsheet className="h-4 w-4" />
            {exporting ? "Exporting..." : "Export Excel"}
          </Button>
        </div>
      </header>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-4 space-y-2">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>Failed to load readings history.</AlertDescription>
        </Alert>
      ) : readings?.length === 0 ? (
        <div className="text-center p-8 bg-muted/50 rounded-lg border border-dashed">
          <p className="text-muted-foreground text-sm">No readings recorded yet.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(groupedReadings).map(([date, dayReadings]) => (
            <div key={date} className="space-y-3">
              <h2 className="font-bold text-sm text-muted-foreground sticky top-0 bg-background py-2">
                {format(new Date(date), "EEEE, MMM d, yyyy")}
              </h2>
              <div className="space-y-3">
                {dayReadings.map((reading) => (
                  <Card key={reading.id} className="overflow-hidden shadow-sm">
                    <CardContent className="p-4 flex gap-4 justify-between items-center">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold">{reading.shedGroupName}</span>
                          <span className="text-muted-foreground">•</span>
                          <span className="bg-primary/10 text-primary px-2 py-0.5 rounded text-xs font-bold">
                            Silo {reading.siloLetter}
                          </span>
                        </div>
                        <div className="text-sm">
                          <span className="font-medium text-foreground">{reading.feedType}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {format(new Date(reading.readingDate), "h:mm a")}
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <span className="block text-xl font-bold leading-none">{reading.amountRemaining}</span>
                          <span className="block text-[10px] uppercase font-bold text-muted-foreground mt-1">{reading.unit}</span>
                        </div>

                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 h-8 w-8 rounded-full"
                          onClick={() => handleDelete(reading.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
