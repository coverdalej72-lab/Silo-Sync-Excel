import { useGetOnedriveStatus, getGetOnedriveStatusQueryKey } from "@workspace/api-client-react";
import { Cloud, CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function CloudStatusCard({
  title,
  description,
  connected,
  fileName,
  isLoading,
}: {
  title: string;
  description: string;
  connected: boolean;
  fileName: string | null | undefined;
  isLoading: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Cloud className="h-5 w-5" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-16 w-full rounded-md" />
        ) : (
          <div className="flex items-center p-4 rounded-lg bg-muted/50 border">
            {connected ? (
              <>
                <CheckCircle2 className="h-8 w-8 text-green-600 mr-4 shrink-0" />
                <div>
                  <p className="font-semibold text-foreground">Connected</p>
                  <p className="text-sm text-muted-foreground">
                    Syncing to &quot;{fileName || "Silo Feed Readings"}&quot;
                  </p>
                </div>
              </>
            ) : (
              <>
                <XCircle className="h-8 w-8 text-muted-foreground mr-4 shrink-0" />
                <div>
                  <p className="font-semibold text-foreground">Disconnected</p>
                  <p className="text-sm text-muted-foreground">
                    No active connection. Data is stored locally only.
                  </p>
                </div>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Settings() {
  const { data: status, isLoading } = useGetOnedriveStatus({
    query: { queryKey: getGetOnedriveStatusQueryKey() },
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-1">App configuration and cloud integrations.</p>
      </header>

      <CloudStatusCard
        title="Google Drive"
        description="Readings sync to a Google Sheet in your Drive after each entry"
        connected={status?.gdriveConnected ?? false}
        fileName={status?.gdriveFileName}
        isLoading={isLoading}
      />

      <CloudStatusCard
        title="Microsoft OneDrive"
        description="Readings sync to a CSV file in your OneDrive after each entry"
        connected={status?.onedriveConnected ?? false}
        fileName={status?.onedriveFileName}
        isLoading={isLoading}
      />

      <Card>
        <CardHeader>
          <CardTitle>About</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p>Silo Feed Tracker — record silo readings from any device.</p>
          <p>All readings are saved locally and synced to any connected cloud service automatically.</p>
        </CardContent>
      </Card>
    </div>
  );
}
