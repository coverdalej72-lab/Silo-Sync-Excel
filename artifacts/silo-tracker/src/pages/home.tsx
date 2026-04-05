import { useGetReadingsSummary } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Link } from "wouter";
import { Plus, Database, AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function Home() {
  const { data: summaries, isLoading, error } = useGetReadingsSummary({
    query: {
      queryKey: ["/api/readings/summary"]
    }
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Current silo levels and latest readings.</p>
        </div>
        <Link href="/record" className="w-full sm:w-auto">
          <Button size="lg" className="w-full sm:w-auto text-lg h-14 sm:h-12 shadow-sm font-semibold">
            <Plus className="mr-2 h-5 w-5" />
            Record Reading
          </Button>
        </Link>
      </header>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="p-6 space-y-4">
                <Skeleton className="h-6 w-1/3" />
                <Skeleton className="h-10 w-1/2" />
                <Skeleton className="h-4 w-2/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>Failed to load silo summaries. Please try again.</AlertDescription>
        </Alert>
      ) : !summaries || summaries.length === 0 ? (
        <div className="text-center p-12 bg-card rounded-lg border border-dashed">
          <Database className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">No data yet</h2>
          <p className="text-muted-foreground mb-6">
            You don't have any silo readings. Add your first silo to get started.
          </p>
          <Link href="/silos">
            <Button variant="outline">Manage Silos</Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {summaries.map((silo) => (
            <Card key={silo.siloId} className="overflow-hidden border-border/50">
              <div className="h-2 bg-primary w-full" />
              <CardContent className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <h2 className="text-xl font-bold text-foreground">{silo.siloName}</h2>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-secondary text-secondary-foreground">
                    {silo.feedType}
                  </span>
                </div>
                
                <div className="flex items-baseline gap-2 mb-4">
                  <span className="text-4xl font-bold tracking-tight text-foreground">
                    {silo.amountRemaining}
                  </span>
                  <span className="text-lg text-muted-foreground font-medium">
                    {silo.unit}
                  </span>
                </div>

                <div className="text-sm text-muted-foreground pt-4 border-t">
                  Last updated: {format(new Date(silo.readingDate), "MMM d, yyyy 'at' h:mm a")}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}