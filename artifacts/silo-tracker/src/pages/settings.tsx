import { useGetOnedriveStatus } from "@workspace/api-client-react";
import { Cloud, CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Settings() {
  const { data: status, isLoading } = useGetOnedriveStatus({
    query: { queryKey: ["/api/onedrive/status"] }
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-1">App configuration and integrations.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cloud className="h-5 w-5" />
            OneDrive Integration
          </CardTitle>
          <CardDescription>
            Connection status for automated Excel backups
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-16 w-full rounded-md" />
          ) : (
            <div className="flex items-center p-4 rounded-lg bg-muted/50 border">
              {status?.connected ? (
                <>
                  <CheckCircle2 className="h-8 w-8 text-green-600 mr-4" />
                  <div>
                    <p className="font-semibold text-foreground">Connected</p>
                    <p className="text-sm text-muted-foreground">
                      Syncing to {status.fileName || "Excel file"}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <XCircle className="h-8 w-8 text-muted-foreground mr-4" />
                  <div>
                    <p className="font-semibold text-foreground">Disconnected</p>
                    <p className="text-sm text-muted-foreground">
                      No active OneDrive connection. Data is stored locally.
                    </p>
                  </div>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}