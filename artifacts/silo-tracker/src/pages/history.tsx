import { useListReadings, useDeleteReading, getListReadingsQueryKey, getGetReadingsSummaryQueryKey } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Trash2, AlertCircle, Download } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function History() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: readings, isLoading, error } = useListReadings(undefined, {
    query: { queryKey: ["/api/readings"] }
  });

  const deleteReading = useDeleteReading();

  const handleDelete = (id: number) => {
    deleteReading.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Reading deleted" });
        queryClient.invalidateQueries({ queryKey: getListReadingsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetReadingsSummaryQueryKey() });
      },
      onError: () => {
        toast({ variant: "destructive", title: "Failed to delete" });
      }
    });
  };

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Reading History</h1>
          <p className="text-muted-foreground mt-1">Chronological log of all measurements.</p>
        </div>
        <a
          href="/api/readings/export.csv"
          download
          data-testid="button-export-csv"
        >
          <Button variant="outline" className="gap-2 shrink-0">
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </a>
      </header>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="p-4 flex items-center justify-between">
                <div className="space-y-2 w-1/2">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
                <Skeleton className="h-8 w-20" />
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
      ) : !readings || readings.length === 0 ? (
        <div className="text-center p-12 bg-card rounded-lg border border-dashed">
          <p className="text-muted-foreground">No readings recorded yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {readings.map((reading) => (
            <Card key={reading.id} className="overflow-hidden">
              <CardContent className="p-4 sm:p-6 flex flex-col sm:flex-row gap-4 justify-between sm:items-center">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-lg">{reading.siloName}</h3>
                    <span className="px-2 py-0.5 bg-secondary text-secondary-foreground text-xs font-medium rounded-full">
                      {reading.feedType}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(reading.readingDate), "MMM d, yyyy 'at' h:mm a")}
                  </p>
                  {reading.notes && (
                    <p className="text-sm text-foreground mt-2 italic bg-muted/50 p-2 rounded border-l-2 border-primary">
                      "{reading.notes}"
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-6 sm:w-1/3">
                  <div className="text-right">
                    <span className="block text-2xl font-bold">{reading.amountRemaining}</span>
                    <span className="block text-sm text-muted-foreground">{reading.unit}</span>
                  </div>
                  
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10">
                        <Trash2 className="h-5 w-5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete reading?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently remove this reading from the log. This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction 
                          onClick={() => handleDelete(reading.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}